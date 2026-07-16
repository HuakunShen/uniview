import { describe, expect, it } from "vitest";
import { dataToPixel } from "../../src/canvas/coords";

describe("dataToPixel", () => {
  it("maps the lower bound to 0", () => {
    expect(dataToPixel(0, [0, 1], 4)).toBe(0);
  });
  it("maps the upper bound to pixels-1", () => {
    expect(dataToPixel(1, [0, 1], 4)).toBe(3);
  });
  it("clamps out-of-range values to the ends", () => {
    expect(dataToPixel(2, [0, 1], 4)).toBe(3);
    expect(dataToPixel(-1, [0, 1], 4)).toBe(0);
  });
  it("does not produce NaN for a degenerate bound", () => {
    expect(Number.isNaN(dataToPixel(0.5, [1, 1], 4))).toBe(false);
  });
});
