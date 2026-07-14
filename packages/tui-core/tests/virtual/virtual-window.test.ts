import { describe, expect, it } from "vitest";
import {
  computeVirtualWindow,
  VirtualListMachine,
} from "../../src/virtual/virtual-window";

describe("computeVirtualWindow", () => {
  it("returns the visible range for a top-aligned viewport", () => {
    const w = computeVirtualWindow({ itemCount: 100, itemHeight: 1, viewportHeight: 10, scrollTop: 0 });
    expect(w).toMatchObject({ startIndex: 0, endIndex: 9, totalHeight: 100 });
  });

  it("shifts the range as the viewport scrolls", () => {
    const w = computeVirtualWindow({ itemCount: 100, itemHeight: 1, viewportHeight: 10, scrollTop: 5 });
    expect(w).toMatchObject({ startIndex: 5, endIndex: 14 });
  });

  it("adds overscan on both sides, clamped to bounds", () => {
    const w = computeVirtualWindow({ itemCount: 100, itemHeight: 1, viewportHeight: 10, scrollTop: 5, overscan: 2 });
    expect(w).toMatchObject({ startIndex: 3, endIndex: 16 });

    const top = computeVirtualWindow({ itemCount: 100, itemHeight: 1, viewportHeight: 10, scrollTop: 0, overscan: 2 });
    expect(top.startIndex).toBe(0);
  });

  it("clamps scrollTop so the last page stays full", () => {
    // scrollTop 95 clamps to maxScroll (90), showing the final 10 items.
    const w = computeVirtualWindow({ itemCount: 100, itemHeight: 1, viewportHeight: 10, scrollTop: 95 });
    expect(w).toMatchObject({ startIndex: 90, endIndex: 99 });
  });

  it("accounts for multi-row items", () => {
    const w = computeVirtualWindow({ itemCount: 50, itemHeight: 2, viewportHeight: 10, scrollTop: 0 });
    // 10 rows / 2 per item = 5 items (indices 0..4)
    expect(w).toMatchObject({ startIndex: 0, endIndex: 4, totalHeight: 100 });
  });

  it("reports the render offset of the first visible item", () => {
    const w = computeVirtualWindow({ itemCount: 100, itemHeight: 1, viewportHeight: 10, scrollTop: 5, overscan: 2 });
    // first rendered item is index 3 at y = 3*1 - scrollTop(5) = -2
    expect(w.offsetY).toBe(-2);
  });
});

describe("VirtualListMachine", () => {
  it("clamps scrolling within content bounds", () => {
    const m = new VirtualListMachine({ itemCount: 100, itemHeight: 1, viewportHeight: 10 });
    expect(m.maxScroll).toBe(90); // 100 - 10
    m.scrollTo(-5);
    expect(m.scrollTop).toBe(0);
    m.scrollTo(1000);
    expect(m.scrollTop).toBe(90);
  });

  it("scrolls by a delta", () => {
    const m = new VirtualListMachine({ itemCount: 100, itemHeight: 1, viewportHeight: 10 });
    m.scrollBy(3);
    expect(m.scrollTop).toBe(3);
    m.scrollBy(-1);
    expect(m.scrollTop).toBe(2);
  });

  it("scrolls just enough to bring an item into view", () => {
    const m = new VirtualListMachine({ itemCount: 100, itemHeight: 1, viewportHeight: 10 });
    m.ensureVisible(50);
    // item 50 must be visible: scrollTop between 41 and 50
    expect(m.scrollTop).toBe(41); // bottom-aligned: 50 - (10 - 1)
    m.ensureVisible(3);
    expect(m.scrollTop).toBe(3); // top-aligned when above the viewport
  });

  it("exposes the current window", () => {
    const m = new VirtualListMachine({ itemCount: 100, itemHeight: 1, viewportHeight: 10 });
    m.scrollTo(20);
    expect(m.window()).toMatchObject({ startIndex: 20, endIndex: 29 });
  });
});
