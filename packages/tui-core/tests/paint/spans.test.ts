import { describe, expect, it } from "vitest";
import { frameToLines } from "../../src/buffer/frame";
import { StyleTable } from "../../src/style/style-table";
import { renderToBuffer, type RenderNode } from "../../src/paint/paint";

function render(root: RenderNode, width: number, height: number) {
  const styles = new StyleTable();
  return { styles, ...renderToBuffer(root, { width, height }, styles) };
}

describe("renderToBuffer — styled spans (rich text)", () => {
  it("paints each span consecutively with its own style", () => {
    const { buffer, styles } = render(
      {
        type: "richtext",
        spans: [
          { text: "const", style: { fg: "blue", bold: true } },
          { text: " ", style: {} },
          { text: "x", style: { fg: "white" } },
        ],
      },
      10,
      1,
    );

    expect(frameToLines(buffer, { trimRight: true })).toEqual(["const x"]);
    // "const" is blue+bold
    for (let x = 0; x < 5; x += 1) {
      expect(styles.get(buffer.cellAt(x, 0).styleId)).toEqual({ fg: "blue", bold: true });
    }
    // the space is default
    expect(buffer.cellAt(5, 0).styleId).toBe(0);
    // "x" is white
    expect(styles.get(buffer.cellAt(6, 0).styleId)).toEqual({ fg: "white" });
  });

  it("measures total span width so it lays out inside a row", () => {
    const { buffer } = render(
      {
        type: "box",
        style: { flexDirection: "row", gap: 1 },
        children: [
          { type: "richtext", spans: [{ text: "ab", style: { fg: "red" } }] },
          { type: "text", text: "Z" },
        ],
      },
      10,
      1,
    );
    // richtext "ab" measured as width 2, then gap 1, then "Z"
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["ab Z"]);
  });

  it("handles wide characters within a span", () => {
    const { buffer } = render(
      { type: "richtext", spans: [{ text: "你", style: { fg: "green" } }, { text: "a", style: {} }] },
      10,
      1,
    );
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["你a"]);
    // wide char occupies cells 0..1, "a" lands at cell 2
    expect(buffer.cellAt(2, 0).grapheme).toBe("a");
  });

  it("clips spans to the width of the box", () => {
    const { buffer } = render(
      {
        type: "richtext",
        style: { width: 4, height: 1 },
        spans: [
          { text: "aaa", style: { fg: "red" } },
          { text: "bbb", style: { fg: "blue" } },
        ],
      },
      10,
      1,
    );
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["aaab"]);
  });
});
