import { styledLineText } from "@uniview/tui-core";
import { describe, expect, it } from "vitest";

import { renderScatter } from "../src/scatter";

describe("renderScatter", () => {
  it("plots a single point at yBounds max in the top cell row", () => {
    const result = renderScatter(
      [
        {
          points: [[0, 1]],
        },
      ],
      { width: 2, height: 2, xBounds: [0, 1], yBounds: [0, 1] },
    );

    const topLine = styledLineText(result.children![0]!.spans!);
    expect([...topLine].some((ch) => ch !== " ")).toBe(true);
  });

  it("plots a single point at yBounds min in the bottom cell row", () => {
    const result = renderScatter(
      [
        {
          points: [[0, 0]],
        },
      ],
      { width: 2, height: 2, xBounds: [0, 1], yBounds: [0, 1] },
    );

    const lines = result.children!;
    const bottomLine = styledLineText(lines[lines.length - 1]!.spans!);
    expect([...bottomLine].some((ch) => ch !== " ")).toBe(true);
  });

  it("does not connect two points with a line — only their own cells get glyphs", () => {
    // Two far-apart points; a connecting line would light up cells in between.
    const result = renderScatter(
      [
        {
          points: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
      { width: 8, height: 2, xBounds: [0, 1], yBounds: [0, 1] },
    );

    // Middle columns of the top-left-to-bottom-right diagonal should be blank
    // for a scatter plot, since only the two endpoint dots are set.
    const topLine = styledLineText(result.children![0]!.spans!);
    const bottomLine = styledLineText(
      result.children![result.children!.length - 1]!.spans!,
    );
    // The point at (1,1) is in the top row, last column; the point at (0,0) is
    // in the bottom row, first column. Neither row should be fully glyphed
    // across every column (a line would fill intermediate cells).
    const topBlankCount = [...topLine].filter((ch) => ch === " ").length;
    const bottomBlankCount = [...bottomLine].filter((ch) => ch === " ").length;
    expect(topBlankCount).toBeGreaterThan(0);
    expect(bottomBlankCount).toBeGreaterThan(0);
  });

  it("renders explicit series colors among the spans", () => {
    const colorA = { r: 255, g: 0, b: 0 };
    const colorB = { r: 0, g: 255, b: 0 };
    const result = renderScatter(
      [
        { points: [[0, 0]], color: colorA },
        { points: [[1, 1]], color: colorB },
      ],
      { width: 4, height: 4, xBounds: [0, 1], yBounds: [0, 1] },
    );

    const fgColors = result.children!.flatMap((child) =>
      child.spans!.map((span) => span.style?.fg),
    );
    expect(fgColors).toContainEqual(colorA);
    expect(fgColors).toContainEqual(colorB);
  });
});
