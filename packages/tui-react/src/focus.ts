import { useState } from "react";
import type { TuiKeyEvent } from "./primitives";

/**
 * Compute the next focused index for a fixed list of `count` panels. Tab cycles
 * forward (Shift+Tab backward, both wrapping); a digit `1..count` jumps to that
 * panel. Returns `null` when the key does not affect focus.
 */
export function nextFocus(
  current: number,
  count: number,
  key: string,
  shift: boolean,
): number | null {
  if (count <= 0) return null;
  if (key === "Tab")
    return shift ? (current - 1 + count) % count : (current + 1) % count;
  if (/^[0-9]$/.test(key)) {
    const n = Number(key);
    if (n >= 1 && n <= count) return n - 1;
  }
  return null;
}

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
