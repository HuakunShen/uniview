import type { DiagnosticsTracker } from "./diagnostics";
import type { Timeline } from "./timeline";

export interface FrameInfo {
  frame: number;
  time: number;
  delta: number;
}

export type FrameListener = (info: FrameInfo) => void;

export interface FrameClockOptions {
  /** Injected monotonic time source in ms. The clock never reads a clock itself. */
  now: () => number;
  /** Injected next-frame scheduler. Production uses a ~60fps timer; tests a manual queue. */
  requestFrame: (frame: () => void) => void;
  /** Optional per-frame side effect — e.g. request a repaint. */
  onFrame?: (info: FrameInfo) => void;
  /** Optional diagnostics: reflect the running animation in `activeAnimations`. */
  diagnostics?: Pick<DiagnosticsTracker, "animationStarted" | "animationStopped">;
}

/**
 * Drives a set of {@link Timeline}s and per-frame listeners off an injected
 * clock. While it has running timelines or listeners it pumps frames: each
 * frame computes `delta` from `now()`, ticks the timelines, notifies listeners,
 * fires `onFrame`, and re-arms `requestFrame`. When nothing wants frames it
 * stops and drops the `activeAnimations` diagnostic back to zero.
 */
export class FrameClock {
  private readonly now: () => number;
  private readonly requestFrame: (frame: () => void) => void;
  private readonly onFrame?: (info: FrameInfo) => void;
  private readonly diagnostics?: Pick<DiagnosticsTracker, "animationStarted" | "animationStopped">;

  private readonly timelines = new Set<Timeline>();
  private readonly listeners = new Set<FrameListener>();

  private _running = false;
  private _frame = 0;
  private _time = 0;
  private _delta = 0;
  private lastNow = 0;

  constructor(options: FrameClockOptions) {
    this.now = options.now;
    this.requestFrame = options.requestFrame;
    this.onFrame = options.onFrame;
    this.diagnostics = options.diagnostics;
  }

  get running(): boolean {
    return this._running;
  }
  get frame(): number {
    return this._frame;
  }
  get time(): number {
    return this._time;
  }
  get delta(): number {
    return this._delta;
  }

  add(timeline: Timeline): () => void {
    this.timelines.add(timeline);
    this.ensureRunning();
    return () => {
      this.timelines.delete(timeline);
    };
  }

  subscribe(listener: FrameListener): () => void {
    this.listeners.add(listener);
    this.ensureRunning();
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this._frame = 0;
    this._time = 0;
    this._delta = 0;
  }

  private hasWork(): boolean {
    if (this.listeners.size > 0) return true;
    for (const timeline of this.timelines) {
      if (timeline.running && !timeline.done) return true;
    }
    return false;
  }

  private ensureRunning(): void {
    if (this._running || !this.hasWork()) return;
    this._running = true;
    this.lastNow = this.now();
    this.diagnostics?.animationStarted();
    this.requestFrame(() => this.pump());
  }

  private pump(): void {
    if (!this._running) return;
    const t = this.now();
    this._delta = t - this.lastNow;
    this.lastNow = t;
    this._frame += 1;
    this._time += this._delta;

    for (const timeline of this.timelines) {
      timeline.tick(this._delta);
      if (timeline.done) this.timelines.delete(timeline);
    }

    const info: FrameInfo = { frame: this._frame, time: this._time, delta: this._delta };
    for (const listener of this.listeners) listener(info);
    this.onFrame?.(info);

    if (this.hasWork()) {
      this.requestFrame(() => this.pump());
    } else {
      this._running = false;
      this.diagnostics?.animationStopped();
    }
  }
}
