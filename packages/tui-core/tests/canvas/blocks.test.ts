import { describe, expect, it } from "vitest";
import { verticalBarColumn, horizontalBarCells, VERTICAL_BLOCKS } from "../../src/canvas/blocks";

describe("verticalBarColumn", () => {
  it("fills from the bottom", () => {
    expect(verticalBarColumn(8, 8, 2)).toEqual(["█", "█"]);   // full
    expect(verticalBarColumn(4, 8, 2)).toEqual([" ", "█"]);   // half height → bottom cell full
    expect(verticalBarColumn(2, 8, 2)).toEqual([" ", "▄"]);   // quarter → bottom cell half block
    expect(verticalBarColumn(0, 8, 2)).toEqual([" ", " "]);   // empty
  });
  it("clamps and handles max<=0", () => {
    expect(verticalBarColumn(99, 8, 1)).toEqual(["█"]);
    expect(verticalBarColumn(5, 0, 1)).toEqual([" "]);
  });
});

describe("horizontalBarCells", () => {
  it("fills left to right", () => {
    expect(horizontalBarCells(4, 8, 2)).toBe("█ ");   // half of 2 cells → first full
    expect(horizontalBarCells(8, 8, 2)).toBe("██");
  });
});

describe("VERTICAL_BLOCKS", () => {
  it("has 9 levels ending in a full block", () => {
    expect(VERTICAL_BLOCKS).toHaveLength(9);
    expect(VERTICAL_BLOCKS[8]).toBe("█");
  });
});
