import { describe, expect, it } from "vitest";
import { CellBuffer, StyleTable, buildFrameUpdate, HIDDEN_CURSOR } from "@uniview/tui-core";
import { DomCellSurface } from "../src/index";

const sync = (cb: () => void) => cb();

function setup(width: number, height: number, styles = new StyleTable()) {
  const container = document.createElement("div");
  const surface = new DomCellSurface(container, { styles, schedule: sync });
  surface.mount({ width, height });
  return { container, surface, styles };
}

function present(surface: DomCellSurface, prev: CellBuffer | null, next: CellBuffer) {
  surface.present(next, buildFrameUpdate(prev, next, 1, HIDDEN_CURSOR));
}

describe("DomCellSurface", () => {
  it("is a dom surface and builds one row element per line", () => {
    const { container, surface } = setup(5, 3);
    expect(surface.kind).toBe("dom");
    expect(container.querySelectorAll(".uv-term-row")).toHaveLength(3);
  });

  it("renders the frame text into rows", () => {
    const { container, surface } = setup(5, 2);
    const b = new CellBuffer(5, 2);
    b.writeText(0, 0, "hi", 0, 0);
    present(surface, null, b);

    const rows = container.querySelectorAll(".uv-term-row");
    expect(rows[0]!.textContent).toBe("hi   ");
  });

  it("updates only the dirty rows and keeps other row elements", () => {
    const { container, surface } = setup(5, 3);
    const a = new CellBuffer(5, 3);
    present(surface, null, a);
    const before = [...container.querySelectorAll(".uv-term-row")];

    const b = a.clone();
    b.writeText(0, 1, "x", 0, 0);
    surface.present(b, buildFrameUpdate(a, b, 2, HIDDEN_CURSOR));

    const after = [...container.querySelectorAll(".uv-term-row")];
    expect(after[0]).toBe(before[0]); // untouched row is the same node
    expect(after[1]).toBe(before[1]); // same div, children replaced
    expect(after[1]!.textContent).toBe("x    ");
    expect(surface.debug.lastUpdatedRows).toEqual([1]);
  });

  it("emits a styled span with a background color", () => {
    const styles = new StyleTable();
    const blue = styles.intern({ bg: "blue" });
    const { container, surface } = setup(3, 1, styles);
    const b = new CellBuffer(3, 1);
    b.writeText(0, 0, "x", blue, 0);
    present(surface, null, b);

    const span = container.querySelector(".uv-term-row span");
    expect(span).not.toBeNull();
    expect((span as HTMLElement).style.backgroundColor).not.toBe("");
  });

  it("renders text safely without interpreting HTML", () => {
    const { container, surface } = setup(6, 1);
    const b = new CellBuffer(6, 1);
    b.writeText(0, 0, "<b>x", 0, 0);
    present(surface, null, b);

    const row = container.querySelector(".uv-term-row")!;
    expect(row.querySelector("b")).toBeNull();
    expect(row.textContent).toBe("<b>x  ");
  });

  it("clears the container on destroy", () => {
    const { container, surface } = setup(3, 2);
    present(surface, null, new CellBuffer(3, 2));
    surface.destroy();
    expect(container.childNodes).toHaveLength(0);
  });
});
