import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable, type RenderNode } from "@uniview/tui-core";
import { createTuiSolidRoot, renderNodeToElement } from "../src/index";

const tick = () => new Promise((r) => setTimeout(r, 0));

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

/** A box wrapping a text leaf and a richtext line of two colored spans. */
const scene: RenderNode = {
  type: "box",
  style: { flexDirection: "column" },
  children: [
    { type: "text", text: "Hello", textStyle: { fg: "cyan", bold: true } },
    {
      type: "richtext",
      spans: [
        { text: "ab", style: { fg: "red" } },
        { text: "cd", style: { fg: "green" } },
      ],
    },
  ],
};

describe("renderNodeToElement", () => {
  it("renders a RenderNode tree (box → text leaf + richtext) to the surface", async () => {
    const { root, surface, styles } = mount(() => renderNodeToElement(scene), 8, 2);
    await tick();

    expect(surface.text({ trimRight: true })).toBe("Hello\nabcd");

    const frame = surface.cells()!;
    const styleAt = (x: number, y: number) => styles.get(frame.cells[y]![x]!.styleId);

    // Text leaf: `textStyle.fg` reaches the cells as the fg color (`color` prop).
    expect(styleAt(0, 0).fg).toBe("cyan");
    expect(styleAt(0, 0).bold).toBe(true);

    // Richtext: per-span colors survive as painted cell styles.
    expect(styleAt(0, 1).fg).toBe("red");
    expect(styleAt(1, 1).fg).toBe("red");
    expect(styleAt(2, 1).fg).toBe("green");
    expect(styleAt(3, 1).fg).toBe("green");

    root.destroy();
  });

  it("maps `background` (not textStyle.bg) to the backgroundColor prop", async () => {
    const node: RenderNode = {
      type: "box",
      background: "blue",
      style: { width: 4, height: 1 },
      children: [{ type: "text", text: "hi", background: "yellow", textStyle: { fg: "red" } }],
    };
    const { root, surface, styles } = mount(() => renderNodeToElement(node), 4, 1);
    await tick();

    const frame = surface.cells()!;
    const styleAt = (x: number, y: number) => styles.get(frame.cells[y]![x]!.styleId);

    expect(surface.text({ trimRight: true })).toBe("hi");
    expect(styleAt(0, 0).bg).toBe("yellow"); // text leaf's own background wins
    expect(styleAt(0, 0).fg).toBe("red");
    expect(styleAt(3, 0).bg).toBe("blue"); // box fill outside the text leaf

    root.destroy();
  });
});
