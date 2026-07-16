import { describe, expect, it } from "vitest";
import {
  fitDimensions,
  imageToHalfBlockLines,
  resizeImage,
  type RgbaImage,
} from "../../src/index";
import { styledLineText } from "../../src/text/styled-text";

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];
const WHITE = [255, 255, 255, 255];

/** Build an RgbaImage from a row-major array of [r,g,b,a] pixels. */
function img(width: number, height: number, pixels: number[][]): RgbaImage {
  return { width, height, data: pixels.flat() };
}

describe("imageToHalfBlockLines", () => {
  it("packs two vertical pixels into one ▀ cell: fg=top, bg=bottom", () => {
    // 2×2 image → 1 cell row, 2 cells. Top row RED,GREEN; bottom row BLUE,WHITE.
    const lines = imageToHalfBlockLines(img(2, 2, [RED, GREEN, BLUE, WHITE]));
    expect(lines).toHaveLength(1);
    expect(styledLineText(lines[0]!)).toBe("▀▀");
    // Distinct (fg,bg) per cell → two spans.
    expect(lines[0]).toHaveLength(2);
    expect(lines[0]![0]!.style).toEqual({ fg: { r: 255, g: 0, b: 0 }, bg: { r: 0, g: 0, b: 255 } });
    expect(lines[0]![1]!.style).toEqual({ fg: { r: 0, g: 255, b: 0 }, bg: { r: 255, g: 255, b: 255 } });
  });

  it("merges adjacent cells that share the same fg+bg into one span", () => {
    const lines = imageToHalfBlockLines(img(2, 2, [RED, RED, RED, RED]));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(1);
    expect(styledLineText(lines[0]!)).toBe("▀▀");
    expect(lines[0]![0]!.style).toEqual({ fg: { r: 255, g: 0, b: 0 }, bg: { r: 255, g: 0, b: 0 } });
  });

  it("pads a missing bottom row (odd height) with the background color", () => {
    // 1×1 RED → one cell; bottom pixel absent → default black background.
    const lines = imageToHalfBlockLines(img(1, 1, [RED]));
    expect(lines).toHaveLength(1);
    expect(lines[0]![0]!.style).toEqual({ fg: { r: 255, g: 0, b: 0 }, bg: { r: 0, g: 0, b: 0 } });
  });
});

describe("resizeImage", () => {
  it("box-averages on downscale (2×2 → 1×1)", () => {
    const out = resizeImage(img(2, 2, [RED, GREEN, BLUE, WHITE]), 1, 1);
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    // Each channel is the mean of the four pixels: R=(255+0+0+255)/4=128, etc.
    expect(out.data[0]).toBe(128);
    expect(out.data[1]).toBe(128);
    expect(out.data[2]).toBe(128);
    expect(out.data[3]).toBe(255);
  });
});

describe("fitDimensions", () => {
  it("preserves aspect against the ~1:2 cell ratio (a cell is 1px wide × 2px tall)", () => {
    // Square image, wide budget: width binds → cols=40, rows=20 (40 wide × 40 px tall).
    expect(fitDimensions(100, 100, 40, 40)).toEqual({ cols: 40, rows: 20 });
    // Square image, short budget: rows binds → rows=10, cols=20.
    expect(fitDimensions(100, 100, 100, 10)).toEqual({ cols: 20, rows: 10 });
  });
});
