import { describe, expect, it } from "vitest";
import { CellBuffer } from "../../src/buffer/cell-buffer";
import { StyleTable } from "../../src/style/style-table";
import {
  frameToLines,
  frameToText,
  serializeFrame,
} from "../../src/buffer/frame";

describe("frameToLines", () => {
  it("renders each row as text, padding blanks", () => {
    const b = new CellBuffer(5, 2);
    b.writeText(0, 0, "hi", 0, 0);
    expect(frameToLines(b)).toEqual(["hi   ", "     "]);
  });

  it("trims trailing blanks when asked", () => {
    const b = new CellBuffer(5, 2);
    b.writeText(0, 0, "hi", 0, 0);
    expect(frameToLines(b, { trimRight: true })).toEqual(["hi", ""]);
  });

  it("renders a wide grapheme once, not once per cell", () => {
    const b = new CellBuffer(4, 1);
    b.writeText(0, 0, "中x", 0, 0);
    expect(frameToLines(b, { trimRight: true })).toEqual(["中x"]);
  });
});

describe("frameToText", () => {
  it("joins lines with newlines", () => {
    const b = new CellBuffer(3, 2);
    b.writeText(0, 0, "ab", 0, 0);
    b.writeText(0, 1, "cd", 0, 0);
    expect(frameToText(b, { trimRight: true })).toBe("ab\ncd");
  });
});

describe("serializeFrame", () => {
  it("captures grapheme/width/styleId/ownerId per cell plus the style palette", () => {
    const styles = new StyleTable();
    const boldId = styles.intern({ bold: true });
    const b = new CellBuffer(2, 1);
    b.writeText(0, 0, "a", boldId, 7);

    const frame = serializeFrame(b, styles);
    expect(frame.width).toBe(2);
    expect(frame.height).toBe(1);
    expect(frame.cells[0]![0]).toEqual({
      grapheme: "a",
      width: 1,
      styleId: boldId,
      ownerId: 7,
    });
    expect(frame.styles[boldId]).toEqual({ bold: true });
    expect(frame.cursor).toBeNull();
  });

  it("includes the cursor state when provided", () => {
    const styles = new StyleTable();
    const b = new CellBuffer(2, 1);
    const frame = serializeFrame(b, styles, { x: 1, y: 0, visible: true });
    expect(frame.cursor).toEqual({ x: 1, y: 0, visible: true });
  });

  it("round-trips deterministically to JSON", () => {
    const styles = new StyleTable();
    const b = new CellBuffer(3, 2);
    b.writeText(0, 0, "中", styles.intern({ fg: "cyan" }), 1);
    const a = JSON.stringify(serializeFrame(b, styles));
    const c = JSON.stringify(serializeFrame(b, styles));
    expect(a).toBe(c);
  });
});
