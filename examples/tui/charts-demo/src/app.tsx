import { createElement, type ReactElement } from "react";
import { defaultTheme } from "@uniview/tui-core";
import { BarChart, Box, Gauge, Histogram, Panel, Text, type BarChartProps } from "@uniview/tui-react";

export interface AppHost {
  rerender: () => void;
  quit: () => void;
}

export interface AppState {
  /** Seconds elapsed in the (simulated) load test. */
  elapsed: number;
  /** Total planned duration, in seconds. */
  total: number;
  /** Internal counter feeding the deterministic data generators. */
  tickCount: number;
  /** Rolling window of requests/sec, oldest first — feeds the bar chart. */
  requestsPerSec: number[];
  /** Rolling window of response-time samples (seconds) — feeds the histogram. */
  responseTimes: number[];
  /** The samples generated on the most recent tick — feeds the "last sec" stats. */
  lastSecSamples: number[];
  /** Cumulative request count across the whole run. */
  totalRequests: number;
}

const TOTAL_SECONDS = 10;
const REQUESTS_WINDOW = 8;
const RESPONSE_TIMES_WINDOW = 200;
const SAMPLES_PER_TICK = 20;

export function createState(): AppState {
  return {
    elapsed: 0,
    total: TOTAL_SECONDS,
    tickCount: 0,
    requestsPerSec: [],
    responseTimes: [],
    lastSecSamples: [],
    totalRequests: 0,
  };
}

/** A deterministic (seed-free) requests/sec value that drifts and oscillates over time. */
function nextRequestsPerSec(t: number): number {
  return Math.round(220_000 + 60_000 * Math.sin(t / 2) + t * 1_200);
}

/** A deterministic response-time sample (seconds), varying by tick and sample index. */
function nextResponseTime(t: number, i: number): number {
  const base = 0.00035 + 0.00025 * Math.sin((t + i) / 4);
  const jitter = ((i * 37 + t * 13) % 11) * 0.00002;
  return Math.max(0.00001, base + jitter);
}

/** Advance the simulated load test by one second, mutating `state` in place. */
export function tick(state: AppState): void {
  state.tickCount += 1;
  state.elapsed = Math.min(state.total, state.elapsed + 1);

  const requestsThisSec = nextRequestsPerSec(state.tickCount);
  state.requestsPerSec.push(requestsThisSec);
  if (state.requestsPerSec.length > REQUESTS_WINDOW) state.requestsPerSec.shift();
  state.totalRequests += requestsThisSec;

  const samples: number[] = [];
  for (let i = 0; i < SAMPLES_PER_TICK; i += 1) samples.push(nextResponseTime(state.tickCount, i));
  state.lastSecSamples = samples;
  state.responseTimes.push(...samples);
  while (state.responseTimes.length > RESPONSE_TIMES_WINDOW) state.responseTimes.shift();
}

interface Stats {
  slowest: number;
  fastest: number;
  average: number;
}

function computeStats(samples: readonly number[]): Stats {
  if (samples.length === 0) return { slowest: 0, fastest: 0, average: 0 };
  let slowest = samples[0]!;
  let fastest = samples[0]!;
  let sum = 0;
  for (const s of samples) {
    if (s > slowest) slowest = s;
    if (s < fastest) fastest = s;
    sum += s;
  }
  return { slowest, fastest, average: sum / samples.length };
}

const secs = (n: number): string => `${n.toFixed(4)} secs`;

export function App({ state }: { state: AppState; host: AppHost }): ReactElement {
  const stats = computeStats(state.lastSecSamples.length > 0 ? state.lastSecSamples : state.responseTimes);
  const fraction = state.total > 0 ? state.elapsed / state.total : 0;

  const barData: BarChartProps["data"] = state.requestsPerSec.map((value, i) => ({
    label: `${i}s`,
    value,
  }));

  return createElement(
    Box,
    { flexDirection: "column", width: "100%", height: "100%" },
    createElement(
      Panel,
      { title: "Progress", height: 3 },
      createElement(Gauge, { fraction, options: { label: `${state.elapsed}s / ${state.total}s` } }),
    ),
    createElement(
      Box,
      { flexDirection: "row", flexGrow: 1 },
      createElement(
        Panel,
        { title: "Stats for last sec", flexGrow: 1 },
        createElement(
          Box,
          { flexDirection: "column" },
          createElement(Text, null, `Requests : ${state.totalRequests}`),
          createElement(Text, { color: "yellow" }, `Slowest: ${secs(stats.slowest)}`),
          createElement(Text, { color: "green" }, `Fastest: ${secs(stats.fastest)}`),
          createElement(Text, { color: "blue" }, `Average: ${secs(stats.average)}`),
        ),
      ),
      createElement(
        Panel,
        { title: "Status code distribution", flexGrow: 1 },
        createElement(Box, null, createElement(Text, null, `[200] ${state.totalRequests} responses`)),
      ),
    ),
    createElement(
      Box,
      { flexDirection: "row", flexGrow: 1 },
      createElement(
        Panel,
        { title: "Requests / past sec", flexGrow: 1 },
        createElement(BarChart, { data: barData, options: { height: 6, showValues: true } }),
      ),
      createElement(
        Panel,
        { title: "Response time histogram", flexGrow: 1 },
        createElement(Histogram, {
          values: state.responseTimes,
          options: { height: 6, showValues: true, bins: 5, color: defaultTheme.colors.warning },
        }),
      ),
    ),
  );
}
