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
});
