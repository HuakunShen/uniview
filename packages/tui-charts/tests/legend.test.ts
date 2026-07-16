import { defaultTheme, styledLineText } from "@uniview/tui-core";
import { describe, expect, it } from "vitest";

import { renderLegend } from "../src/legend";

describe("renderLegend", () => {
  it("renders one horizontal line: swatch + name per entry", () => {
    const lines = renderLegend([{ label: "cpu", color: { r: 1, g: 2, b: 3 } }, { label: "mem" }]);
    expect(lines).toHaveLength(1);
    const text = styledLineText(lines[0]!);
    expect(text).toContain("cpu");
    expect(text).toContain("mem");
    expect(text).toContain("■");
  });

  it("colors the swatch with the entry color, defaulting to theme primary", () => {
    const lines = renderLegend([{ label: "a", color: { r: 1, g: 2, b: 3 } }, { label: "b" }]);
    const spans = lines[0]!;
    const swatches = spans.filter((s) => s.text.includes("■"));
    expect(swatches[0]!.style?.fg).toEqual({ r: 1, g: 2, b: 3 });
    expect(swatches[1]!.style?.fg).toEqual(defaultTheme.colors.primary);
  });

  it("puts one entry per line when orientation is vertical", () => {
    const lines = renderLegend([{ label: "a" }, { label: "b" }], { orientation: "vertical" });
    expect(lines).toHaveLength(2);
    expect(styledLineText(lines[0]!)).toContain("a");
    expect(styledLineText(lines[1]!)).toContain("b");
  });

  it("honors a custom swatch glyph and a clamped gap", () => {
    const lines = renderLegend([{ label: "a" }, { label: "b" }], { swatch: "●", gap: -4 });
    const text = styledLineText(lines[0]!);
    expect(text).toContain("●");
    expect(text).not.toContain("■");
    expect(text).toBe("● a● b"); // gap clamped to 0
  });
});
