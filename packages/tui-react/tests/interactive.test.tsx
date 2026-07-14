import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable, type RenderNode, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { CommandPalette, filterCommands, Hoverable, ScrollView } from "../src/interactive";

import { tick } from "./tick";
function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface };
}
const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });
const move = (x: number, y: number): TuiInputEvent => ({ type: "mouse", action: "move", button: "none", x, y, ctrl: false, alt: false, shift: false });
const wheel = (x: number, y: number, deltaY: -1 | 1): TuiInputEvent => ({ type: "mouse", action: "wheel", button: "none", x, y, deltaY, ctrl: false, alt: false, shift: false });
const click = (x: number, y: number): TuiInputEvent => ({ type: "mouse", action: "up", button: "left", x, y, ctrl: false, alt: false, shift: false });

const rowsContent = (n: number): RenderNode => ({
  type: "box",
  style: { flexDirection: "column" },
  children: Array.from({ length: n }, (_, i) => ({ type: "richtext", spans: [{ text: `line ${i}` }] })),
});

describe("ScrollView", () => {
  it("shows a window of rows and scrolls with the mouse wheel", async () => {
    const { root, surface } = mount(h(ScrollView, { content: rowsContent(20), height: 5, width: 16 }), 16, 5);
    await tick();
    expect(surface.text({ trimRight: true })).toContain("line 0");
    expect(surface.text({ trimRight: true })).not.toContain("line 9");

    root.dispatchInput(wheel(1, 1, 1)); // scroll down (3 rows/notch)
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("line 3");
    expect(text).not.toContain("line 0");
  });

  it("supports controlled scroll (parent owns scrollTop)", async () => {
    const changes: number[] = [];
    const content = rowsContent(20);
    const { root, surface } = mount(
      h(ScrollView, { content, height: 5, width: 16, scrollTop: 8, onScrollChange: (t: number) => changes.push(t) }),
      16,
      5,
    );
    await tick();
    // renders the window starting at the controlled offset
    expect(surface.text({ trimRight: true })).toContain("line 8");
    // wheel does not self-scroll; it reports a requested offset to the parent
    root.dispatchInput(wheel(1, 1, 1));
    await tick();
    expect(changes).toEqual([11]);
    expect(surface.text({ trimRight: true })).toContain("line 8"); // unchanged until parent updates
  });

  it("scrolls with the keyboard when focused", async () => {
    const { root, surface } = mount(h(ScrollView, { content: rowsContent(20), height: 4, width: 16 }), 16, 4);
    await tick();
    root.dispatchInput(key("Tab")); // focus the scroll view (only focusable)
    root.dispatchInput(key("End"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("line 19");
  });
});

describe("Hoverable", () => {
  it("exposes a hovered flag that flips on pointer enter/leave", async () => {
    // Hoverable is row 0 (full width — geometric hit-test covers the whole row);
    // row 1 is a plain sibling used as the "off it" target.
    const { root, surface } = mount(
      h(
        "box",
        { flexDirection: "column" },
        h(Hoverable, { children: (hovered: boolean) => h("text", null, hovered ? "HOT" : "cold") }),
        h("text", null, "----"),
      ),
      12,
      2,
    );
    const firstLine = () => surface.text({ trimRight: true }).split("\n")[0];
    await tick();
    expect(firstLine()).toBe("cold");

    root.dispatchInput(move(9, 0)); // anywhere on the Hoverable's row now counts
    await tick();
    expect(firstLine()).toBe("HOT");

    root.dispatchInput(move(0, 1)); // move off it, onto the sibling row
    await tick();
    expect(firstLine()).toBe("cold");
  });
});

describe("filterCommands", () => {
  const items = [
    { id: "open", label: "Open File" },
    { id: "diff", label: "Show Diff" },
    { id: "theme", label: "Toggle Theme" },
  ];
  it("filters by a case-insensitive subsequence of the label", () => {
    expect(filterCommands(items, "df").map((c) => c.id)).toEqual(["diff"]);
    expect(filterCommands(items, "the").map((c) => c.id)).toEqual(["theme"]);
    expect(filterCommands(items, "op").map((c) => c.id)).toEqual(["open"]);
    expect(filterCommands(items, "").map((c) => c.id)).toEqual(["open", "diff", "theme"]);
  });
});

describe("CommandPalette", () => {
  it("renders filtered items, highlights the selection, and selects on click", async () => {
    const selected: string[] = [];
    const items = [
      { id: "open", label: "Open File" },
      { id: "diff", label: "Show Diff" },
    ];
    const { root, surface } = mount(
      h(CommandPalette, { items, query: "", selectedIndex: 0, onSelect: (id: string) => selected.push(id) }),
      40,
      10,
    );
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("Open File");
    expect(text).toContain("Show Diff");

    // click the second item's row → onSelect("diff")
    const row = surface.text({ trimRight: true }).split("\n").findIndex((l) => l.includes("Show Diff"));
    root.dispatchInput(click(3, row));
    await tick();
    expect(selected).toEqual(["diff"]);
  });
});
