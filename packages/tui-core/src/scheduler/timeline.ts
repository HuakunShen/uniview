import { resolveEasing, type EasingFn, type EasingName } from "./ease";

export interface TimelineOptions {
  from?: number;
  to?: number;
  duration: number;
  ease?: EasingFn | EasingName;
  loop?: boolean | number;
  alternate?: boolean;
  autoplay?: boolean;
  onUpdate?: (value: number, timeline: Timeline) => void;
  onComplete?: (timeline: Timeline) => void;
}

interface Segment {
  from: number;
  to: number;
  duration: number;
  ease: EasingFn;
}

/**
 * A time-driven scalar tween. It never reads a clock: a driver (see
 * {@link FrameClock}) advances it with {@link Timeline.tick}. `.add()` appends
 * segments that play back-to-back; `loop`/`alternate` apply to the whole
 * sequence.
 */
export class Timeline {
  private readonly segments: Segment[];
  private readonly iterations: number; // 1 = play once; Infinity = forever
  private readonly alternate: boolean;
  private readonly onUpdate?: (value: number, timeline: Timeline) => void;
  private readonly onComplete?: (timeline: Timeline) => void;

  private elapsed = 0; // ms within the current iteration
  private iteration = 0;
  private _running: boolean;
  private _value: number;
  private _done = false;

  constructor(options: TimelineOptions) {
    if (!(options.duration > 0)) {
      throw new Error("Timeline duration must be > 0");
    }
    this.segments = [
      {
        from: options.from ?? 0,
        to: options.to ?? 1,
        duration: options.duration,
        ease: resolveEasing(options.ease),
      },
    ];
    this.iterations =
      options.loop === true
        ? Number.POSITIVE_INFINITY
        : options.loop === undefined || options.loop === false
          ? 1
          : options.loop;
    this.alternate = options.alternate ?? false;
    this.onUpdate = options.onUpdate;
    this.onComplete = options.onComplete;
    this._running = options.autoplay ?? true;
    this._value = this.segments[0]!.from;
  }

  get value(): number {
    return this._value;
  }
  get progress(): number {
    const total = this.duration;
    return total > 0 ? Math.min(1, this.elapsed / total) : 1;
  }
  get duration(): number {
    let sum = 0;
    for (const s of this.segments) sum += s.duration;
    return sum;
  }
  get running(): boolean {
    return this._running;
  }
  get done(): boolean {
    return this._done;
  }

  /** Append a segment that plays after the current sequence. Chainable. */
  add(options: TimelineOptions): this {
    if (!(options.duration > 0)) {
      throw new Error("Timeline segment duration must be > 0");
    }
    const prev = this.segments[this.segments.length - 1]!;
    this.segments.push({
      from: options.from ?? prev.to,
      to: options.to ?? 1,
      duration: options.duration,
      ease: resolveEasing(options.ease),
    });
    return this;
  }

  tick(deltaMs: number): void {
    if (!this._running || this._done) return;
    this.elapsed += deltaMs;
    const total = this.duration;

    while (this.elapsed >= total) {
      if (this.iteration + 1 >= this.iterations) {
        // Final iteration: clamp to the end and complete.
        this.elapsed = total;
        this.recompute();
        this._done = true;
        this._running = false;
        this.onUpdate?.(this._value, this);
        this.onComplete?.(this);
        return;
      }
      this.elapsed -= total;
      this.iteration += 1;
    }

    this.recompute();
    this.onUpdate?.(this._value, this);
  }

  play(): this {
    if (!this._done) this._running = true;
    return this;
  }
  pause(): this {
    this._running = false;
    return this;
  }
  reset(): this {
    this.elapsed = 0;
    this.iteration = 0;
    this._done = false;
    this._running = true;
    this.recompute();
    return this;
  }
  seek(ms: number): this {
    this.elapsed = Math.max(0, Math.min(ms, this.duration));
    this.recompute();
    return this;
  }

  /** Recompute `_value` from `elapsed`, resolving the active segment. */
  private recompute(): void {
    let acc = 0;
    let seg = this.segments[this.segments.length - 1]!;
    let local = seg.duration;
    for (const s of this.segments) {
      if (this.elapsed <= acc + s.duration) {
        seg = s;
        local = this.elapsed - acc;
        break;
      }
      acc += s.duration;
    }
    let t = seg.duration > 0 ? local / seg.duration : 1;
    t = Math.min(1, Math.max(0, t));
    if (this.alternate && this.iteration % 2 === 1) t = 1 - t;
    this._value = seg.from + (seg.to - seg.from) * seg.ease(t);
  }
}
