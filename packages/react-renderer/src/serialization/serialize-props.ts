import type { JSONValue } from "@uniview/protocol";
import { resolveStyle, type StyleInput, type StyleProps } from "@uniview/style";
import type { HandlerRegistry } from "./handler-registry";

/**
 * Serialize props for a node, converting event handlers to handler IDs
 * and filtering out non-serializable values.
 *
 * Handler ids are deterministic (`${nodeId}:${propName}`) and the node's
 * full handler set is synced into the registry in one shot, so repeated
 * serialization of the same node never grows the registry.
 *
 * This is shared between full-tree serialization and mutation-based updates.
 */

// Warn once per prop name when a nested function is found inside an
// object/array prop — it will NOT become a handler id and silently
// crosses (or fails) the RPC boundary. Raycast-style `actions={[{...}]}`
// arrays are the classic trap; model actions as child elements instead.
const warnedNestedFunctionProps = new Set<string>();

/**
 * The Style IR travels as a derived `_style` prop, alongside the untouched
 * `className` / `style` the author wrote — the same `_`-prefix convention as
 * `_onClickHandlerId`.
 *
 * It is not merged into `style`, because `style` already means "a CSS object" to
 * the web hosts (which render it into a CSS string) and `className` already
 * means "Tailwind classes" to them. Native hosts have no CSS engine and read
 * `_style`; web hosts ignore it. One tree, both worlds.
 */
const STYLE_IR_PROP = "_style";

function styleProps(props: Record<string, unknown>): StyleProps {
  const input: StyleProps = {};
  const className = props["className"];
  const style = props["style"];

  if (typeof className === "string") {
    input.className = className;
  }
  // A boundary cast: plugin props are untrusted, and `style` is contractually
  // a StyleInput. A field the IR can't express is simply dropped below.
  if (typeof style === "object" && style !== null && !Array.isArray(style)) {
    input.style = style as StyleInput;
  }
  return input;
}

/** Resolve className+style into the Style IR, or null when the node has none. */
function styleIR(props: Record<string, unknown>): JSONValue | null {
  const input = styleProps(props);
  if (input.className === undefined && input.style === undefined) return null;

  const resolved: Record<string, JSONValue> = {};
  for (const [key, value] of Object.entries(resolveStyle(input))) {
    if (value !== undefined) resolved[key] = value;
  }
  return Object.keys(resolved).length > 0 ? resolved : null;
}

export function serializeProps(
  props: Record<string, unknown>,
  registry: HandlerRegistry,
  nodeId: string,
): Record<string, JSONValue> {
  const serializedProps: Record<string, JSONValue> = {};
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  for (const [key, value] of Object.entries(props)) {
    // Skip React-internal props
    if (key === "children" || key === "key" || key === "ref") {
      continue;
    }

    // Convert event handler functions (on[A-Z]*) to handler IDs
    if (typeof value === "function") {
      if (/^on[A-Z]/.test(key)) {
        const handlerId = `${nodeId}:${key}`;
        handlers.set(handlerId, value as (...args: unknown[]) => unknown);
        serializedProps[`_${key}HandlerId`] = handlerId;
      }
      continue;
    }
    // undefined is not a JSON value — drop it. null IS a valid JSONValue
    // (e.g. `value={null}` to clear a controlled input) and must survive.
    else if (value === undefined) {
      continue;
    } else if (value === null) {
      serializedProps[key] = null;
    }
    // Include JSON-serializable values
    else {
      try {
        let hasNestedFunction = false;
        JSON.stringify(value, (_k, v: unknown) => {
          if (typeof v === "function") {
            hasNestedFunction = true;
            return undefined;
          }
          return v;
        });
        if (hasNestedFunction && !warnedNestedFunctionProps.has(key)) {
          warnedNestedFunctionProps.add(key);
          console.warn(
            `[uniview] prop "${key}" contains nested function(s) that will NOT become event handlers — only top-level on[A-Z]* function props are converted to handler ids. Pass callbacks as top-level props or model the data as child elements.`,
          );
        }
        serializedProps[key] = value as JSONValue;
      } catch {
        // Skip values that can't be serialized
        continue;
      }
    }
  }

  const ir = styleIR(props);
  if (ir !== null) {
    serializedProps[STYLE_IR_PROP] = ir;
  }

  registry.syncNode(nodeId, handlers);

  return serializedProps;
}
