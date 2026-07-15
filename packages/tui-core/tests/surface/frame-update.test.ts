import { describe, expect, it } from "vitest";
import { CellBuffer } from "../../src/buffer/cell-buffer";
import { buildFrameUpdate, HIDDEN_CURSOR } from "../../src/surface/frame-update";

describe("buildFrameUpdate", () => {
  it("is a full repaint when there is no previous frame", () => {
    const next = new CellBuffer(4, 3);
    const update = buildFrameUpdate(null, next, 1, HIDDEN_CURSOR);
    expect(update.fullRepaint).toBe(true);
    expect(update.revision).toBe(1);
    expect(update.dirtyRows).toEqual([0, 1, 2]);
    expect(update.changedRuns).toHaveLength(3);
  });

  it("produces no dirty rows for identical frames", () => {
    const prev = new CellBuffer(4, 2);
    const next = new CellBuffer(4, 2);
    const update = buildFrameUpdate(prev, next, 2, HIDDEN_CURSOR);
    expect(update.fullRepaint).toBe(false);
    expect(update.dirtyRows).toEqual([]);
    expect(update.changedRuns).toEqual([]);
  });

  it("reports only the rows that changed", () => {
    const prev = new CellBuffer(5, 3);
    const next = prev.clone();
    next.writeText(0, 2, "hi", 0, 0);
    const update = buildFrameUpdate(prev, next, 3, HIDDEN_CURSOR);
    expect(update.dirtyRows).toEqual([2]);
    expect(update.fullRepaint).toBe(false);
  });

  it("forces a full repaint when dimensions differ", () => {
    const prev = new CellBuffer(4, 2);
    const next = new CellBuffer(6, 2);
    const update = buildFrameUpdate(prev, next, 4, HIDDEN_CURSOR);
    expect(update.fullRepaint).toBe(true);
    expect(update.dirtyRows).toEqual([0, 1]);
  });

  it("carries the cursor state through", () => {
    const next = new CellBuffer(3, 1);
    const update = buildFrameUpdate(null, next, 1, { x: 2, y: 0, visible: true });
    expect(update.cursor).toEqual({ x: 2, y: 0, visible: true });
  });
});
