import { createSignal, type Accessor } from "solid-js";
import { nextFocus } from "@uniview/tui-core";
import type { TuiKeyEvent } from "@uniview/tui-core";

// `nextFocus` is a pure, framework-agnostic helper that lives in
// `@uniview/tui-core`; re-exported here so tui-solid's surface mirrors
// `@uniview/tui-react`'s `focus` module.
export { nextFocus };

/** Panel focus ring returned by {@link createFocusList}. */
export interface FocusList {
  /** Index of the focused panel. */
  focused: Accessor<number>;
  setFocused: (index: number) => void;
  /** Returns true if the key was consumed (focus moved). */
  handleKey: (event: TuiKeyEvent) => boolean;
}

/**
 * Solid binding over {@link nextFocus} — the analogue of `@uniview/tui-react`'s
 * `useFocusList`, but a plain function (Solid has no hook rules: it runs once,
 * and `focused` is a signal accessor rather than a re-rendered value).
 * `handleKey` returns true iff it consumed the key.
 */
export function createFocusList(count: number, initial = 0): FocusList {
  const [focused, setFocused] = createSignal(initial);
  const handleKey = (event: TuiKeyEvent): boolean => {
    const next = nextFocus(focused(), count, event.key, event.shift);
    if (next === null) return false;
    setFocused(next);
    return true;
  };
  return { focused, setFocused: (index: number) => setFocused(index), handleKey };
}
