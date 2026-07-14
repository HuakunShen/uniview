import { describe, expect, it } from "vitest";
import { frameToLines } from "../../src/buffer/frame";
import { StyleTable } from "../../src/style/style-table";
import { renderToBuffer, type RenderNode } from "../../src/paint/paint";

function render(root: RenderNode, width: number, height: number) {
  const styles = new StyleTable();
  return { styles, ...renderToBuffer(root, { width, height }, styles) };
}

describe("renderToBuffer — absolute overlay", () => {
  it("paints an absolute child on top of in-flow content", () => {
    const { buffer } = render(
      {
        type: "box",
        style: { flexDirection: "column" },
        children: [
          { type: "text", text: "background text here" },
          {
            type: "box",
            id: "ov",
            style: { position: "absolute", top: 0, left: 0, width: 5, height: 1 },
            background: "blue",
            children: [{ type: "text", text: "OVER" }],
          },
        ],
      },
      20,
      2,
    );
    const lines = frameToLines(buffer, { trimRight: true });
    // The overlay is painted last, so "OVER" covers the start of the background line
    expect(lines[0]!.startsWith("OVER")).toBe(true);
    expect(lines[0]!.endsWith("ound text here")).toBe(true);
  });

  it("orders overlapping absolute children by zIndex", () => {
    const { buffer } = render(
      {
        type: "box",
        children: [
          {
            type: "box",
            style: { position: "absolute", top: 0, left: 0, width: 4, height: 1, zIndex: 1 },
            children: [{ type: "text", text: "LOW" }],
          },
          {
            type: "box",
            style: { position: "absolute", top: 0, left: 0, width: 4, height: 1, zIndex: 2 },
            children: [{ type: "text", text: "HI" }],
          },
        ],
      },
      6,
      1,
    );
    // zIndex 2 painted after zIndex 1 → "HI" wins the first two cells
    expect(frameToLines(buffer, { trimRight: true })[0]!.startsWith("HI")).toBe(true);
  });
});
