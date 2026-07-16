import type { Color, DrawContext } from "@uniview/tui-core";
import {
  binFrequency,
  magnitudeSpectrum,
  risingEdge,
  SAMPLE_RATE,
  type StereoFrame,
} from "./signal";

/**
 * The three scope modes. Each is a pure `(DrawContext, StereoFrame) → void`
 * plus the data-space bounds `<Canvas>` should project with — exactly ratatui
 * scope-tui's `DisplayMode` split (process / axis / references), but expressed
 * as a Canvas draw callback so it needs no new renderer primitive.
 */
export interface ScopeMode {
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  bounds(frame: StereoFrame): { x: readonly [number, number]; y: readonly [number, number] };
  draw(cv: DrawContext, frame: StereoFrame): void;
  /** A short status line the app renders under the canvas. */
  readout(frame: StereoFrame): string;
}

const LEFT_COLOR: Color = "green";
const RIGHT_COLOR: Color = "cyan";
const AXIS_COLOR: Color = "gray";

/** How many samples the oscilloscope paints across the width. */
const SCOPE_WINDOW = 1200;
/** Transform size for the spectroscope (power of two). */
const FFT_SIZE = 1024;

/** Draw a faint horizontal + vertical mid-axis in data space. */
function drawCrosshair(cv: DrawContext, x: readonly [number, number], y: readonly [number, number]): void {
  const midY = (y[0] + y[1]) / 2;
  const [ax0] = cv.project(x[0], midY);
  const [ax1, ay] = cv.project(x[1], midY);
  cv.line(ax0, ay, ax1, ay, { color: AXIS_COLOR });
}

/** Plot a sample series across the full width as a connected line. */
function plotWave(cv: DrawContext, samples: Float64Array, start: number, count: number, color: Color): void {
  let prev: [number, number] | undefined;
  for (let i = 0; i < count; i += 1) {
    const s = samples[start + i];
    if (s === undefined) break;
    const p = cv.project(i, s);
    if (prev) cv.line(prev[0], prev[1], p[0], p[1], { color });
    prev = p;
  }
}

/** Oscilloscope: L and R waveforms vs. time, edge-triggered so they hold still. */
export const oscilloscope: ScopeMode = {
  id: "osc",
  name: "Oscilloscope",
  hint: "L/R waveform vs. time · rising-edge triggered",
  bounds() {
    return { x: [0, SCOPE_WINDOW - 1], y: [-1.05, 1.05] };
  },
  draw(cv, frame) {
    const bounds = this.bounds(frame);
    drawCrosshair(cv, bounds.x, bounds.y);
    const trig = risingEdge(frame.left, frame.left.length - SCOPE_WINDOW);
    plotWave(cv, frame.left, trig, SCOPE_WINDOW, LEFT_COLOR);
    plotWave(cv, frame.right, trig, SCOPE_WINDOW, RIGHT_COLOR);
  },
  readout(frame) {
    const rms = Math.sqrt(frame.left.reduce((s, v) => s + v * v, 0) / frame.left.length);
    return `RMS ${(rms).toFixed(3)}   window ${SCOPE_WINDOW} samples @ ${SAMPLE_RATE} Hz`;
  },
};

/** Vectorscope: (L, R) plotted as an X/Y Lissajous phase figure. */
export const vectorscope: ScopeMode = {
  id: "vec",
  name: "Vectorscope",
  hint: "L→x  R→y  ·  phase / stereo-image figure",
  bounds() {
    return { x: [-1.05, 1.05], y: [-1.05, 1.05] };
  },
  draw(cv, frame) {
    const bounds = this.bounds(frame);
    // Diagonal reference lines (mono → 45°, out-of-phase → -45°).
    const d0 = cv.project(bounds.x[0], bounds.y[0]);
    const d1 = cv.project(bounds.x[1], bounds.y[1]);
    cv.line(d0[0], d0[1], d1[0], d1[1], { color: AXIS_COLOR });
    const a0 = cv.project(bounds.x[0], bounds.y[1]);
    const a1 = cv.project(bounds.x[1], bounds.y[0]);
    cv.line(a0[0], a0[1], a1[0], a1[1], { color: AXIS_COLOR });
    const n = Math.min(frame.left.length, frame.right.length);
    for (let i = 0; i < n; i += 1) {
      const p = cv.project(frame.left[i]!, frame.right[i]!);
      cv.set(p[0], p[1], { color: LEFT_COLOR });
    }
  },
  readout(frame) {
    // Correlation of L/R — +1 mono, 0 wide, -1 out of phase.
    const n = Math.min(frame.left.length, frame.right.length);
    let sll = 0;
    let srr = 0;
    let slr = 0;
    for (let i = 0; i < n; i += 1) {
      sll += frame.left[i]! * frame.left[i]!;
      srr += frame.right[i]! * frame.right[i]!;
      slr += frame.left[i]! * frame.right[i]!;
    }
    const denom = Math.sqrt(sll * srr) || 1;
    return `phase correlation ${(slr / denom).toFixed(2)}   (+1 mono · 0 wide · −1 anti-phase)`;
  },
};

const DB_FLOOR = -60;

/** Convert a linear magnitude to dBFS clamped at the display floor. */
function toDb(mag: number, ref: number): number {
  const db = 20 * Math.log10((mag || 1e-12) / ref);
  return Math.max(DB_FLOOR, Math.min(0, db));
}

/** Spectroscope: FFT magnitude of L, dB vs. log-frequency. */
export const spectroscope: ScopeMode = {
  id: "spec",
  name: "Spectroscope",
  hint: "FFT magnitude · dBFS vs. log frequency",
  bounds() {
    return { x: [Math.log10(20), Math.log10(SAMPLE_RATE / 2)], y: [DB_FLOOR, 0] };
  },
  draw(cv, frame) {
    const bounds = this.bounds(frame);
    // Decade gridlines at 100 / 1k / 10k Hz.
    for (const f of [100, 1000, 10000]) {
      const [gx, gy0] = cv.project(Math.log10(f), bounds.y[0]);
      const [, gy1] = cv.project(Math.log10(f), bounds.y[1]);
      cv.line(gx, gy0, gx, gy1, { color: AXIS_COLOR });
    }
    const samples = frame.left.subarray(0, FFT_SIZE);
    const mag = magnitudeSpectrum(samples);
    const ref = FFT_SIZE / 4; // window/coherent-gain reference for 0 dBFS
    let prev: [number, number] | undefined;
    for (let k = 1; k < mag.length; k += 1) {
      const f = binFrequency(k, FFT_SIZE);
      if (f < 20) continue;
      const p = cv.project(Math.log10(f), toDb(mag[k]!, ref));
      if (prev) cv.line(prev[0], prev[1], p[0], p[1], { color: LEFT_COLOR });
      prev = p;
    }
  },
  readout(frame) {
    const mag = magnitudeSpectrum(frame.left.subarray(0, FFT_SIZE));
    let peakK = 1;
    for (let k = 2; k < mag.length; k += 1) if (mag[k]! > mag[peakK]!) peakK = k;
    return `peak ${binFrequency(peakK, FFT_SIZE).toFixed(0)} Hz   FFT ${FFT_SIZE} · Hann window`;
  },
};

/** The Tab-cycle order. */
export const MODES: readonly ScopeMode[] = [oscilloscope, vectorscope, spectroscope];
