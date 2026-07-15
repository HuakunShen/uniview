import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { VirtualList } from "../src/virtual-list";

import { tick } from "./tick";
const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

const items = Array.from({ length: 20 }, (_, i) => `Item ${i}`);

function App() {
  return h(VirtualList<string>, {
    items,
    height: 5,
    renderItem: (item) => h("text", { key: item }, item),
  });
}

describe("VirtualList", () => {
  it("renders only the visible window and scrolls with the keyboard", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 12, height: 6 } });
    root.render(h(App));
    await tick();

    let text = surface.text({ trimRight: true });
    expect(text).toContain("Item 0");
    expect(text).toContain("Item 4");
    expect(text).not.toContain("Item 5"); // below the viewport

    root.dispatchInput(key("Tab")); // focus the list
    root.dispatchInput(key("ArrowDown"));
    root.dispatchInput(key("ArrowDown"));
    root.dispatchInput(key("ArrowDown"));
    await tick();

    text = surface.text({ trimRight: true });
    expect(text).not.toContain("Item 0"); // scrolled above the viewport
    expect(text).toContain("Item 7");
    root.destroy();
  });
});
