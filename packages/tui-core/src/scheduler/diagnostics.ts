/**
 * Read-only host activity counters. `waitForIdle` uses these instead of a
 * fixed sleep so tests are deterministic rather than timing-dependent.
 */
export interface HostDiagnostics {
  readonly renderRevision: number;
  readonly mutationRevision: number;
  readonly pendingHandlers: number;
  readonly transportInFlight: number;
  readonly activeAnimations: number;
  readonly schedulerPending: boolean;
}

/** The host is idle when no work is outstanding and the frame is up to date. */
export function isIdle(d: HostDiagnostics): boolean {
  return (
    d.renderRevision === d.mutationRevision &&
    d.pendingHandlers === 0 &&
    d.transportInFlight === 0 &&
    d.activeAnimations === 0 &&
    !d.schedulerPending
  );
}

/** A source that reports diagnostics and notifies subscribers on any change. */
export interface DiagnosticsSource extends HostDiagnostics {
  subscribe(listener: () => void): () => void;
}

/**
 * Concrete, mutable {@link HostDiagnostics}. The host bumps these counters as
 * mutations, handlers, transport messages and animations start and settle;
 * every change notifies subscribers so `waitForIdle` can resolve promptly.
 */
export class DiagnosticsTracker implements DiagnosticsSource {
  private _renderRevision = 0;
  private _mutationRevision = 0;
  private _pendingHandlers = 0;
  private _transportInFlight = 0;
  private _activeAnimations = 0;
  private _schedulerPending = false;
  private readonly listeners = new Set<() => void>();

  get renderRevision(): number {
    return this._renderRevision;
  }
  get mutationRevision(): number {
    return this._mutationRevision;
  }
  get pendingHandlers(): number {
    return this._pendingHandlers;
  }
  get transportInFlight(): number {
    return this._transportInFlight;
  }
  get activeAnimations(): number {
    return this._activeAnimations;
  }
  get schedulerPending(): boolean {
    return this._schedulerPending;
  }

  bumpMutation(): void {
    this._mutationRevision += 1;
    this.notify();
  }

  /** Mark the rendered frame as up to date with the latest mutation. */
  markRendered(): void {
    this._renderRevision = this._mutationRevision;
    this.notify();
  }

  handlerStarted(): void {
    this._pendingHandlers += 1;
    this.notify();
  }
  handlerSettled(): void {
    this._pendingHandlers = Math.max(0, this._pendingHandlers - 1);
    this.notify();
  }

  transportSent(): void {
    this._transportInFlight += 1;
    this.notify();
  }
  transportReceived(): void {
    this._transportInFlight = Math.max(0, this._transportInFlight - 1);
    this.notify();
  }

  animationStarted(): void {
    this._activeAnimations += 1;
    this.notify();
  }
  animationStopped(): void {
    this._activeAnimations = Math.max(0, this._activeAnimations - 1);
    this.notify();
  }

  setSchedulerPending(pending: boolean): void {
    this._schedulerPending = pending;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export interface WaitForIdleOptions {
  timeoutMs?: number;
  /** Injectable timer for deterministic tests. Defaults to `setTimeout`. */
  setTimer?: (callback: () => void, ms: number) => unknown;
  /** Cancels a timer created by `setTimer`. Defaults to `clearTimeout`. */
  clearTimer?: (handle: unknown) => void;
}

/**
 * Resolve when `source` reports {@link isIdle}, or reject after `timeoutMs`.
 * Event-driven: it checks on construction and again on every change.
 */
export function waitForIdle(
  source: DiagnosticsSource,
  options: WaitForIdleOptions = {},
): Promise<void> {
  if (isIdle(source)) return Promise.resolve();

  const timeoutMs = options.timeoutMs ?? 5000;
  const setTimer =
    options.setTimer ??
    ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearTimer = options.clearTimer ?? ((h: unknown) => clearTimeout(h as never));

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimer(timer);
      fn();
    };

    const unsubscribe = source.subscribe(() => {
      if (isIdle(source)) finish(resolve);
    });

    const timer = setTimer(() => {
      finish(() => reject(new Error(`waitForIdle timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
  });
}
