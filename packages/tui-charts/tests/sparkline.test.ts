import { defaultTheme, styledLineText } from "@uniview/tui-core";
import { describe, expect, it } from "vitest";

import { renderSparkline } from "../src/sparkline";

describe("renderSparkline", () => {
  it("maps values to eighth-block glyphs scaled by max, in one span", () => {
    const result = renderSparkline([0, 4, 8], { max: 8 });

    const line = result.children![0]!;
    expect(styledLineText(line.spans!)).toBe(" ▄█");
    expect(line.spans!.length).toBe(1);
  });

  it("defaults glyph color to the theme primary color", () => {
    const result = renderSparkline([1, 2, 3]);

    const line = result.children![0]!;
    expect(line.spans![0]!.style?.fg).toEqual(defaultTheme.colors.primary);
  });

  it("respects an explicit color", () => {
    const color = { r: 255, g: 0, b: 0 };
    const result = renderSparkline([1, 2, 3], { color });

    const line = result.children![0]!;
    expect(line.spans![0]!.style?.fg).toEqual(color);
  });
});
