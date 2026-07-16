import type { TuiInputEvent } from "../input/events";

/** An effect the host applies after the machine processes an event. */
export type SelectionEffect = { type: "select"; index: number };

export interface SelectionInit {
  count: number;
  selectedIndex?: number;
  /** Rows a PageUp/PageDown moves; also the viewport height. Default 1. */
  pageSize?: number;
}

/**
 * A framework-neutral single-selection roving cursor over `count` rows — the
 * key logic `List` used to embed inline, promoted so `Table` and (Phase 5b)
 * `Tree` share one implementation. Arrow/Home/End/PageUp/PageDown move a clamped
 * cursor and emit a `select` effect only when it actually moves.
 *
 * Like `TextInputMachine`, it holds its own index and mutates it synchronously
 * inside `handle`, so back-to-back key events dispatched before the controlled
 * prop commits compose correctly instead of collapsing onto a stale value.
 * `setSelectedIndex` re-syncs it to the prop after each commit.
 */
export class SelectionMachine {
  private index: number;
  private count: number;
  private pageSize: number;

  constructor(init: SelectionInit) {
    this.count = init.count;
    this.pageSize = Math.max(1, init.pageSize ?? 1);
    this.index = this.clamp(init.selectedIndex ?? 0);
  }

  get selectedIndex(): number {
    return this.index;
  }

  private clamp(index: number): number {
    if (this.count <= 0) return 0;
    return Math.max(0, Math.min(index, this.count - 1));
  }

  setSelectedIndex(index: number): void {
    this.index = this.clamp(index);
  }

  setCount(count: number): void {
    this.count = count;
    this.index = this.clamp(this.index);
  }

  setPageSize(pageSize: number): void {
    this.pageSize = Math.max(1, pageSize);
  }

  handle(event: TuiInputEvent): SelectionEffect[] {
    if (event.type !== "key" || this.count <= 0) return [];
    const last = this.count - 1;
    let next = this.index;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(this.index + 1, last);
        break;
      case "ArrowUp":
        next = Math.max(this.index - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "PageDown":
        next = Math.min(this.index + this.pageSize, last);
        break;
      case "PageUp":
        next = Math.max(this.index - this.pageSize, 0);
        break;
      default:
        return [];
    }
    if (next === this.index) return [];
    this.index = next;
    return [{ type: "select", index: next }];
  }
}
