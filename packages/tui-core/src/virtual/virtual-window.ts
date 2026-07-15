export interface VirtualWindowOptions {
  itemCount: number;
  /** Uniform item height in rows. */
  itemHeight: number;
  /** Viewport height in rows. */
  viewportHeight: number;
  scrollTop?: number;
  /** Extra items rendered above and below the viewport. */
  overscan?: number;
}

export interface VirtualWindow {
  /** First item index to render (inclusive). */
  startIndex: number;
  /** Last item index to render (inclusive). */
  endIndex: number;
  /** Render y of `startIndex` relative to the viewport top (may be negative). */
  offsetY: number;
  /** Total content height in rows. */
  totalHeight: number;
}

/** Compute the visible (plus overscan) item range for a virtualized list. */
export function computeVirtualWindow(options: VirtualWindowOptions): VirtualWindow {
  const { itemCount, itemHeight, viewportHeight } = options;
  const overscan = options.overscan ?? 0;
  const totalHeight = itemCount * itemHeight;

  if (itemCount === 0 || itemHeight <= 0) {
    return { startIndex: 0, endIndex: -1, offsetY: 0, totalHeight };
  }

  const scrollTop = Math.max(0, Math.min(options.scrollTop ?? 0, Math.max(0, totalHeight - viewportHeight)));
  const firstVisible = Math.floor(scrollTop / itemHeight);
  const lastVisible = Math.floor((scrollTop + viewportHeight - 1) / itemHeight);

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(itemCount - 1, lastVisible + overscan);
  const offsetY = startIndex * itemHeight - scrollTop;

  return { startIndex, endIndex, offsetY, totalHeight };
}

export interface VirtualListInit extends Omit<VirtualWindowOptions, "scrollTop"> {
  scrollTop?: number;
}

/**
 * Scroll state for a virtualized list: clamps to content bounds, scrolls by
 * delta / to a position, and brings an item just into view. Pure and
 * host-local so a widget can reuse it across surfaces.
 */
export class VirtualListMachine {
  private top = 0;
  private readonly itemCount: number;
  private readonly itemHeight: number;
  private readonly viewportHeight: number;
  private readonly overscan: number;

  constructor(init: VirtualListInit) {
    this.itemCount = init.itemCount;
    this.itemHeight = init.itemHeight;
    this.viewportHeight = init.viewportHeight;
    this.overscan = init.overscan ?? 0;
    this.top = this.clamp(init.scrollTop ?? 0);
  }

  get scrollTop(): number {
    return this.top;
  }

  get maxScroll(): number {
    return Math.max(0, this.itemCount * this.itemHeight - this.viewportHeight);
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(value, this.maxScroll));
  }

  scrollTo(top: number): void {
    this.top = this.clamp(top);
  }

  scrollBy(delta: number): void {
    this.scrollTo(this.top + delta);
  }

  /** Scroll the minimum amount so item `index` is fully visible. */
  ensureVisible(index: number): void {
    const itemTop = index * this.itemHeight;
    const itemBottom = itemTop + this.itemHeight;
    if (itemTop < this.top) {
      this.scrollTo(itemTop);
    } else if (itemBottom > this.top + this.viewportHeight) {
      this.scrollTo(itemBottom - this.viewportHeight);
    }
  }

  window(): VirtualWindow {
    return computeVirtualWindow({
      itemCount: this.itemCount,
      itemHeight: this.itemHeight,
      viewportHeight: this.viewportHeight,
      scrollTop: this.top,
      overscan: this.overscan,
    });
  }
}
