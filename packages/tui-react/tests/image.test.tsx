import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { MemoryCellSurface, StyleTable, type RgbaImage } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Image } from "../src/image";
import { tick } from "./tick";

// 2×2 image: top row RED,GREEN; bottom row BLUE,WHITE.
const image: RgbaImage = {
  width: 2,
  height: 2,
  data: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255],
};

describe("Image", () => {
  it("paints half-block cells with fg=upper pixel, bg=lower pixel", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 2, height: 1 } });
    root.render(h(Image, { image, maxCols: 2, maxRows: 1 }));
    await tick();

    expect(surface.text({ trimRight: true })).toContain("▀▀");
    const cell = surface.cells()!.cells[0]![0]!;
    const style = styles.get(cell.styleId);
    expect(style.fg).toEqual({ r: 255, g: 0, b: 0 }); // upper-left: red
    expect(style.bg).toEqual({ r: 0, g: 0, b: 255 }); // lower-left: blue
    root.destroy();
  });
});
