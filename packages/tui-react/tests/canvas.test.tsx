import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { MemoryCellSurface, StyleTable, type CanvasDraw, type DrawContext } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Canvas } from "../src/canvas";
import { tick } from "./tick";

const BRAILLE = /[⠀-⣿]/;

function mount(draw: CanvasDraw, marker?: "braille" | "dot" | "block" | "half-block") {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width: 8, height: 4 } });
  root.render(h(Canvas, { width: 8, height: 4, marker, draw }));
  return { root, surface };
}

describe("React <Canvas>", () => {
  it("paints braille sub-cell glyphs from the draw callback", async () => {
    const { root, surface } = mount((cv: DrawContext) => cv.line(0, 0, cv.widthPx - 1, cv.heightPx - 1));
    await tick();
    expect(BRAILLE.test(surface.text())).toBe(true);
    root.destroy();
  });

  it("honors the block marker", async () => {
    const { root, surface } = mount((cv: DrawContext) => cv.set(0, 0, { color: "red" }), "block");
    await tick();
    expect(surface.text()).toContain("█");
    root.destroy();
  });
});
