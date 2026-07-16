import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { SvgCellSurface, StyleTable, type Size } from "@uniview/tui-core";
import {
  createTuiReactRoot,
  LineGauge as RLineGauge,
  Scrollbar as RScrollbar,
  TextInput as RTextInput,
} from "@uniview/tui-react";
import { createTuiSolidRoot } from "../../src/index";
import { solidLineGauge, solidScrollbar, solidTextInput } from "./phase4-scenes";
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

  it("LineGauge renders byte-identical SVG", async () => {
    const size = { width: 24, height: 1 };
    const r = await reactSvg(size, h(RLineGauge, { fraction: 0.6, options: { width: 10, label: "Load" } }));
    const s = await solidSvg(size, solidLineGauge);
    expect(r).toBe(s);
  });

  it("TextInput renders byte-identical SVG", async () => {
    const size = { width: 10, height: 1 };
    const r = await reactSvg(size, h(RTextInput, { value: "hi", onChange: () => {} }));
    const s = await solidSvg(size, solidTextInput);
    expect(r).toBe(s);
  });
});
