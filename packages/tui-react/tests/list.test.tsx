import { describe, expect, it } from "vitest";
import { createElement as h, useState, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { List, listCounter } from "../src/list";

import { tick } from "./tick";
const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });
const click = (x: number, y: number): TuiInputEvent => ({ type: "mouse", action: "up", button: "left", x, y, ctrl: false, alt: false, shift: false });

function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

// A controlled harness that owns selectedIndex.
function Harness({ items, height }: { items: string[]; height?: number }) {
  const [sel, setSel] = useState(0);
  return h(List<string>, { items, selectedIndex: sel, onSelect: setSel, height, width: 16 });
}

describe("listCounter", () => {
  it("formats 1-based position", () => {
    expect(listCounter(0, 8)).toBe("1 of 8");
    expect(listCounter(7, 8)).toBe("8 of 8");
    expect(listCounter(0, 0)).toBe("0 of 0");
  });
});

describe("List", () => {
  it("highlights the whole selected row (bg spans full width)", async () => {
    const { surface, styles } = mount(h(Harness, { items: ["alpha", "beta", "gamma"] }), 16, 3);
    await tick();
    const frame = surface.cells()!;
    const bgAt = (x: number) => JSON.stringify(styles.get(frame.cells[0]![x]!.styleId).bg ?? null);
    const cols = [0, 3, 8, 12, 15].map(bgAt);
    expect(new Set(cols).size).toBe(1); // uniform across the row
    expect(cols[0]).not.toBe(JSON.stringify(null)); // and it IS a color
  });

  it("moves selection with arrow keys", async () => {
    const { root, surface, styles } = mount(h(Harness, { items: ["alpha", "beta", "gamma"] }), 16, 3);
    await tick();
    root.dispatchInput(key("Tab")); // focus the List (its root box has onKeyDown, first in focus order)
    root.dispatchInput(key("ArrowDown"));
    root.dispatchInput(key("ArrowDown"));
    await tick();
    const frame = surface.cells()!;
    const bg = (y: number, x: number) => styles.get(frame.cells[y]![x]!.styleId).bg;
    expect(bg(2, 0)).toBe("blue");    // "gamma" row now selected
    expect(bg(0, 0)).toBeUndefined(); // "alpha" no longer selected
  });

  it("selects a row by clicking its empty part", async () => {
    const seen: number[] = [];
    function Clickable() {
      const [sel, setSel] = useState(0);
      return h(List<string>, {
        items: ["alpha", "beta", "gamma"], selectedIndex: sel, width: 16,
        onSelect: (i: number) => { seen.push(i); setSel(i); },
      });
    }
    const { root } = mount(h(Clickable), 16, 3);
    await tick();
    root.dispatchInput(click(13, 1)); // empty part of row 1 ("beta")
    await tick();
    expect(seen).toContain(1);
  });

  it("scrolls to keep the selection visible", async () => {
    const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const { root, surface } = mount(h(Harness, { items, height: 4 }), 16, 4);
    await tick();
    root.dispatchInput(key("Tab")); // focus the List
    for (let i = 0; i < 10; i += 1) root.dispatchInput(key("ArrowDown"));
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("item-10"); // selected row is in view
    expect(text).not.toContain("item-0"); // window scrolled past the top
  });
});
