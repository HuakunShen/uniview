import { describe, expect, it } from "vitest";
import { CellBuffer } from "../../src/buffer/cell-buffer";
import { StyleTable } from "../../src/style/style-table";
import { buildFrameUpdate, HIDDEN_CURSOR } from "../../src/surface/frame-update";
import { renderSvg, SvgCellSurface } from "../../src/surface/svg-surface";

describe("renderSvg", () => {
  it("emits an svg sized to the cell grid containing the text", () => {
    const styles = new StyleTable();
    const b = new CellBuffer(5, 1);
    b.writeText(0, 0, "hi", 0, 0);
    const svg = renderSvg(b, styles);

    expect(svg).toContain("<svg");
    expect(svg).toContain('width="40"'); // 5 cols * 8px
    expect(svg).toContain('height="16"'); // 1 row * 16px
    expect(svg).toContain("hi");
  });

  it("draws a background rect for cells with a background color", () => {
    const styles = new StyleTable();
    const blueBg = styles.intern({ bg: "blue" });
    const b = new CellBuffer(3, 1);
    b.writeText(0, 0, "x", blueBg, 0);
    const svg = renderSvg(b, styles);

    expect(svg).toContain("<rect");
    expect(svg).toContain('fill="#0000ee"'); // blue
  });

  it("applies foreground color to text runs", () => {
    const styles = new StyleTable();
    const red = styles.intern({ fg: "red" });
    const b = new CellBuffer(3, 1);
    b.writeText(0, 0, "hi", red, 0);
    const svg = renderSvg(b, styles);
    expect(svg).toContain('fill="#cd0000"'); // red
  });

  it("XML-escapes text content", () => {
    const styles = new StyleTable();
    const b = new CellBuffer(6, 1);
    b.writeText(0, 0, "<a&b>", 0, 0);
    const svg = renderSvg(b, styles);
    expect(svg).toContain("&lt;a&amp;b&gt;");
    expect(svg).not.toContain("<a&b>");
  });

  it("supports explicit rgb colors", () => {
    const styles = new StyleTable();
    const id = styles.intern({ fg: { r: 10, g: 20, b: 30 } });
    const b = new CellBuffer(2, 1);
    b.writeText(0, 0, "x", id, 0);
    expect(renderSvg(b, styles)).toContain('fill="rgb(10,20,30)"');
  });

  /**
   * A run coalesces same-styled cells *including the spaces between words*, and
   * SVG collapses whitespace by default — so without xml:space the glyphs after
   * an interior gap slide left and land on the wrong cells. In a two-pane TUI
   * that drags the whole right-hand pane on top of the left one.
   */
  it("preserves interior whitespace inside a text run", () => {
    const styles = new StyleTable();
    const b = new CellBuffer(8, 1);
    b.writeText(0, 0, "a    b", 0, 0);
    const svg = renderSvg(b, styles);

    expect(svg).toContain('xml:space="preserve"');
    expect(svg).toContain("a    b"); // the four spaces survive verbatim
  });

  /**
   * `font-family: monospace` is a generic family whose advance width differs per
   * machine, so glyph metrics alone cannot be trusted to stay on the cell grid —
   * error accumulates across a row. textLength pins each run to exactly the
   * pixel width of the cells it occupies.
   */
  it("pins each run to the pixel width of the cells it covers", () => {
    const styles = new StyleTable();
    const b = new CellBuffer(3, 1); // the run spans the whole row
    b.writeText(0, 0, "abc", 0, 0);
    const svg = renderSvg(b, styles, { cellWidth: 8 });

    expect(svg).toContain('textLength="24"'); // 3 cells * 8px
    expect(svg).toContain('lengthAdjust="spacing"'); // don't distort glyph shapes
  });

  /** A run's textLength must count *cells*, not characters — a wide glyph is two. */
  it("counts a wide glyph as the two cells it occupies", () => {
    const styles = new StyleTable();
    const b = new CellBuffer(2, 1);
    b.writeText(0, 0, "世", 0, 0);
    const svg = renderSvg(b, styles, { cellWidth: 8 });
    expect(svg).toContain('textLength="16"'); // 2 cells, 1 character
  });

  /** A second run must start at its true column, not wherever the first ended. */
  it("places a later run at its own column", () => {
    const styles = new StyleTable();
    const red = styles.intern({ fg: "red" });
    const b = new CellBuffer(20, 1);
    b.writeText(0, 0, "left", 0, 0);
    b.writeText(12, 0, "right", red, 0);
    const svg = renderSvg(b, styles, { cellWidth: 8 });

    const xs = [...svg.matchAll(/<text[^>]*\sx="(\d+)"/g)].map((m) => Number(m[1]));
    expect(xs).toContain(0); // "left"  at column 0
    expect(xs).toContain(96); // "right" at column 12 * 8px
  });

  /**
   * A terminal frame is mostly box-drawing and block glyphs. Served or opened as
   * a standalone .svg with no encoding hint, it is decoded as Latin-1 and every
   * one of them becomes mojibake (â”€â”€…). Inline in MDX it would inherit the
   * document charset, but the file has to stand alone too.
   */
  it("declares UTF-8 so box-drawing glyphs survive as a standalone file", () => {
    const styles = new StyleTable();
    const b = new CellBuffer(4, 1);
    b.writeText(0, 0, "\u256d\u2500\u2500\u256e", 0, 0);
    const svg = renderSvg(b, styles);

    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain("\u256d\u2500\u2500\u256e");
  });
});


describe("SvgCellSurface", () => {
  it("identifies as an svg surface and renders the presented frame", () => {
    const styles = new StyleTable();
    const surface = new SvgCellSurface({ styles });
    expect(surface.kind).toBe("svg");
    surface.mount({ width: 5, height: 1 });

    const b = new CellBuffer(5, 1);
    b.writeText(0, 0, "hi", 0, 0);
    surface.present(b, buildFrameUpdate(null, b, 1, HIDDEN_CURSOR));

    expect(surface.toSVG()).toContain("hi");
  });

  it("returns null before any frame is presented", () => {
    expect(new SvgCellSurface().toSVG()).toBeNull();
  });
});
