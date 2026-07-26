/**
 * Converts Svelte component event callback arguments into JSON-safe values before
 * they cross Worker/kkrpc boundaries. DOM Event objects are not structured-cloneable.
 */
import type { JSONValue } from "@uniview/protocol";

const EVENT_ONLY_HANDLER_NAMES = new Set([
  "onClick",
  "onFocus",
  "onBlur",
  "onMouseEnter",
  "onMouseLeave",
]);

export function serializeHandlerArgs(eventName: string, args: unknown[]): JSONValue[] {
  if (args.length === 0) return [];
  if (EVENT_ONLY_HANDLER_NAMES.has(eventName) && looksLikeDomEvent(args[0])) return [];
  if ((eventName === "onInput" || eventName === "onChange") && looksLikeDomEvent(args[0])) {
    return [readTargetValue(args[0])];
  }
  if ((eventName === "onKeyDown" || eventName === "onKeyUp") && looksLikeKeyboardEvent(args[0])) {
    return [serializeKeyboardEvent(args[0])];
  }
  if (eventName === "onWheel" && looksLikeWheelEvent(args[0])) {
    return [serializeWheelEvent(args[0])];
  }
  return args.filter(isJsonValue);
}

function looksLikeDomEvent(value: unknown): value is { type?: unknown; target?: unknown; preventDefault?: unknown } {
  return value !== null && typeof value === "object" && (
    "target" in value || "currentTarget" in value || "preventDefault" in value || typeof (value as { type?: unknown }).type === "string"
  );
}

function looksLikeKeyboardEvent(value: unknown): value is {
  key?: unknown;
  code?: unknown;
  altKey?: unknown;
  ctrlKey?: unknown;
  metaKey?: unknown;
  shiftKey?: unknown;
} {
  return looksLikeDomEvent(value) && ("key" in value || "code" in value);
}

function looksLikeWheelEvent(value: unknown): value is {
  deltaY?: unknown;
  clientX?: unknown;
  clientY?: unknown;
} {
  return looksLikeDomEvent(value) && "deltaY" in value;
}

function readTargetValue(event: { target?: unknown }): JSONValue {
  const target = event.target;
  if (target !== null && typeof target === "object" && "value" in target) {
    const value = (target as { value?: unknown }).value;
    return isJsonValue(value) ? value : null;
  }
  return null;
}

function serializeKeyboardEvent(event: {
  key?: unknown;
  code?: unknown;
  altKey?: unknown;
  ctrlKey?: unknown;
  metaKey?: unknown;
  shiftKey?: unknown;
}): JSONValue {
  return {
    key: typeof event.key === "string" ? event.key : "",
    code: typeof event.code === "string" ? event.code : "",
    altKey: event.altKey === true,
    ctrlKey: event.ctrlKey === true,
    metaKey: event.metaKey === true,
    shiftKey: event.shiftKey === true,
  };
}

/**
 * Mirrors the terminal host's wheel payload field for field (`TuiWheelEvent`:
 * `deltaY`, `x`, `y` — see host-tui's InputRouter). One plugin tree must not
 * read its wheel events two different ways depending on who renders it.
 * `x`/`y` are the pointer position: client pixels on the web, cells in the TUI.
 */
function serializeWheelEvent(event: {
  deltaY?: unknown;
  clientX?: unknown;
  clientY?: unknown;
}): JSONValue {
  return {
    deltaY: typeof event.deltaY === "number" ? event.deltaY : 0,
    x: typeof event.clientX === "number" ? event.clientX : 0,
    y: typeof event.clientY === "number" ? event.clientY : 0,
  };
}

function isJsonValue(value: unknown): value is JSONValue {
  if (value === null) return true;
  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (valueType !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}
