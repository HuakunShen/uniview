import type { RenderNode } from "@uniview/tui-core";

import type { BarChartOptions, BarDatum } from "./bar";
import { renderBarChart } from "./bar";

/** Options controlling {@link renderHistogram} binning, plus all {@link BarChartOptions}. */
export interface HistogramOptions extends BarChartOptions {
  /** Number of buckets to bin values into. Defaults to 10. */
  bins?: number;
}

/** Format a bucket boundary to ~4 significant digits for display. */
function formatBound(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toPrecision(4)).toString();
}

/**
 * Bin a list of numbers into a histogram and render it as a {@link RenderNode}
 * via {@link renderBarChart}. Bucket boundaries run from `min(values)` to
 * `max(values)`; the last bucket is inclusive of the maximum value. Pure
 * data → RenderNode — no React, no terminal I/O.
 */
export function renderHistogram(
  values: readonly number[],
  options: HistogramOptions = {},
): RenderNode {
  const bins = Math.max(1, Math.floor(options?.bins ?? 10));
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  // Guard max === min (including the empty-input case, where min = max = 0):
  // a zero-width bucket range must not produce NaN/Infinity indices.
  const width = max === min ? 0 : (max - min) / bins;

  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const index =
      width === 0 ? 0 : Math.min(bins - 1, Math.floor((v - min) / width));
    counts[index] += 1;
  }

  const data: BarDatum[] = counts.map((count, i) => ({
    label: formatBound(min + i * width),
    value: count,
  }));

  return renderBarChart(data, options);
}
