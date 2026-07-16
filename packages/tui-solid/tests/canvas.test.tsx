import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import {
  MemoryCellSurface,
  StyleTable,
  SvgCellSurface,
  type CanvasDraw,
  type DrawContext,
} from "@uniview/tui-core";
import { createTuiReactRoot, Canvas as RCanvas } from "@uniview/tui-react";
import { createTuiSolidRoot } from "../src/index";
import { Canvas } from "../src/canvas";
import { tick } from "./tick";

const BRAILLE = /[⠀-⣿]/;

// Parity fixture: both bindings feed it to the same pure renderCanvas.
const PARITY_SIZE = { width: 8, height: 4 } as const;
const parityDraw: CanvasDraw = (cv: DrawContext) => {
  cv.line(0, 0, cv.widthPx - 1, cv.heightPx - 1, { color: "red" });
  cv.circle(cv.widthPx / 2, cv.heightPx / 2, 3, { color: "green" });
};

describe("Solid <Canvas>", () => {
  it("paints braille sub-cell glyphs from the draw callback", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 8, height: 4 } });
    root.render(() => <Canvas width={8} height={4} draw={(cv) => cv.line(0, 0, cv.widthPx - 1, cv.heightPx - 1)} />);
    await tick();
    expect(BRAILLE.test(surface.text())).toBe(true);
    root.destroy();
  });

  it("honors the block marker", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 8, height: 4 } });
    root.render(() => <Canvas width={8} height={4} marker="block" draw={(cv) => cv.set(0, 0)} />);
    await tick();
    expect(surface.text()).toContain("█");
    root.destroy();
  });

  it("renders SVG byte-identical to the React <Canvas> (parity)", async () => {
    const rStyles = new StyleTable();
    const rSurface = new SvgCellSurface({ styles: rStyles });
    const rRoot = createTuiReactRoot({ surface: rSurface, styles: rStyles, size: PARITY_SIZE });
    rRoot.render(h(RCanvas, { width: PARITY_SIZE.width, height: PARITY_SIZE.height, draw: parityDraw }));
    await tick();
    const reactSvg = rSurface.toSVG();
    rRoot.destroy();

    const sStyles = new StyleTable();
    const sSurface = new SvgCellSurface({ styles: sStyles });
    const sRoot = createTuiSolidRoot({ surface: sSurface, styles: sStyles, size: PARITY_SIZE });
    sRoot.render(() => <Canvas width={PARITY_SIZE.width} height={PARITY_SIZE.height} draw={parityDraw} />);
    await tick();
    const solidSvg = sSurface.toSVG();
    sRoot.destroy();

    expect(solidSvg).toBe(reactSvg);
  });
});
