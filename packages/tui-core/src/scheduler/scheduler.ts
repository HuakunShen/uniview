/** Invalidation kinds, ordered by cost. `layout` implies `paint`. */
export type Invalidation = "none" | "paint" | "layout";
export type RenderKind = "paint" | "layout";

export interface RenderSchedulerOptions {
  /** Called once per coalesced frame with the strongest invalidation. */
  render: (kind: RenderKind) => void;
  /**
   * Schedules a flush to run later. Defaults to `queueMicrotask`. Tests inject
   * a manual queue to make flushing fully deterministic.
   */
  schedule?: (flush: () => void) => void;
}

/**
 * Coalesces render invalidations so a burst of mutations produces exactly one
 * frame. A `layout` invalidation always wins over `paint` for the same frame.
 */
export class RenderScheduler {
  private readonly render: (kind: RenderKind) => void;
  private readonly schedule: (flush: () => void) => void;
  private invalidation: Invalidation = "none";
  private scheduled = false;
  private generation = 0;

  constructor(options: RenderSchedulerOptions) {
    this.render = options.render;
    this.schedule = options.schedule ?? queueMicrotask;
  }

  /** True when a frame is queued but not yet flushed. */
  get pending(): boolean {
    return this.invalidation !== "none";
  }

  /** Request a render. `layout` supersedes a pending `paint`. */
  invalidate(kind: RenderKind): void {
    if (kind === "layout" || this.invalidation === "none") {
      this.invalidation = kind;
    }
    if (this.scheduled) return;
    this.scheduled = true;
    const generation = this.generation;
    this.schedule(() => {
      if (generation !== this.generation) return;
      this.flush();
    });
  }

  /** Cancel pending work; callbacks already queued by the host become inert. */
  cancel(): void {
    this.generation += 1;
    this.invalidation = "none";
    this.scheduled = false;
  }

  /** Flush any pending frame immediately (used for synchronous test steps). */
  flushSync(): void {
    if (this.invalidation === "none") return;
    this.flush();
  }

  private flush(): void {
    this.scheduled = false;
    const kind = this.invalidation;
    this.invalidation = "none";
    if (kind === "none") return;
    this.render(kind);
  }
}
