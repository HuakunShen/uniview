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

  it("plots isolated dots, not a connecting line, for two far-apart points", () => {
    // Two opposite-corner points at width:8. renderScatter calls canvas.set
    // exactly twice, so the whole render has exactly TWO non-space braille
    // glyphs — one isolated dot per point. A regression that reused
    // renderLineChart's canvas.line would interpolate the diagonal and fill
    // intermediate cells, producing MORE than two glyphs. Counting the total
    // (not merely "some blanks remain") is what makes this discriminate
    // scatter from line rendering.
    const points: readonly (readonly [number, number])[] = [
      [0, 0],
      [1, 1],
    ];
    const result = renderScatter([{ points }], {
      width: 8,
      height: 2,
      xBounds: [0, 1],
      yBounds: [0, 1],
    });

    const perLineGlyphs = result.children!.map(
      (child) =>
        [...styledLineText(child.spans!)].filter((ch) => ch !== " ").length,
    );
    const totalGlyphs = perLineGlyphs.reduce((sum, n) => sum + n, 0);
    expect(totalGlyphs).toBe(points.length);

    // And the two dots land in different rows: exactly one glyph in the top
    // line (the y-max point) and one in the bottom line (the y-min point).
    expect(perLineGlyphs[0]).toBe(1);
    expect(perLineGlyphs[perLineGlyphs.length - 1]).toBe(1);
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
