import type { Color, RenderNode } from "@uniview/tui-core";
import {
  SubcellCanvas,
  defaultTheme,
  styledLinesToRenderNode,
} from "@uniview/tui-core";

import { dataToPixel } from "./axis";

/** One line series: a polyline over `points`, with an optional color. */
export interface LineSeries {
  /** `[x, y]` pairs, in data space, plotted in order and connected with straight segments. */
  points: readonly (readonly [number, number])[];
  /** Line color. Defaults to the theme's primary color. */
  color?: Color;
}

/** Options controlling {@link renderLineChart} sizing and data-space bounds. */
export interface PlotOptions {
  /** Plot width in cells. Defaults to 40. */
  width?: number;
  /** Plot height in cells. Defaults to 10. */
  height?: number;
  /** X-axis data bounds. Defaults to the min/max x across all series' points. */
  xBounds?: [number, number];
  /** Y-axis data bounds. Defaults to the min/max y across all series' points. */
  yBounds?: [number, number];
}

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
 * Render one or more line series onto a braille {@link SubcellCanvas} as a
 * {@link RenderNode}. Pure data → RenderNode — no React, no terminal I/O.
 */
export function renderLineChart(
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
    let prev: [number, number] | undefined;
    for (const [x, y] of s.points) {
      const px = dataToPixel(x, xBounds, canvas.widthPx);
      const py = dataToPixel(y, yBounds, canvas.heightPx);
      if (prev !== undefined) {
        canvas.line(prev[0], prev[1], px, py, col);
      } else if (s.points.length === 1) {
        canvas.set(px, py, col);
      }
      prev = [px, py];
    }
  }

  return styledLinesToRenderNode(canvas.toStyledLines());
}
