import type { RenderNode } from "@uniview/tui-core";
import {
  SubcellCanvas,
  defaultTheme,
  styledLinesToRenderNode,
} from "@uniview/tui-core";

import { dataToPixel, frameChart } from "./axis";
import type { LineSeries, PlotOptions } from "./line";

function deriveBounds(series: readonly LineSeries[]): {
  xBounds: [number, number];
  yBounds: [number, number];
} {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of series) {
    for (const [x, y] of s.points) {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    xMin = 0;
    xMax = 1;
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  return { xBounds: [xMin, xMax], yBounds: [yMin, yMax] };
}

/**
 * Render one or more series as individual dots (no connecting lines) onto a
 * braille {@link SubcellCanvas} as a {@link RenderNode}. Pure data →
 * RenderNode — no React, no terminal I/O.
 */
export function renderScatter(
  series: readonly LineSeries[],
  options: PlotOptions = {},
): RenderNode {
  const width = options.width ?? 40;
  const height = options.height ?? 10;
  const derived = deriveBounds(series);
  const xBounds = options.xBounds ?? derived.xBounds;
  const yBounds = options.yBounds ?? derived.yBounds;

  const canvas = new SubcellCanvas(width, height);

  for (const s of series) {
    // Resolve the color once and reuse the same reference for every point in
    // this series — toStyledLines() merges color runs by reference equality,
    // so a fresh object per point would fragment the spans.
    const col = s.color ?? defaultTheme.colors.primary;
    for (const [x, y] of s.points) {
      const px = dataToPixel(x, xBounds, canvas.widthPx);
      const py = dataToPixel(y, yBounds, canvas.heightPx);
      canvas.set(px, py, col);
    }
  }

  const body = canvas.toStyledLines();
  const lines = options.axes ? frameChart(body, width, height, xBounds, yBounds, options.axes) : body;
  return styledLinesToRenderNode(lines);
}
