import type { JSONValue } from "@uniview/protocol";
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

	registry.syncNode(nodeId, handlers);

	return serializedProps;
}
