import { describe, expect, it } from "vitest";
import { CellBuffer } from "../../src/buffer/cell-buffer";
import { diffFrames } from "../../src/diff/frame-diff";

function buf(width: number, height: number, draw?: (b: CellBuffer) => void): CellBuffer {
  const b = new CellBuffer(width, height);
  draw?.(b);
  return b;
}

describe("diffFrames", () => {
  it("returns no runs for identical frames", () => {
    const prev = buf(10, 2, (b) => b.writeText(0, 0, "hello", 0, 0));
    const next = buf(10, 2, (b) => b.writeText(0, 0, "hello", 0, 0));
    expect(diffFrames(prev, next)).toEqual([]);
  });

  it("returns a single-row run covering exactly the changed columns", () => {
    const prev = buf(10, 1, (b) => b.writeText(0, 0, "cat", 0, 0));
    const next = buf(10, 1, (b) => b.writeText(0, 0, "cot", 0, 0));
    expect(diffFrames(prev, next)).toEqual([{ y: 0, start: 1, end: 2 }]);
  });

  it("coalesces adjacent changed columns into one run", () => {
    const prev = buf(10, 1, (b) => b.writeText(0, 0, "aaaa", 0, 0));
    const next = buf(10, 1, (b) => b.writeText(0, 0, "abba", 0, 0));
    expect(diffFrames(prev, next)).toEqual([{ y: 0, start: 1, end: 3 }]);
  });

  it("emits separate runs when unchanged cells sit between changes", () => {
    const prev = buf(10, 1, (b) => b.writeText(0, 0, "axbxc", 0, 0));
    const next = buf(10, 1, (b) => b.writeText(0, 0, "Axbxc", 0, 0));
    // Only the first column changed here...
    expect(diffFrames(prev, next)).toEqual([{ y: 0, start: 0, end: 1 }]);

    const next2 = buf(10, 1, (b) => b.writeText(0, 0, "AxbxC", 0, 0));
    expect(diffFrames(prev, next2)).toEqual([
      { y: 0, start: 0, end: 1 },
      { y: 0, start: 4, end: 5 },
    ]);
  });

  it("expands a run left to include the lead of a changed continuation cell", () => {
    // Same lead grapheme visually, but change the wide char so the whole pair differs.
    const prev = buf(10, 1, (b) => b.writeText(0, 0, "中x", 0, 0));
    const next = buf(10, 1, (b) => b.writeText(0, 0, "文x", 0, 0));
    // Columns 0 (lead) and 1 (continuation) both differ -> one run [0,2)
    expect(diffFrames(prev, next)).toEqual([{ y: 0, start: 0, end: 2 }]);
  });

  it("expands a run right to include the continuation of a changed wide lead", () => {
    const prev = buf(10, 1, (b) => b.writeText(0, 0, "a中", 0, 0));
    const next = buf(10, 1, (b) => {
      b.writeText(0, 0, "a", 0, 0);
      b.writeText(1, 0, "文", 0, 0);
    });
    // lead at col 1 changed; continuation at col 2 must be part of the run
    expect(diffFrames(prev, next)).toEqual([{ y: 0, start: 1, end: 3 }]);
  });

  it("marks every row for a full repaint when dimensions differ", () => {
    const prev = buf(4, 2);
    const next = buf(6, 3);
    expect(diffFrames(prev, next)).toEqual([
      { y: 0, start: 0, end: 6 },
      { y: 1, start: 0, end: 6 },
      { y: 2, start: 0, end: 6 },
    ]);
  });

  it("detects changes on rows other than the first", () => {
    const prev = buf(5, 3);
    const next = buf(5, 3, (b) => b.writeText(0, 2, "hi", 0, 0));
    expect(diffFrames(prev, next)).toEqual([{ y: 2, start: 0, end: 2 }]);
  });
});
