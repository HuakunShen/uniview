import { describe, expect, it } from "vitest";
import { StyleTable } from "../../src/style/style-table";
import { renderToBuffer, type RenderNode } from "../../src/paint/paint";

function render(root: RenderNode, width: number, height: number) {
  const styles = new StyleTable();
  return { styles, ...renderToBuffer(root, { width, height }, styles) };
}

describe("renderToBuffer — transparent text background composites over the fill", () => {
  it("text with no bg keeps the background of the box it sits on", () => {
    const { buffer, styles } = render(
      {
        type: "box",
        background: "blue",
        style: { width: 6, height: 1 },
        children: [{ type: "text", text: "Hi" }],
      },
      6,
      1,
    );
    // The glyph cells inherit the box fill instead of punching a hole in it.
    expect(styles.get(buffer.cellAt(0, 0).styleId)).toEqual({ bg: "blue" });
    expect(styles.get(buffer.cellAt(1, 0).styleId)).toEqual({ bg: "blue" });
    // …and the fill continues seamlessly past the text.
    expect(styles.get(buffer.cellAt(3, 0).styleId)).toEqual({ bg: "blue" });
  });

  it("keeps fg and merges the inherited bg", () => {
    const { buffer, styles } = render(
      {
        type: "box",
        background: "blue",
        style: { width: 4, height: 1 },
        children: [{ type: "text", text: "X", textStyle: { fg: "white", bold: true } }],
      },
      4,
      1,
    );
    expect(styles.get(buffer.cellAt(0, 0).styleId)).toEqual({ fg: "white", bold: true, bg: "blue" });
  });

  it("an explicit text background still wins over the fill", () => {
    const { buffer, styles } = render(
      {
        type: "box",
        background: "blue",
        style: { width: 4, height: 1 },
        children: [{ type: "text", text: "X", textStyle: { fg: "white", bg: "red" } }],
      },
      4,
      1,
    );
    expect(styles.get(buffer.cellAt(0, 0).styleId)).toEqual({ fg: "white", bg: "red" });
  });

  it("styled spans inherit the box fill when they have no bg", () => {
    const { buffer, styles } = render(
      {
        type: "box",
        background: "blue",
        style: { width: 6, height: 1 },
        children: [{ type: "richtext", spans: [{ text: "ab", style: { fg: "white" } }] }],
      },
      6,
      1,
    );
    expect(styles.get(buffer.cellAt(0, 0).styleId)).toEqual({ fg: "white", bg: "blue" });
    expect(styles.get(buffer.cellAt(4, 0).styleId)).toEqual({ bg: "blue" }); // fill past the span
  });

  it("does not invent a background where there is none", () => {
    const { buffer, styles } = render(
      { type: "box", children: [{ type: "text", text: "hi" }] },
      4,
      1,
    );
    expect(styles.get(buffer.cellAt(0, 0).styleId)).toEqual({});
  });
});
