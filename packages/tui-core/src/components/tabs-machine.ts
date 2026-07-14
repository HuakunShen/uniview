import type { TuiInputEvent } from "../input/events";

export type TabsEffect = { type: "change"; index: number };

export interface TabsInit {
  count: number;
  selectedIndex?: number;
  /** Indices that cannot be selected. */
  disabled?: readonly number[];
}

/**
 * Roving selection for tab strips (and radio groups): Left/Right (or Up/Down)
 * move the selection with wraparound, Home/End jump to the ends, and disabled
 * indices are skipped. Emits a change effect only when the selection moves.
 */
export class TabsMachine {
  private index: number;
  private readonly count: number;
  private readonly disabled: Set<number>;

  constructor(init: TabsInit) {
    this.count = init.count;
    this.disabled = new Set(init.disabled ?? []);
    this.index = init.selectedIndex ?? this.firstEnabled();
  }

  get selectedIndex(): number {
    return this.index;
  }

  setSelectedIndex(index: number): void {
    if (index >= 0 && index < this.count && !this.disabled.has(index)) {
      this.index = index;
    }
  }

  private firstEnabled(): number {
    for (let i = 0; i < this.count; i += 1) {
      if (!this.disabled.has(i)) return i;
    }
    return 0;
  }

  private step(from: number, direction: 1 | -1): number {
    for (let i = 1; i <= this.count; i += 1) {
      const candidate = (from + direction * i + this.count * i) % this.count;
      if (!this.disabled.has(candidate)) return candidate;
    }
    return from;
  }

  handle(event: TuiInputEvent): TabsEffect[] {
    if (event.type !== "key") return [];

    let next = this.index;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = this.step(this.index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = this.step(this.index, -1);
        break;
      case "Home":
        next = this.firstEnabled();
        break;
      case "End":
        next = this.step(0, -1);
        break;
      default:
        return [];
    }

    if (next === this.index) return [];
    this.index = next;
    return [{ type: "change", index: next }];
  }
}
