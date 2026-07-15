import { useMemo, type ReactElement } from "react";
import {
  renderBarChart,
  renderGauge,
  renderHistogram,
  renderLineChart,
  renderScatter,
  renderSparkline,
  type BarChartOptions,
  type BarDatum,
  type GaugeOptions,
  type HistogramOptions,
  type LineSeries,
  type PlotOptions,
  type SparklineOptions,
} from "@uniview/tui-charts";
import { renderNodeToElement } from "./content";

/** Props for {@link BarChart} — mirrors {@link renderBarChart}'s parameters. */
export interface BarChartProps {
  data: readonly BarDatum[];
  options?: BarChartOptions;
}

/** Memoized wrapper around {@link renderBarChart}: a vertical bar chart. */
export function BarChart({ data, options }: BarChartProps): ReactElement {
  return useMemo(
    () => renderNodeToElement(renderBarChart(data, options)),
    [data, options],
  );
}

/** Props for {@link Histogram} — mirrors {@link renderHistogram}'s parameters. */
export interface HistogramProps {
  values: readonly number[];
  options?: HistogramOptions;
}

/** Memoized wrapper around {@link renderHistogram}: a binned bar chart. */
export function Histogram({ values, options }: HistogramProps): ReactElement {
  return useMemo(
    () => renderNodeToElement(renderHistogram(values, options)),
    [values, options],
  );
}

/** Props for {@link Sparkline} — mirrors {@link renderSparkline}'s parameters. */
export interface SparklineProps {
  values: readonly number[];
  options?: SparklineOptions;
}

/** Memoized wrapper around {@link renderSparkline}: a single-line eighth-block trend. */
export function Sparkline({ values, options }: SparklineProps): ReactElement {
  return useMemo(
    () => renderNodeToElement(renderSparkline(values, options)),
    [values, options],
  );
}

/** Props for {@link Gauge} — mirrors {@link renderGauge}'s parameters. */
export interface GaugeProps {
  fraction: number;
  options?: GaugeOptions;
}

/** Memoized wrapper around {@link renderGauge}: a single-line horizontal gauge. */
export function Gauge({ fraction, options }: GaugeProps): ReactElement {
  return useMemo(
    () => renderNodeToElement(renderGauge(fraction, options)),
    [fraction, options],
  );
}

/** Props for {@link LineChart} — mirrors {@link renderLineChart}'s parameters. */
export interface LineChartProps {
  series: readonly LineSeries[];
  options?: PlotOptions;
}

/** Memoized wrapper around {@link renderLineChart}: a braille-canvas polyline plot. */
export function LineChart({ series, options }: LineChartProps): ReactElement {
  return useMemo(
    () => renderNodeToElement(renderLineChart(series, options)),
    [series, options],
  );
}

/** Props for {@link Scatter} — mirrors {@link renderScatter}'s parameters. */
export interface ScatterProps {
  series: readonly LineSeries[];
  options?: PlotOptions;
}

/** Memoized wrapper around {@link renderScatter}: a braille-canvas scatter plot. */
export function Scatter({ series, options }: ScatterProps): ReactElement {
  return useMemo(
    () => renderNodeToElement(renderScatter(series, options)),
    [series, options],
  );
}
