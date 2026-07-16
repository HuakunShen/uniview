import type { Color, RenderNode, StyledLine } from "@uniview/tui-core";
import { VERTICAL_BLOCKS, defaultTheme, styledLinesToRenderNode, verticalBarColumn } from "@uniview/tui-core";

import { renderLegend, type LegendEntry, type LegendOptions } from "./legend";

/** Per-series metadata for grouped/stacked charts. */
export interface BarSeries {
  label: string;
  color?: Color;
}

/** A single category in a {@link renderBarChart}. */
export interface BarDatum {
  label: string;
  /** A single bar's value, or one value per series for grouped/stacked charts. */
  value: number | readonly number[];
  /** Color for a single-value datum. Ignored when `value` is an array. */
  color?: Color;
}

/** Options controlling {@link renderBarChart} layout and styling. */
export interface BarChartOptions {
  /** Plot height in rows. Defaults to 8. */
  height?: number;
  /** The value that maps to a full-height bar. Defaults to the largest value (min 1). */
  max?: number;
  /** Number of cells each bar column occupies. Defaults to 1. */
  barWidth?: number;
  /** Number of blank cells between categories. Defaults to 1. */
  gap?: number;
  /** Default bar color for data without their own `color`. Defaults to the theme's success color. */
  color?: Color;
  /** Append a row of numeric values below the plot. */
  showValues?: boolean;
  /** Append a row of labels below the plot (and values, if shown). */
  showLabels?: boolean;
  /** Layout for multi-value data. Defaults to "grouped". */
  mode?: "grouped" | "stacked";
  /** Per-series color + legend name, indexed to each datum's value array. */
  series?: readonly BarSeries[];
  /** Append (or prepend) a legend built from `series`. */
  legend?: LegendOptions;
}

/** One rendered cell of a bar column: its glyph and (optional) color. */
interface BarCell {
  glyph: string;
  color?: Color;
}

const clamp8 = (n: number): number => Math.max(0, Math.min(8, n));

function resolveMax(data: readonly BarDatum[], mode: "grouped" | "stacked", explicit?: number): number {
  if (explicit !== undefined) return explicit;
  let m = 1;
  for (const d of data) {
    if (typeof d.value === "number") m = Math.max(m, d.value);
    else if (mode === "stacked") m = Math.max(m, d.value.reduce((a, b) => a + b, 0));
    else for (const v of d.value) m = Math.max(m, v);
  }
  return m;
}

/** A stacked column (top→bottom): series[0] fills from the bottom up. */
function stackedColumn(
  values: readonly number[],
  colors: readonly (Color | undefined)[],
  max: number,
  height: number,
): BarCell[] {
  const total = values.reduce((a, b) => a + b, 0);
  const filled = max <= 0 ? 0 : Math.max(0, Math.min(height * 8, Math.round((total / max) * height * 8)));
  const bounds: number[] = []; // cumulative eighths where each series ends
  let cum = 0;
  for (const v of values) {
    cum += total > 0 ? (v / total) * filled : 0;
    bounds.push(cum);
  }
  const rows: BarCell[] = [];
  for (let r = height - 1; r >= 0; r -= 1) {
    const cellFilled = clamp8(filled - r * 8);
    const glyph = VERTICAL_BLOCKS[cellFilled]!;
    let color: Color | undefined;
    if (cellFilled > 0) {
      const probe = r * 8 + (cellFilled - 1);
      for (let i = 0; i < bounds.length; i += 1) {
        if (probe < bounds[i]!) {
          color = colors[i];
          break;
        }
      }
    }
    rows.push({ glyph, color });
  }
  return rows;
}

/** Sub-columns (each top→bottom) for one datum, honoring single/grouped/stacked. */
function datumColumns(
  d: BarDatum,
  mode: "grouped" | "stacked",
  max: number,
  height: number,
  series: readonly BarSeries[],
  defaultColor: Color,
): BarCell[][] {
  if (typeof d.value === "number") {
    return [verticalBarColumn(d.value, max, height).map((glyph) => ({ glyph, color: d.color ?? defaultColor }))];
  }
  if (mode === "stacked") {
    return [
      stackedColumn(
        d.value,
        d.value.map((_, i) => series[i]?.color ?? defaultColor),
        max,
        height,
      ),
    ];
  }
  return d.value.map((v, i) =>
    verticalBarColumn(v, max, height).map((glyph) => ({ glyph, color: series[i]?.color ?? defaultColor })),
  );
}

/**
 * Render a vertical bar chart as a {@link RenderNode}. A numeric `value` is one
 * bar (unchanged); an array `value` is laid out grouped (adjacent sub-columns)
 * or stacked (one colored column). Pure data → RenderNode — no React, no
 * terminal I/O, no new primitive.
 */
export function renderBarChart(data: readonly BarDatum[], options: BarChartOptions = {}): RenderNode {
  const height = options.height ?? 8;
  const barWidth = options.barWidth ?? 1;
  const gap = Math.max(0, options.gap ?? 1);
  const gapSpans = " ".repeat(gap);
  const mode = options.mode ?? "grouped";
  const series = options.series ?? [];
  const defaultColor = options.color ?? defaultTheme.colors.success;
  const max = resolveMax(data, mode, options.max);

  const perDatum = data.map((d) => datumColumns(d, mode, max, height, series, defaultColor));

  const lines: StyledLine[] = [];
  for (let r = 0; r < height; r += 1) {
    const line: StyledLine = [];
    perDatum.forEach((cols, di) => {
      if (di > 0 && gap > 0) line.push({ text: gapSpans });
      for (const col of cols) {
        const cell = col[r]!;
        line.push({ text: cell.glyph.repeat(barWidth), style: { fg: cell.color ?? defaultColor } });
      }
    });
    lines.push(line);
  }

  if (options.showLabels) {
    const line: StyledLine = [];
    data.forEach((d, i) => {
      if (i > 0 && gap > 0) line.push({ text: gapSpans });
      line.push({ text: d.label });
    });
    lines.push(line);
  }

  if (options.showValues) {
    const line: StyledLine = [];
    data.forEach((d, i) => {
      if (i > 0 && gap > 0) line.push({ text: gapSpans });
      line.push({ text: typeof d.value === "number" ? String(d.value) : d.value.join("/") });
    });
    lines.push(line);
  }

  let out = lines;
  if (options.legend && series.length > 0) {
    const entries: LegendEntry[] = series.map((s) => ({ label: s.label, color: s.color ?? defaultColor }));
    const legendLines = renderLegend(entries, options.legend);
    out = (options.legend.position ?? "bottom") === "top" ? [...legendLines, ...lines] : [...lines, ...legendLines];
  }

  return styledLinesToRenderNode(out);
}
