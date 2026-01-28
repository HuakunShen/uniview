/**
 * Handler ID type for event callbacks
 * Format: h_<counter> or uuid
 */
export type HandlerId = string;

/**
 * Supported event prop names
 * These are the events that can be proxied across boundaries
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
  | "onMouseLeave";

/**
 * List of all event prop names for runtime checking
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
