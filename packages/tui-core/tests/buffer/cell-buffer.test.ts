import { describe, expect, it } from "vitest";
import { CellBuffer, CellFlags } from "../../src/buffer/cell-buffer";

describe("CellBuffer construction", () => {
  it("starts as a grid of blank single-width cells", () => {
    const buffer = new CellBuffer(3, 2);
    expect(buffer.width).toBe(3);
    expect(buffer.height).toBe(2);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const cell = buffer.cellAt(x, y);
        expect(cell).toEqual({
          grapheme: " ",
          width: 1,
          styleId: 0,
          ownerId: 0,
          flags: CellFlags.None,
        });
      }
    }
  });

  it("indexes cells in row-major order", () => {
    const buffer = new CellBuffer(4, 3);
    expect(buffer.index(0, 0)).toBe(0);
    expect(buffer.index(3, 0)).toBe(3);
    expect(buffer.index(0, 1)).toBe(4);
    expect(buffer.index(2, 2)).toBe(10);
  });
});

describe("CellBuffer.writeText", () => {
  it("writes ASCII into consecutive cells and returns the end cursor", () => {
    const buffer = new CellBuffer(10, 1);
    const end = buffer.writeText(0, 0, "hi", 5, 7);
    expect(end).toBe(2);
    expect(buffer.cellAt(0, 0)).toMatchObject({ grapheme: "h", width: 1, styleId: 5, ownerId: 7 });
    expect(buffer.cellAt(1, 0)).toMatchObject({ grapheme: "i", width: 1, styleId: 5, ownerId: 7 });
  });

  it("writes a wide grapheme as a lead cell plus a continuation cell", () => {
    const buffer = new CellBuffer(10, 1);
    const end = buffer.writeText(0, 0, "中", 3, 9);
    expect(end).toBe(2);

    const lead = buffer.cellAt(0, 0);
    expect(lead).toMatchObject({ grapheme: "中", width: 2, styleId: 3, ownerId: 9 });
    expect(lead.flags & CellFlags.Continuation).toBe(0);

    const cont = buffer.cellAt(1, 0);
    expect(cont.grapheme).toBe("");
    expect(cont.width).toBe(0);
    expect(cont.ownerId).toBe(9);
    expect(cont.flags & CellFlags.Continuation).toBe(CellFlags.Continuation);
  });

  it("attaches a lone combining mark to the preceding lead cell", () => {
    const buffer = new CellBuffer(10, 1);
    // "e" then a combining acute accent as a separate grapheme is not possible;
    // instead write "e" and then a standalone combining mark string.
    buffer.writeText(0, 0, "e", 0, 0);
    buffer.writeText(1, 0, "́", 0, 0);
    expect(buffer.cellAt(0, 0).grapheme).toBe("é");
    // No cell was consumed by the zero-width mark.
    expect(buffer.cellAt(1, 0).grapheme).toBe(" ");
  });

  it("does not write a wide grapheme that would overflow the last column", () => {
    const buffer = new CellBuffer(3, 1);
    // columns 0,1 filled by 中, column 2 is the last and cannot hold a wide char
    const end = buffer.writeText(2, 0, "中", 0, 0);
    expect(end).toBe(2);
    expect(buffer.cellAt(2, 0).grapheme).toBe(" ");
  });

  it("stops writing at the right edge", () => {
    const buffer = new CellBuffer(3, 1);
    const end = buffer.writeText(0, 0, "abcdef", 0, 0);
    expect(end).toBe(3);
    expect(buffer.cellAt(0, 0).grapheme).toBe("a");
    expect(buffer.cellAt(2, 0).grapheme).toBe("c");
  });
});

describe("CellBuffer wide-cell overwrite invariants", () => {
  it("blanks the orphaned continuation when a narrow char overwrites a wide lead", () => {
    const buffer = new CellBuffer(10, 1);
    buffer.writeText(0, 0, "中", 0, 0);
    buffer.writeText(0, 0, "x", 0, 0);
    expect(buffer.cellAt(0, 0).grapheme).toBe("x");
    // the old continuation at column 1 must be repaired to a blank
    expect(buffer.cellAt(1, 0)).toMatchObject({ grapheme: " ", width: 1 });
    expect(buffer.cellAt(1, 0).flags & CellFlags.Continuation).toBe(0);
  });

  it("blanks the orphaned lead when a narrow char overwrites a continuation", () => {
    const buffer = new CellBuffer(10, 1);
    buffer.writeText(0, 0, "中", 0, 0);
    buffer.writeText(1, 0, "y", 0, 0);
    expect(buffer.cellAt(1, 0).grapheme).toBe("y");
    // the old lead at column 0 must be repaired to a blank
    expect(buffer.cellAt(0, 0)).toMatchObject({ grapheme: " ", width: 1 });
  });
});

describe("CellBuffer.clone", () => {
  it("produces an independent deep copy", () => {
    const b = new CellBuffer(4, 1);
    b.writeText(0, 0, "中x", 2, 3);
    const copy = b.clone();

    expect(copy.width).toBe(4);
    expect(copy.height).toBe(1);
    expect(copy.cellAt(0, 0)).toEqual(b.cellAt(0, 0));
    expect(copy.cellAt(1, 0)).toEqual(b.cellAt(1, 0));

    // Mutating the original must not touch the clone.
    b.writeText(0, 0, "ab", 0, 0);
    expect(copy.cellAt(0, 0).grapheme).toBe("中");
    expect(copy.cellAt(2, 0).grapheme).toBe("x");
  });
});

describe("CellBuffer.clear", () => {
  it("resets every cell to a blank with the given style", () => {
    const buffer = new CellBuffer(2, 1);
    buffer.writeText(0, 0, "中", 3, 4);
    buffer.clear(8);
    for (let x = 0; x < 2; x += 1) {
      expect(buffer.cellAt(x, 0)).toEqual({
        grapheme: " ",
        width: 1,
        styleId: 8,
        ownerId: 0,
        flags: CellFlags.None,
      });
    }
  });
});
