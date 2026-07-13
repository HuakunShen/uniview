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
