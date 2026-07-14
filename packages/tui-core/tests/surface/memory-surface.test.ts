import { describe, expect, it } from "vitest";
import { CellBuffer } from "../../src/buffer/cell-buffer";
import { StyleTable } from "../../src/style/style-table";
import { buildFrameUpdate, HIDDEN_CURSOR } from "../../src/surface/frame-update";
import { MemoryCellSurface } from "../../src/surface/memory-surface";

function present(surface: MemoryCellSurface, buffer: CellBuffer, revision: number) {
  surface.present(buffer, buildFrameUpdate(null, buffer, revision, HIDDEN_CURSOR));
}

describe("MemoryCellSurface", () => {
  it("identifies itself as a memory surface", () => {
    expect(new MemoryCellSurface().kind).toBe("memory");
  });

  it("records presented frames and exposes their text", () => {
    const surface = new MemoryCellSurface();
    surface.mount({ width: 5, height: 2 });

    const b = new CellBuffer(5, 2);
    b.writeText(0, 0, "hi", 0, 0);
    present(surface, b, 1);

    expect(surface.presentCount).toBe(1);
    expect(surface.lines({ trimRight: true })).toEqual(["hi", ""]);
    expect(surface.lastUpdate?.revision).toBe(1);
  });

  it("snapshots the frame so later mutations of the source do not leak in", () => {
    const surface = new MemoryCellSurface();
    surface.mount({ width: 5, height: 1 });

    const b = new CellBuffer(5, 1);
    b.writeText(0, 0, "hi", 0, 0);
    present(surface, b, 1);

    b.writeText(0, 0, "XY", 0, 0); // mutate source after presenting
    expect(surface.lines({ trimRight: true })).toEqual(["hi"]);
  });

  it("serializes cells using the shared style table", () => {
    const styles = new StyleTable();
    const boldId = styles.intern({ bold: true });
    const surface = new MemoryCellSurface({ styles });
    surface.mount({ width: 2, height: 1 });

    const b = new CellBuffer(2, 1);
    b.writeText(0, 0, "a", boldId, 4);
    present(surface, b, 1);

    const cells = surface.cells();
    expect(cells?.cells[0]?.[0]).toEqual({ grapheme: "a", width: 1, styleId: boldId, ownerId: 4 });
    expect(cells?.styles[boldId]).toEqual({ bold: true });
  });

  it("exposes which rows were painted for debugging", () => {
    const surface = new MemoryCellSurface();
    surface.mount({ width: 5, height: 3 });

    const first = new CellBuffer(5, 3);
    present(surface, first, 1);

    const second = first.clone();
    second.writeText(0, 1, "x", 0, 0);
    surface.present(second, buildFrameUpdate(first, second, 2, HIDDEN_CURSOR));

    expect(surface.debug.lastUpdatedRows).toEqual([1]);
  });

  it("clears its recorded state on destroy", () => {
    const surface = new MemoryCellSurface();
    surface.mount({ width: 2, height: 1 });
    present(surface, new CellBuffer(2, 1), 1);
    surface.destroy();
    expect(surface.lastFrame).toBeNull();
    expect(surface.cells()).toBeNull();
  });
});
