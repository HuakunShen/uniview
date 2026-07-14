/**
 * Framework-agnostic TUI event types and pure UI helpers shared by every host
 * framework binding (`@uniview/tui-react`, `@uniview/tui-solid`, …). These
 * carry no framework-specific types (no `ReactNode`, no JSX) so any renderer
 * can depend on them without dragging in React, Solid, or any other UI
 * library. Framework packages re-export these verbatim to keep their public
 * API stable while composing their own `children`-bearing prop types on top.
 */

/** Keyboard event delivered to `onKeyDown`. */
export interface TuiKeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** Mouse-wheel event delivered to `onWheel`. */
export interface TuiWheelEvent {
  deltaY: number;
  x: number;
  y: number;
}

/** Pointer position delivered to click/hover handlers. */
export interface TuiPointerEvent {
  x: number;
  y: number;
}

/** Event handlers any interactive TUI element may declare. */
export interface TuiEventHandlers {
  onClick?: (event?: TuiPointerEvent) => void;
  onKeyDown?: (event: TuiKeyEvent) => void;
  onWheel?: (event: TuiWheelEvent) => void;
  onMouseEnter?: (event?: TuiPointerEvent) => void;
  onMouseLeave?: (event?: TuiPointerEvent) => void;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Semantic / automation attributes read by the host to build the accessibility
 * tree (queryByRole/Name, contract tests). All optional.
 */
export interface TuiSemanticProps {
  role?: string;
  name?: string;
  label?: string;
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
}

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

/** "N of M" position label (1-based), or "0 of 0" when empty. */
export function listCounter(selectedIndex: number, total: number): string {
  if (total <= 0) return "0 of 0";
  return `${Math.min(selectedIndex + 1, total)} of ${total}`;
}

/** Clamp a scroll offset to the valid range for a row count and viewport height. */
export function clampScroll(scrollTop: number, rowCount: number, height: number): number {
  return Math.max(0, Math.min(Math.max(0, rowCount - height), scrollTop));
}

/** Case-insensitive subsequence filter over command labels (fuzzy-ish). */
export function filterCommands<T extends { label: string }>(
  commands: readonly T[],
  query: string,
): T[] {
  const q = query.toLowerCase();
  if (q.length === 0) return [...commands];
  return commands.filter((c) => {
    const label = c.label.toLowerCase();
    let i = 0;
    for (const ch of q) {
      i = label.indexOf(ch, i);
      if (i < 0) return false;
      i += 1;
    }
    return true;
  });
}
