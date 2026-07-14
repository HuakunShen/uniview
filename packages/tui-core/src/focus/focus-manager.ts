export type FocusReason = "keyboard" | "pointer" | "programmatic";

/** A candidate for keyboard focus. */
export interface Focusable {
  id: string;
  /** Lower values come first; defaults to 0. */
  tabIndex?: number;
  disabled?: boolean;
}

/**
 * Keyboard focus state machine. Maintains a stable tab order (by ascending
 * tabIndex), excludes disabled items, cycles with wraparound, and tracks the
 * reason focus last moved so hosts can show a focus ring only for keyboard use.
 */
export class FocusManager {
  private order: Focusable[] = [];
  private current: string | null = null;
  private reason: FocusReason = "programmatic";

  get focused(): string | null {
    return this.current;
  }

  get focusReason(): FocusReason {
    return this.reason;
  }

  /**
   * Replace the set of focusables. Order is stable within equal tabIndex.
   * Focus is preserved if the focused id survives, otherwise cleared.
   */
  setFocusables(items: Focusable[]): void {
    this.order = items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => (a.item.tabIndex ?? 0) - (b.item.tabIndex ?? 0) || a.index - b.index)
      .map(({ item }) => item);

    if (this.current !== null && !this.order.some((f) => f.id === this.current)) {
      this.current = null;
    }
  }

  private enabled(): Focusable[] {
    return this.order.filter((f) => !f.disabled);
  }

  /** Focus a specific id (ignored if absent or disabled). Returns the result. */
  focus(id: string | null, reason: FocusReason = "programmatic"): string | null {
    if (id === null) {
      this.current = null;
      this.reason = reason;
      return null;
    }
    const target = this.order.find((f) => f.id === id);
    if (!target || target.disabled) return this.current;
    this.current = id;
    this.reason = reason;
    return id;
  }

  /** Move focus to the next/previous enabled item, wrapping around. */
  move(direction: "next" | "previous"): string | null {
    const candidates = this.enabled();
    if (candidates.length === 0) {
      this.current = null;
      return null;
    }

    const index = candidates.findIndex((f) => f.id === this.current);
    const delta = direction === "next" ? 1 : -1;
    const nextIndex =
      index === -1
        ? direction === "next"
          ? 0
          : candidates.length - 1
        : (index + delta + candidates.length) % candidates.length;

    this.current = candidates[nextIndex]!.id;
    this.reason = "keyboard";
    return this.current;
  }
}
