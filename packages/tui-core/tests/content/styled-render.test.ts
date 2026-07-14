import { describe, expect, it } from "vitest";
import { frameToLines } from "../../src/buffer/frame";
import { styledLinesToRenderNode } from "../../src/content/styled-render";
import { renderToBuffer } from "../../src/paint/paint";
import { StyleTable } from "../../src/style/style-table";

describe("styledLinesToRenderNode", () => {
  it("stacks styled lines into a column of rich-text leaves", () => {
    const node = styledLinesToRenderNode([
      [
        { text: "const", style: { fg: "blue" } },
        { text: " x", style: {} },
      ],
      [{ text: "  y", style: {} }],
    ]);
    const styles = new StyleTable();
    const { buffer } = renderToBuffer(node, { width: 10, height: 2 }, styles);
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["const x", "  y"]);
  });

  it("carries per-span style through to the cells", () => {
    const node = styledLinesToRenderNode([[{ text: "kw", style: { fg: "magenta", bold: true } }]]);
    const styles = new StyleTable();
    const { buffer } = renderToBuffer(node, { width: 5, height: 1 }, styles);
    expect(styles.get(buffer.cellAt(0, 0).styleId)).toEqual({ fg: "magenta", bold: true });
  });

  it("is a column box and honors id + extra style", () => {
    const node = styledLinesToRenderNode([[{ text: "a" }]], {
      id: "code-1",
      style: { padding: 1 },
    });
    expect(node.id).toBe("code-1");
    expect(node.style?.flexDirection).toBe("column");
    expect(node.style?.padding).toBe(1);
    expect(node.children).toHaveLength(1);
    expect(node.children?.[0]?.spans).toEqual([{ text: "a" }]);
  });

  it("renders an empty line as a blank rich-text row (keeps vertical rhythm)", () => {
    const node = styledLinesToRenderNode([[{ text: "a" }], [], [{ text: "b" }]]);
    const styles = new StyleTable();
    const { buffer } = renderToBuffer(node, { width: 5, height: 3 }, styles);
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["a", "", "b"]);
  });
});
