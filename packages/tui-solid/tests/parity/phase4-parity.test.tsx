import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { SvgCellSurface, StyleTable, type Size } from "@uniview/tui-core";
import { createTuiReactRoot, Scrollbar as RScrollbar } from "@uniview/tui-react";
import { createTuiSolidRoot } from "../../src/index";
import { solidScrollbar } from "./phase4-scenes";
import { tick } from "../tick";

async function reactSvg(
  size: Size,
  element: Parameters<ReturnType<typeof createTuiReactRoot>["render"]>[0],
): Promise<string> {
  const styles = new StyleTable();
  const surface = new SvgCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size });
  root.render(element);
  await tick();
  const svg = surface.toSVG() ?? "";
  root.destroy();
  return svg;
}

async function solidSvg(size: Size, App: () => unknown): Promise<string> {
  const styles = new StyleTable();
  const surface = new SvgCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size });
  root.render(App);
  await tick();
  const svg = surface.toSVG() ?? "";
  root.destroy();
  return svg;
}

describe("phase 4 — React vs Solid parity", () => {
  it("Scrollbar renders byte-identical SVG", async () => {
    const size = { width: 1, height: 10 };
    const r = await reactSvg(size, h(RScrollbar, { total: 20, height: 10, value: 4 }));
    const s = await solidSvg(size, solidScrollbar);
    expect(r).toBe(s);
  });
});
