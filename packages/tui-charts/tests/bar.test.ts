import { defaultTheme, styledLineText } from "@uniview/tui-core";
import { describe, expect, it } from "vitest";

import { renderBarChart } from "../src/bar";

describe("renderBarChart", () => {
  it("plots columns bottom-up per datum, honoring gap:0", () => {
    const result = renderBarChart([{ label: "a", value: 1 }, { label: "b", value: 2 }], {
      height: 2,
      max: 2,
      gap: 0,
    });

    // verticalBarColumn(1,2,2) = [" ", "█"], verticalBarColumn(2,2,2) = ["█", "█"]
    // row 0 (top):    " " + "█" = " █"
    // row 1 (bottom): "█" + "█" = "██"
    const topRow = result.children![0]!;
    const bottomRow = result.children![1]!;
    expect(styledLineText(topRow.spans!)).toBe(" █");
    expect(styledLineText(bottomRow.spans!)).toBe("██");
  });

  it("defaults bar color to the theme success green", () => {
    const result = renderBarChart([{ label: "a", value: 1 }], { height: 1, max: 1 });

    const firstRow = result.children![0]!;
    expect(firstRow.spans![0]!.style?.fg).toEqual(defaultTheme.colors.success);
  });

  it("clamps a negative gap instead of throwing", () => {
    const result = renderBarChart([{ label: "a", value: 1 }], { gap: -5 });

    expect(result.children).toBeDefined();
    expect(result.children!.length).toBeGreaterThan(0);
    expect(styledLineText(result.children![0]!.spans!).length).toBeGreaterThan(0);
  });

  it("adds a label row and a value row when requested", () => {
    const result = renderBarChart([{ label: "a", value: 1 }, { label: "b", value: 2 }], {
      height: 1,
      max: 2,
      gap: 0,
      showLabels: true,
      showValues: true,
    });

    const lineTexts = result.children!.map((child) => styledLineText(child.spans!));
    expect(lineTexts.some((text) => text.includes("a") && text.includes("b"))).toBe(true);
    expect(lineTexts.some((text) => text.includes("1") && text.includes("2"))).toBe(true);
  });

  it("lays grouped series out as adjacent sub-columns per category", () => {
    const colorA = { r: 1, g: 0, b: 0 };
    const colorB = { r: 0, g: 1, b: 0 };
    const result = renderBarChart(
      [
        { label: "q1", value: [1, 2] },
        { label: "q2", value: [2, 1] },
      ],
      {
        height: 2,
        max: 2,
        gap: 1,
        mode: "grouped",
        series: [{ label: "A", color: colorA }, { label: "B", color: colorB }],
      },
    );

    const rows = result.children!.map((c) => styledLineText(c.spans!));
    expect(rows[1]).toBe("██ ██"); // bottom row: all four bars reach >=1 eighth block
    expect(rows[0]).toBe(" █ █ "); // top row: only the value-2 bars are full

    const fg = result.children!.flatMap((c) => c.spans!.map((s) => s.style?.fg));
    expect(fg).toContainEqual(colorA);
    expect(fg).toContainEqual(colorB);
  });

  it("stacks series into one column, series[0] on the bottom", () => {
    const colorA = { r: 1, g: 0, b: 0 };
    const colorB = { r: 0, g: 1, b: 0 };
    const result = renderBarChart([{ label: "q1", value: [1, 1] }], {
      height: 2,
      max: 2,
      mode: "stacked",
      series: [{ label: "A", color: colorA }, { label: "B", color: colorB }],
    });

    const rows = result.children!.map((c) => styledLineText(c.spans!));
    expect(rows[0]).toBe("█"); // top (series B)
    expect(rows[1]).toBe("█"); // bottom (series A)
    expect(result.children![1]!.spans![0]!.style?.fg).toEqual(colorA); // bottom = A
    expect(result.children![0]!.spans![0]!.style?.fg).toEqual(colorB); // top = B
  });

  it("appends a legend built from series when options.legend is set", () => {
    const result = renderBarChart([{ label: "q1", value: [1, 2] }], {
      height: 1,
      max: 2,
      mode: "grouped",
      series: [{ label: "A" }, { label: "B" }],
      legend: {},
    });
    const last = result.children![result.children!.length - 1]!;
    const text = styledLineText(last.spans!);
    expect(text).toContain("A");
    expect(text).toContain("B");
    expect(text).toContain("■");
  });
});
