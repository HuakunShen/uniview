import { describe, expect, it } from "vitest";
import { CellBuffer } from "../../src/buffer/cell-buffer";
import {
  extractSelectedText,
  isSelectableCell,
  normalizeSelectionRange,
} from "../../src/selection/text-selection";

function writeSelectable(
  buffer: CellBuffer,
  x: number,
  y: number,
  text: string,
): number {
  return buffer.writeText(x, y, text, 0, 0, undefined, undefined, true);
}

describe("text selection ranges", () => {
  it("normalizes reverse multi-row endpoints in visual order", () => {
    expect(normalizeSelectionRange({ x: 6, y: 2 }, { x: 2, y: 0 })).toEqual({
      start: { x: 2, y: 0 },
      end: { x: 6, y: 2 },
    });
  });

  it("normalizes reverse endpoints on the same row", () => {
    expect(normalizeSelectionRange({ x: 6, y: 1 }, { x: 2, y: 1 })).toEqual({
      start: { x: 2, y: 1 },
      end: { x: 6, y: 1 },
    });
  });
});

describe("extractSelectedText", () => {
  it("extracts a horizontal inclusive range", () => {
    const buffer = new CellBuffer(8, 1);
    writeSelectable(buffer, 0, 0, "hello");

    expect(
      extractSelectedText(buffer, {
        start: { x: 1, y: 0 },
        end: { x: 3, y: 0 },
      }),
    ).toBe("ell");
  });

  it("extracts forward and reverse multi-line ranges identically", () => {
    const buffer = new CellBuffer(8, 2);
    writeSelectable(buffer, 0, 0, "hello");
    writeSelectable(buffer, 0, 1, "world");

    const forward = extractSelectedText(buffer, {
      start: { x: 2, y: 0 },
      end: { x: 2, y: 1 },
    });
    const reverse = extractSelectedText(buffer, {
      start: { x: 2, y: 1 },
      end: { x: 2, y: 0 },
    });

    expect(forward).toBe("llo\nwor");
    expect(reverse).toBe(forward);
  });

  it("copies CJK emoji and combining graphemes once", () => {
    const buffer = new CellBuffer(10, 2);
    writeSelectable(buffer, 0, 0, "A 界");
    writeSelectable(buffer, 0, 1, "🙂 e\u0301");

    expect(
      extractSelectedText(buffer, {
        start: { x: 0, y: 0 },
        end: { x: 4, y: 1 },
      }),
    ).toBe("A 界\n🙂 e\u0301");
  });

  it("omits non-selectable layout gaps and terminal padding", () => {
    const buffer = new CellBuffer(12, 1);
    writeSelectable(buffer, 0, 0, "left");
    writeSelectable(buffer, 8, 0, "right");

    expect(
      extractSelectedText(buffer, {
        start: { x: 0, y: 0 },
        end: { x: 11, y: 0 },
      }),
    ).toBe("leftrigh");
  });

  it("returns an empty string when the range contains no selectable cells", () => {
    const buffer = new CellBuffer(4, 1);
    buffer.writeText(0, 0, "box", 0, 0);

    expect(
      extractSelectedText(buffer, {
        start: { x: 0, y: 0 },
        end: { x: 3, y: 0 },
      }),
    ).toBe("");
  });
});

describe("isSelectableCell", () => {
  it("accepts both halves of a wide selectable grapheme", () => {
    const buffer = new CellBuffer(4, 1);
    writeSelectable(buffer, 0, 0, "界");

    expect(isSelectableCell(buffer, { x: 0, y: 0 })).toBe(true);
    expect(isSelectableCell(buffer, { x: 1, y: 0 })).toBe(true);
  });

  it("rejects coordinates outside the frame", () => {
    const buffer = new CellBuffer(4, 1);
    expect(isSelectableCell(buffer, { x: -1, y: 0 })).toBe(false);
    expect(isSelectableCell(buffer, { x: 4, y: 0 })).toBe(false);
    expect(isSelectableCell(buffer, { x: 0, y: 1 })).toBe(false);
  });
});
