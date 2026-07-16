import { describe, expect, it } from "vitest";
import { CellBuffer } from "../../src/buffer/cell-buffer";
import { StyleTable } from "../../src/style/style-table";
import { buildFrameUpdate, HIDDEN_CURSOR } from "../../src/surface/frame-update";
import { AnsiCellSurface } from "../../src/surface/ansi-surface";

function capture() {
  const chunks: string[] = [];
  return {
    write: (s: string) => chunks.push(s),
    output: () => chunks.join(""),
    reset: () => (chunks.length = 0),
    bytes: () => Buffer.byteLength(chunks.join(""), "utf8"),
  };
}

describe("AnsiCellSurface", () => {
  it("identifies itself as an ansi surface", () => {
    expect(new AnsiCellSurface({ write: () => {} }).kind).toBe("ansi");
  });

  it("paints the initial frame without ever clearing the screen", () => {
    const io = capture();
    const surface = new AnsiCellSurface({ write: io.write });
    surface.mount({ width: 5, height: 2 });

    const b = new CellBuffer(5, 2);
    b.writeText(0, 0, "hi", 0, 0);
    surface.present(b, buildFrameUpdate(null, b, 1, HIDDEN_CURSOR));

    const out = io.output();
    expect(out).not.toContain("\x1b[2J"); // no clear-screen, ever
    expect(out).toContain("hi");
    expect(out).toContain("\x1b[1;1H"); // cursor home (row 1, col 1)
  });

  it("emits a tiny payload for a single-cell change, no clear", () => {
    const io = capture();
    const surface = new AnsiCellSurface({ write: io.write });
    surface.mount({ width: 80, height: 24 });

    const a = new CellBuffer(80, 24);
    a.writeText(0, 0, "Count: 0", 0, 0);
    surface.present(a, buildFrameUpdate(null, a, 1, HIDDEN_CURSOR));

    io.reset();
    const b = a.clone();
    b.writeText(7, 0, "1", 0, 0); // change the digit only
    surface.present(b, buildFrameUpdate(a, b, 2, HIDDEN_CURSOR));

    const out = io.output();
    expect(out).not.toContain("\x1b[2J");
    expect(io.bytes()).toBeLessThan(256);
    expect(out).toContain("\x1b[1;8H"); // reposition to the changed column
    expect(out).toContain("1");
  });

  it("wraps a non-empty frame in Synchronized Output so it presents atomically", () => {
    const io = capture();
    const surface = new AnsiCellSurface({ write: io.write });
    surface.mount({ width: 5, height: 1 });

    const b = new CellBuffer(5, 1);
    b.writeText(0, 0, "hi", 0, 0);
    surface.present(b, buildFrameUpdate(null, b, 1, HIDDEN_CURSOR));

    const out = io.output();
    expect(out.startsWith("\x1b[?2026h")).toBe(true); // BSU at the very start
    expect(out.endsWith("\x1b[?2026l")).toBe(true); // ESU at the very end
    expect(out.indexOf("hi")).toBeGreaterThan(0); // content sits inside the guard
  });

  it("writes nothing for an unchanged frame", () => {
    const io = capture();
    const surface = new AnsiCellSurface({ write: io.write });
    surface.mount({ width: 5, height: 1 });

    const a = new CellBuffer(5, 1);
    a.writeText(0, 0, "hi", 0, 0);
    surface.present(a, buildFrameUpdate(null, a, 1, HIDDEN_CURSOR));

    io.reset();
    const b = a.clone();
    surface.present(b, buildFrameUpdate(a, b, 2, HIDDEN_CURSOR));
    expect(io.output()).toBe("");
  });

  it("coalesces a styled run into one SGR sequence", () => {
    const io = capture();
    const styles = new StyleTable();
    const surface = new AnsiCellSurface({ write: io.write, styles });
    surface.mount({ width: 5, height: 1 });

    const red = styles.intern({ fg: "red" });
    const b = new CellBuffer(5, 1);
    b.writeText(0, 0, "hi", red, 0);
    surface.present(b, buildFrameUpdate(null, b, 1, HIDDEN_CURSOR));

    const out = io.output();
    expect(out).toContain("\x1b[0;31mhi");
    // exactly one color SGR for the run
    expect(out.match(/\x1b\[0;31m/g)).toHaveLength(1);
  });

  it("prints a wide grapheme once and skips its continuation cell", () => {
    const io = capture();
    const surface = new AnsiCellSurface({ write: io.write });
    surface.mount({ width: 5, height: 1 });

    const b = new CellBuffer(5, 1);
    b.writeText(0, 0, "中x", 0, 0);
    surface.present(b, buildFrameUpdate(null, b, 1, HIDDEN_CURSOR));

    expect(io.output()).toContain("中x");
  });

  it("shows and hides the cursor as its state changes", () => {
    const io = capture();
    const surface = new AnsiCellSurface({ write: io.write });
    surface.mount({ width: 5, height: 1 });

    const b = new CellBuffer(5, 1);
    surface.present(b, buildFrameUpdate(null, b, 1, { x: 2, y: 0, visible: true }));
    const shown = io.output();
    expect(shown).toContain("\x1b[?25h"); // show cursor
    expect(shown).toContain("\x1b[1;3H"); // positioned at the cursor

    io.reset();
    surface.present(b.clone(), buildFrameUpdate(b, b.clone(), 2, HIDDEN_CURSOR));
    expect(io.output()).toContain("\x1b[?25l"); // hidden again
  });
});
