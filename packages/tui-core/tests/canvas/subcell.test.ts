import { describe, expect, it } from "vitest";
import { SubcellCanvas } from "../../src/canvas/subcell";
import { styledLineText } from "../../src/text/styled-text";

describe("SubcellCanvas", () => {
  it("maps bottom-left origin dots to braille glyphs", () => {
    const c = new SubcellCanvas(1, 1); // 2x4 dots, one cell
    c.set(0, 0); // bottom-left dot → braille bit 0x40 → U+2840 "⡀"
    expect(styledLineText(c.toStyledLines()[0]!)).toBe("⡀");
  });
  it("sets the top-right dot", () => {
    const c = new SubcellCanvas(1, 1);
    c.set(1, 3); // top-right dot → bit 0x08 → U+2808 "⠈"
    expect(styledLineText(c.toStyledLines()[0]!)).toBe("⠈");
  });
  it("draws a diagonal line spanning cells", () => {
    const c = new SubcellCanvas(2, 1); // 4x4 dots
    c.line(0, 0, 3, 3); // bottom-left to top-right
    const line = c.toStyledLines()[0]!;
    expect(styledLineText(line).trim().length).toBeGreaterThan(0);
  });
  it("carries a per-cell color", () => {
    const c = new SubcellCanvas(1, 1);
    c.set(0, 0, { r: 1, g: 2, b: 3 });
    expect(c.toStyledLines()[0]![0]!.style?.fg).toEqual({ r: 1, g: 2, b: 3 });
  });
});
