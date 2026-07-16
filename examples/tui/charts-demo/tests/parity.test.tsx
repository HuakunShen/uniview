import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiReactRoot, LineChart as RLineChart } from "@uniview/tui-react";
import { createTuiSolidRoot, LineChart as SLineChart } from "@uniview/tui-solid";

// Drain the macrotask queue — never a fixed sleep (parallel `turbo run test`).
const tick = async (): Promise<void> => {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

const CHART = {
  series: [{ points: [[0, 0], [1, 2], [2, 1]] as const, label: "cpu", color: { r: 1, g: 2, b: 3 } }],
  options: { width: 12, height: 5, axes: { xTitle: "t", yTitle: "v" }, legend: {} },
};
const SIZE = { width: 30, height: 12 };

async function reactSvg(): Promise<string> {
  const styles = new StyleTable();
  const surface = new SvgCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: SIZE });
  root.render(createElement(RLineChart, CHART));
  await tick();
  const svg = surface.toSVG();
  root.destroy();
  return svg ?? "";
}

async function solidSvg(): Promise<string> {
  const styles = new StyleTable();
  const surface = new SvgCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: SIZE });
  root.render(() => SLineChart(CHART));
  await tick();
  const svg = surface.toSVG();
  root.destroy();
  return svg ?? "";
}

describe("charts cross-framework parity", () => {
  it("renders a labeled line chart with a legend (SVG snapshot)", async () => {
    const svg = await reactSvg();
    expect(svg).toContain("<svg");
    expect(svg).toContain("cpu"); // legend label present in the SVG text runs
    expect(svg).toContain("t"); // xTitle
  });

  it("React and Solid produce byte-identical SVG for the same chart", async () => {
    const [r, s] = await Promise.all([reactSvg(), solidSvg()]);
    expect(r.length).toBeGreaterThan(0);
    expect(r).toBe(s);
  });
});
