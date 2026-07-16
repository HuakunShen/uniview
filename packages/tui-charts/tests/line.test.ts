import { styledLineText } from "@uniview/tui-core";
import { describe, expect, it } from "vitest";

import { dataToPixel } from "../src/axis";
import { renderLineChart } from "../src/line";

describe("dataToPixel", () => {
  it("maps the lower bound to 0", () => {
    expect(dataToPixel(0, [0, 1], 4)).toBe(0);
  });

  it("maps the upper bound to pixels-1", () => {
    expect(dataToPixel(1, [0, 1], 4)).toBe(3);
  });

  it("clamps values above the upper bound", () => {
    expect(dataToPixel(2, [0, 1], 4)).toBe(3);
  });

  it("clamps values below the lower bound", () => {
    expect(dataToPixel(-1, [0, 1], 4)).toBe(0);
  });

  it("does not produce NaN for a degenerate bound", () => {
    expect(Number.isNaN(dataToPixel(0.5, [1, 1], 4))).toBe(false);
  });
});

describe("renderLineChart", () => {
  it("draws a diagonal with at least one non-space braille glyph", () => {
    const result = renderLineChart(
      [
        {
          points: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
      {
        width: 2,
        height: 2,
        xBounds: [0, 1],
        yBounds: [0, 1],
      },
    );

    const lineTexts = result.children!.map((child) =>
      styledLineText(child.spans!),
    );
    const hasGlyph = lineTexts.some((text) =>
      [...text].some((ch) => ch !== " "),
    );
    expect(hasGlyph).toBe(true);
  });

  it("renders both explicit series colors among the spans", () => {
    const colorA = { r: 255, g: 0, b: 0 };
    const colorB = { r: 0, g: 255, b: 0 };
    const result = renderLineChart(
      [
        {
          points: [
            [0, 0],
            [1, 1],
          ],
          color: colorA,
        },
        {
          points: [
            [0, 1],
            [1, 0],
          ],
          color: colorB,
        },
      ],
      { width: 4, height: 4, xBounds: [0, 1], yBounds: [0, 1] },
    );

    const fgColors = result.children!.flatMap((child) =>
      child.spans!.map((span) => span.style?.fg),
    );
    expect(fgColors).toContainEqual(colorA);
    expect(fgColors).toContainEqual(colorB);
  });

  it("draws axis rule glyphs when options.axes is set", () => {
    const result = renderLineChart([{ points: [[0, 0], [1, 1]] }], {
      width: 6,
      height: 4,
      xBounds: [0, 1],
      yBounds: [0, 1],
      axes: { xTitle: "t" },
    });
    const text = result.children!.map((c) => styledLineText(c.spans!)).join("\n");
    expect(text).toContain("│"); // Y rule
    expect(text).toContain("└"); // corner
    expect(text).toContain("t"); // xTitle
  });

  it("appends a legend line built from series labels + colors", () => {
    const result = renderLineChart([{ points: [[0, 0], [1, 1]], label: "cpu", color: { r: 1, g: 2, b: 3 } }], {
      width: 6,
      height: 3,
      xBounds: [0, 1],
      yBounds: [0, 1],
      legend: {},
    });
    const last = result.children![result.children!.length - 1]!;
    expect(styledLineText(last.spans!)).toContain("cpu");
    expect(last.spans!.some((s) => s.style?.fg && s.text.includes("■"))).toBe(true);
  });
});
