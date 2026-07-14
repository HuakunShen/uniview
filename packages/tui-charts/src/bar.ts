import type { Color, RenderNode, StyledLine } from "@uniview/tui-core";
import { defaultTheme, styledLinesToRenderNode, verticalBarColumn } from "@uniview/tui-core";

/** A single bar in a {@link renderBarChart}. */
export interface BarDatum {
  label: string;
  value: number;
  color?: Color;
}

/** Options controlling {@link renderBarChart} layout and styling. */
export interface BarChartOptions {
  /** Plot height in rows. Defaults to 8. */
  height?: number;
  /** The value that maps to a full-height bar. Defaults to the largest datum value (min 1). */
  max?: number;
  /** Number of cells each bar column occupies. Defaults to 1. */
  barWidth?: number;
  /** Number of blank cells between bar columns. Defaults to 1. */
  gap?: number;
  /** Default bar color for data without their own `color`. Defaults to the theme's success color. */
  color?: Color;
  /** Append a row of numeric values below the plot. */
  showValues?: boolean;
  /** Append a row of labels below the plot (and values, if shown). */
  showLabels?: boolean;
}

/**
 * Render a vertical bar chart as a {@link RenderNode}: one plot row per
 * eighth-block height step (top first), followed by optional label/value
 * rows. Pure data → RenderNode — no React, no terminal I/O.
 */
export function renderBarChart(data: readonly BarDatum[], options: BarChartOptions = {}): RenderNode {
  const values = data.map((datum) => datum.value);
  const max = options.max ?? Math.max(1, ...values);
  const height = options.height ?? 8;
  const barWidth = options.barWidth ?? 1;
  const gap = Math.max(0, options.gap ?? 1);
  const gapSpans = " ".repeat(gap);

  const columns = data.map((datum) => ({
    datum,
    column: verticalBarColumn(datum.value, max, height),
  }));

  const lines: StyledLine[] = [];

  for (let r = 0; r < height; r += 1) {
    const line: StyledLine = [];
    columns.forEach(({ datum, column }, i) => {
      if (i > 0 && gap > 0) line.push({ text: gapSpans });
      line.push({
        text: column[r]!.repeat(barWidth),
        style: { fg: datum.color ?? options.color ?? defaultTheme.colors.success },
      });
    });
    lines.push(line);
  }

  if (options.showLabels) {
    const line: StyledLine = [];
    data.forEach((datum, i) => {
      if (i > 0 && gap > 0) line.push({ text: gapSpans });
      line.push({ text: datum.label });
    });
    lines.push(line);
  }

  if (options.showValues) {
    const line: StyledLine = [];
    data.forEach((datum, i) => {
      if (i > 0 && gap > 0) line.push({ text: gapSpans });
      line.push({ text: String(datum.value) });
    });
    lines.push(line);
  }

  return styledLinesToRenderNode(lines);
}
