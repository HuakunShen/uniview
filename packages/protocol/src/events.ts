/**
 * Handler ID type for event callbacks.
 *
 * Both renderers mint it as `${nodeId}:${propName}` — e.g. `"button-1:onClick"`.
 * The format is deterministic on purpose: re-serializing a node reuses the same
 * id, so the plugin-side handler registry is overwritten in place instead of
 * growing, and an event that arrives after a re-render runs that node's latest
 * handler. Only the renderer that minted an id may parse it; to a host it is an
 * opaque string handed back verbatim to `executeHandler`.
 */
export type HandlerId = string;

/**
 * The DOM-style event prop names hosts auto-wire to real input events.
 *
 * This is NOT the closed set of handler props that may cross the boundary. A
 * renderer mints a handler id for every top-level `on[A-Z]*` function prop, and
 * hosts bind app-level ones by name — AppKit wires `_onSelectHandlerId` on menu
 * items and `_onActionHandlerId` / `_onSearchTextChangeHandlerId` /
 * `_onSelectionChangeHandlerId` on the Raycast-style surfaces, and the Svelte
 * host relays any handler id prop it does not recognize to the registered
 * component. This list is the subset that gets automatic click/key/focus
 * plumbing; everything else is the component contract's business.
 */
export type EventPropName =
  | "onClick"
  | "onChange"
  | "onInput"
  | "onSubmit"
  | "onFocus"
  | "onBlur"
  | "onKeyDown"
  | "onKeyUp"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onWheel";

/**
 * The payload an `onKeyDown` handler receives.
 *
 * Deliberately a subset of the DOM's `KeyboardEvent`, field for field: the same
 * plugin tree renders on a web host, where `onKeyDown` is handed the real thing.
 * A native host that invented its own field names would mean one tree that reads
 * its keys two different ways depending on who renders it.
 *
 * Native hosts only send keys the node *declared* (`keyDownEvents`) — see the
 * prop's documentation. `key` is the declared name (`"Escape"`, `"ArrowDown"`).
 */
export interface KeyDownEvent {
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  repeat: boolean;
}

/**
 * Runtime form of {@link EventPropName} — the DOM-style events, not every
 * handler prop. See that type before using this as a filter.
 */
export const EVENT_PROPS: readonly EventPropName[] = [
  "onClick",
  "onChange",
  "onInput",
  "onSubmit",
  "onFocus",
  "onBlur",
  "onKeyDown",
  "onKeyUp",
  "onMouseEnter",
  "onMouseLeave",
  "onWheel",
] as const;

/**
 * Convert an event prop name to its handler ID prop name
 * e.g., 'onClick' -> '_onClickHandlerId'
 */
export function handlerIdProp(eventProp: EventPropName): string {
  return `_${eventProp}HandlerId`;
}

/**
 * Check if a prop name is a handler ID prop
 * e.g., '_onClickHandlerId' -> true
 */
export function isHandlerIdProp(propName: string): boolean {
  return propName.startsWith("_") && propName.endsWith("HandlerId");
}

/**
 * Extract the event name from a handler ID prop name
 * e.g., '_onClickHandlerId' -> 'onClick'
 *
 * Returns null for a handler id prop outside {@link EVENT_PROPS} — meaning "not
 * a DOM event I can auto-wire", NOT "dead prop". `_onActionHandlerId` lands
 * here and is still bound by name on the AppKit and Svelte hosts, so a caller
 * filtering on this must pass the unrecognized ones through rather than drop
 * them (see host-svelte's ComponentRenderer).
 */
const HANDLER_ID_PREFIX_LENGTH = 1;
const HANDLER_ID_SUFFIX_LENGTH = 9;

export function extractEventName(handlerIdProp: string): EventPropName | null {
  if (!isHandlerIdProp(handlerIdProp)) return null;
  const eventName = handlerIdProp.slice(
    HANDLER_ID_PREFIX_LENGTH,
    -HANDLER_ID_SUFFIX_LENGTH,
  );
  if (EVENT_PROPS.includes(eventName as EventPropName)) {
    return eventName as EventPropName;
  }
  return null;
}
