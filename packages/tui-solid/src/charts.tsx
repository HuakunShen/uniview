import { createMemo, type JSX } from "solid-js";
import {
  renderBarChart,
  renderGauge,
  renderHistogram,
  renderLineChart,
  renderLineGauge,
  renderScatter,
  renderSparkline,
  type BarChartOptions,
  type BarDatum,
  type GaugeOptions,
  type HistogramOptions,
  type LineGaugeOptions,
  type LineSeries,
  type PlotOptions,
  type SparklineOptions,
} from "@uniview/tui-charts";
import { renderNodeToElement } from "./content";

/*
 * Thin Solid wrappers over the pure `@uniview/tui-charts` builders. Each mirrors
 * the corresponding component in `@uniview/tui-react`'s `charts.ts` — same Props
 * shape, same builder, same output — so a chart renders identically under either
 * framework.
 *
 * `createMemo` replaces React's `useMemo` (Solid tracks the reads itself, so
 * there is no dependency array). Props are read *inside* the memo callback and
 * never destructured, which is what keeps them reactive: `renderNodeToElement`
 * is then called on the memo's value from within JSX, so a prop change rebuilds
 * the RenderNode and re-inserts a fresh element tree. (`NodeView` picks its
 * branch once and does not re-dispatch, so rebuilding is required — swapping the
 * node on a live NodeView would not work.)
 */

/** Props for {@link BarChart} — mirrors {@link renderBarChart}'s parameters. */
export interface BarChartProps {
  data: readonly BarDatum[];
  options?: BarChartOptions;
}

/** A vertical bar chart. */
export function BarChart(props: BarChartProps): JSX.Element {
  const node = createMemo(() => renderBarChart(props.data, props.options));
  return <>{renderNodeToElement(node())}</>;
}

/** Props for {@link Histogram} — mirrors {@link renderHistogram}'s parameters. */
export interface HistogramProps {
  values: readonly number[];
  options?: HistogramOptions;
}

/** A binned bar chart. */
export function Histogram(props: HistogramProps): JSX.Element {
  const node = createMemo(() => renderHistogram(props.values, props.options));
  return <>{renderNodeToElement(node())}</>;
}

/** Props for {@link Sparkline} — mirrors {@link renderSparkline}'s parameters. */
export interface SparklineProps {
  values: readonly number[];
  options?: SparklineOptions;
}

/** A single-line eighth-block trend. */
export function Sparkline(props: SparklineProps): JSX.Element {
  const node = createMemo(() => renderSparkline(props.values, props.options));
  return <>{renderNodeToElement(node())}</>;
}

/** Props for {@link Gauge} — mirrors {@link renderGauge}'s parameters. */
export interface GaugeProps {
  fraction: number;
  options?: GaugeOptions;
}

/** A single-line horizontal gauge. */
export function Gauge(props: GaugeProps): JSX.Element {
  const node = createMemo(() => renderGauge(props.fraction, props.options));
  return <>{renderNodeToElement(node())}</>;
}

/** Props for {@link LineGauge} — mirrors {@link renderLineGauge}'s parameters. */
export interface LineGaugeProps {
  fraction: number;
  options?: LineGaugeOptions;
}

/** A single-line labelled progress bar (label · bar · percent). */
export function LineGauge(props: LineGaugeProps): JSX.Element {
  const node = createMemo(() => renderLineGauge(props.fraction, props.options));
  return <>{renderNodeToElement(node())}</>;
}

/** Props for {@link LineChart} — mirrors {@link renderLineChart}'s parameters. */
export interface LineChartProps {
  series: readonly LineSeries[];
  options?: PlotOptions;
}

/** A braille-canvas polyline plot. */
export function LineChart(props: LineChartProps): JSX.Element {
  const node = createMemo(() => renderLineChart(props.series, props.options));
  return <>{renderNodeToElement(node())}</>;
}

/** Props for {@link Scatter} — mirrors {@link renderScatter}'s parameters. */
export interface ScatterProps {
  series: readonly LineSeries[];
  options?: PlotOptions;
}

/** A braille-canvas scatter plot. */
export function Scatter(props: ScatterProps): JSX.Element {
  const node = createMemo(() => renderScatter(props.series, props.options));
  return <>{renderNodeToElement(node())}</>;
}
