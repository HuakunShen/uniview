import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { SvgCellSurface, StyleTable, type RgbaImage, type Size } from "@uniview/tui-core";
import { createTuiReactRoot, Image as RImage } from "@uniview/tui-react";
import { createTuiSolidRoot } from "../src/index";
import { Image } from "../src/image";
import { tick } from "./tick";

// A deterministic 6×6 RGB gradient (r=x-ramp, g=y-ramp, b=const), full alpha.
const image: RgbaImage = (() => {
  const w = 6;
  const hgt = 6;
  const data: number[] = [];
  for (let y = 0; y < hgt; y += 1) {
    for (let x = 0; x < w; x += 1) {
      data.push(Math.round((x / (w - 1)) * 255), Math.round((y / (hgt - 1)) * 255), 80, 255);
    }
  }
  return { width: w, height: hgt, data };
})();

async function reactSvg(size: Size): Promise<string> {
  const styles = new StyleTable();
  const surface = new SvgCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size });
  root.render(h(RImage, { image, maxCols: 6, maxRows: 3 }));
  await tick();
  const svg = surface.toSVG() ?? "";
  root.destroy();
  return svg;
}

async function solidSvg(size: Size): Promise<string> {
  const styles = new StyleTable();
  const surface = new SvgCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size });
  root.render(() => <Image image={image} maxCols={6} maxRows={3} />);
  await tick();
  const svg = surface.toSVG() ?? "";
  root.destroy();
  return svg;
}

describe("Image — React vs Solid parity", () => {
  it("renders byte-identical SVG", async () => {
    const size = { width: 6, height: 3 };
    expect(await reactSvg(size)).toBe(await solidSvg(size));
  });
});
