import type { TuiInputEvent } from "./events";

/** ink-parity Key flags (superset: adds `alt`). All false unless the event sets them. */
export interface KeyMeta {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageUp: boolean;
  pageDown: boolean;
  return: boolean;
  escape: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

const NAMED: Readonly<Record<string, keyof KeyMeta>> = {
  ArrowUp: "upArrow",
  ArrowDown: "downArrow",
  ArrowLeft: "leftArrow",
  ArrowRight: "rightArrow",
  PageUp: "pageUp",
  PageDown: "pageDown",
  Enter: "return",
  Escape: "escape",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
};

function noKeys(): KeyMeta {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageUp: false,
    pageDown: false,
    return: false,
    escape: false,
    tab: false,
    backspace: false,
    delete: false,
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };
}

/**
 * Normalize a key/text event into ink's `(input, key)` shape. A printable
 * `text` event yields `input`; a named `key` event yields empty `input` plus
 * the matching flag and its modifiers. Shared by tui-react and tui-solid so the
 * hook behaves — and renders — identically across bindings.
 */
export function toInputKey(
  event: Extract<TuiInputEvent, { type: "key" } | { type: "text" }>,
): { input: string; key: KeyMeta } {
  const key = noKeys();
  if (event.type === "text") return { input: event.text, key };
  key.ctrl = event.ctrl;
  key.alt = event.alt;
  key.shift = event.shift;
  key.meta = event.meta;
  const named = NAMED[event.key];
  if (named) key[named] = true;
  return { input: "", key };
}
