import { describe, expect, it } from "vitest";
import { StyleTable } from "../../src/style/style-table";
import { renderToBuffer, type RenderNode } from "../../src/paint/paint";
import { frameToText } from "../../src/buffer/frame";

function rowText(root: RenderNode, w: number, h: number, y: number): string {
  const styles = new StyleTable();
  const { buffer } = renderToBuffer(root, { width: w, height: h }, styles);
  return frameToText(buffer, styles, { trimRight: false }).split("\n")[y] ?? "";
}

describe("titled borders", () => {
  it("paints the title into the top border edge", () => {
    const node: RenderNode = { type: "box", style: { border: "rounded", width: 14, height: 3 }, title: "Status" };
    const top = rowText(node, 14, 3, 0);
    expect(top.startsWith("╭")).toBe(true);
    expect(top).toContain("Status");
    expect(top.endsWith("╮")).toBe(true);
  });

  it("right-aligns a footer into the bottom border edge", () => {
    const node: RenderNode = {
      type: "box",
      style: { border: "rounded", width: 14, height: 3 },
      footer: "1 of 8",
      footerAlign: "right",
    };
    const bottom = rowText(node, 14, 3, 2);
    expect(bottom.startsWith("╰")).toBe(true);
    expect(bottom.endsWith("╯")).toBe(true);
    // "1 of 8" (6 cells) sits just before the right corner (col 13): cols 7..12
    expect(bottom.slice(7, 13)).toBe("1 of 8");
  });

  it("clips a title too wide for the panel to the inner width", () => {
    const node: RenderNode = { type: "box", style: { border: "single", width: 8, height: 3 }, title: "VeryLongTitle" };
    const top = rowText(node, 8, 3, 0);
    expect(top.startsWith("┌")).toBe(true);
    expect(top.endsWith("┐")).toBe(true);
    expect([...top].length).toBe(8); // no overflow past the corners
  });
});
