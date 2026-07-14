import { useState } from "react";
import { nextFocus } from "@uniview/tui-core";
import type { TuiKeyEvent } from "./primitives";

// `nextFocus` is a pure, framework-agnostic helper that lives in
// `@uniview/tui-core`; re-exported here so tui-react's public API is unchanged.
export { nextFocus };

/** React binding over {@link nextFocus}. `handleKey` returns true if it consumed the key. */
export function useFocusList(
  count: number,
  initial = 0,
): {
  focused: number;
  setFocused: (i: number) => void;
  handleKey: (event: TuiKeyEvent) => boolean;
} {
  const [focused, setFocused] = useState(initial);
  const handleKey = (event: TuiKeyEvent): boolean => {
    const next = nextFocus(focused, count, event.key, event.shift);
    if (next === null) return false;
    setFocused(next);
    return true;
  };
  return { focused, setFocused, handleKey };
}
