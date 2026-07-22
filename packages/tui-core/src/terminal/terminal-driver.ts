import { InputParser } from "../input/parser";
import type { TuiInputEvent } from "../input/events";
import type { Size } from "../surface/types";
import {
  buildEnterSequence,
  buildLeaveSequence,
  DEFAULT_MODE_OPTIONS,
  type MouseMode,
  type ScreenMode,
} from "./sequences";

/** The subset of a Node readable TTY the driver needs (injectable). */
export interface TtyInput {
  isTTY?: boolean;
  setRawMode?(mode: boolean): void;
  resume?(): void;
  pause?(): void;
  on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  off(event: "data", listener: (chunk: Uint8Array | string) => void): void;
}

/** The subset of a Node writable TTY the driver needs (injectable). */
export interface TtyOutput {
  columns?: number;
  rows?: number;
  write(chunk: string): void;
  on(event: "resize", listener: () => void): void;
  off(event: "resize", listener: () => void): void;
}

export interface TerminalDriverOptions {
  input: TtyInput;
  output: TtyOutput;
  screen?: ScreenMode;
  mouse?: MouseMode;
  bracketedPaste?: boolean;
  focusReporting?: boolean;
  hideCursor?: boolean;
  /** Idle delay (ms) after which a held lone ESC is flushed as an Escape key. */
  escapeFlushMs?: number;
  /** Receives every parsed input event, including synthetic resize events. */
  onEvent: (event: TuiInputEvent) => void;
}

/** A generic teardown barrier owned by the terminal session. */
export interface TerminalDriverStartOptions {
  /** Runs before terminal resources are released and is retried by the next owner. */
  readonly cleanup: () => void;
  /** Return true only when the error means the live session must remain untouched. */
  readonly retainSessionOnError?: (error: unknown) => boolean;
}

type TerminalCleanupBarrier = Readonly<{
  cleanup: () => void;
  retainSessionOnError?: (error: unknown) => boolean;
}>;

type TerminalDriverState =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "cleanup-pending";

// The framework bindings bundle their own host/rendering implementation, but
// deliberately keep one external @uniview/tui-core instance. Keeping terminal
// ownership here therefore prevents React, Solid, and direct-core apps from
// independently taking over either half of the same terminal session.
const inputOwners = new WeakMap<TtyInput, TerminalDriver>();
const outputOwners = new WeakMap<TtyOutput, TerminalDriver>();

/**
 * Owns the real terminal for one session: raw mode, enter/leave sequences,
 * stdin parsing, and resize reporting. All I/O is injected so it runs under
 * unit tests with fake streams — no real TTY required. `stop` is idempotent
 * and always restores the terminal.
 */
export class TerminalDriver {
  private parser = new InputParser();
  private readonly mode;
  private state: TerminalDriverState = "idle";
  private generation = 0;
  private streamsReserved = false;
  private rawModeEnabled = false;
  private inputResumed = false;
  private dataListenerAttached = false;
  private resizeListenerAttached = false;
  private enterSequenceWritten = false;
  private currentSize: Size;
  private escapeTimer: ReturnType<typeof setTimeout> | null = null;
  private dataListener: ((chunk: Uint8Array | string) => void) | null = null;
  private resizeListener: (() => void) | null = null;
  private cleanupBarrier: TerminalCleanupBarrier | null = null;

  constructor(private readonly options: TerminalDriverOptions) {
    this.mode = {
      screen: options.screen ?? DEFAULT_MODE_OPTIONS.screen,
      mouse: options.mouse ?? DEFAULT_MODE_OPTIONS.mouse,
      bracketedPaste:
        options.bracketedPaste ?? DEFAULT_MODE_OPTIONS.bracketedPaste,
      focusReporting:
        options.focusReporting ?? DEFAULT_MODE_OPTIONS.focusReporting,
      hideCursor: options.hideCursor ?? DEFAULT_MODE_OPTIONS.hideCursor,
    };
    this.currentSize = this.readSize();
  }

  get size(): Size {
    return this.currentSize;
  }

  private readSize(): Size {
    return {
      width: this.options.output.columns ?? 80,
      height: this.options.output.rows ?? 24,
    };
  }

  private isCurrentCallback(generation: number): boolean {
    return this.state === "running" && generation === this.generation;
  }

  private onData(chunk: Uint8Array | string, generation: number): void {
    if (!this.isCurrentCallback(generation)) return;
    this.clearEscapeTimer();
    if (!this.isCurrentCallback(generation)) return;
    this.parser.push(chunk);
    this.emitEvents(generation);
    if (!this.isCurrentCallback(generation)) return;
    this.armEscapeFlush(generation);
  }

  private emitEvents(generation: number): void {
    if (!this.isCurrentCallback(generation)) return;
    for (const event of this.parser.takeEvents()) {
      if (!this.isCurrentCallback(generation)) return;
      this.options.onEvent(event);
    }
  }

  /** After input goes idle, resolve a held lone ESC as an Escape keypress. */
  private armEscapeFlush(generation: number): void {
    if (!this.isCurrentCallback(generation) || !this.parser.awaitingEscape)
      return;
    const timer = setTimeout(() => {
      if (!this.isCurrentCallback(generation) || this.escapeTimer !== timer)
        return;
      this.escapeTimer = null;
      this.parser.flush();
      this.emitEvents(generation);
    }, this.options.escapeFlushMs ?? 40);
    this.escapeTimer = timer;
    timer.unref?.();
  }

  private clearEscapeTimer(): void {
    if (this.escapeTimer !== null) {
      clearTimeout(this.escapeTimer);
      this.escapeTimer = null;
    }
  }

  private onResize(generation: number): void {
    if (!this.isCurrentCallback(generation)) return;
    this.currentSize = this.readSize();
    this.options.onEvent({
      type: "resize",
      width: this.currentSize.width,
      height: this.currentSize.height,
    });
  }

  private hasOwnedResources(): boolean {
    return (
      this.rawModeEnabled ||
      this.inputResumed ||
      this.dataListenerAttached ||
      this.resizeListenerAttached ||
      this.enterSequenceWritten
    );
  }

  private conflictingOwners(): TerminalDriver[] {
    const owners: TerminalDriver[] = [];
    const append = (owner: TerminalDriver | undefined): void => {
      if (owner && owner !== this && !owners.includes(owner))
        owners.push(owner);
    };

    append(inputOwners.get(this.options.input));
    append(outputOwners.get(this.options.output));
    return owners;
  }

  private reserveStreams(): void {
    const owners = this.conflictingOwners();

    // Inspect both streams before invoking any pending cleanup. In particular,
    // a healthy output owner must make a mixed input/output claim a zero-delta
    // rejection even when the input is held by a cleanup-pending driver.
    for (const owner of owners) {
      if (owner.state !== "cleanup-pending") {
        throw new Error("Terminal stream is already owned by another driver");
      }
    }

    // Input ownership is considered first, then output ownership. `owners` is
    // deduplicated, so a normal input/output pair retries one old driver once.
    // Distinct pending owners are failure-isolated just like one driver's
    // individual release steps; the first cleanup error remains authoritative.
    let firstCleanupError: unknown;
    let cleanupFailed = false;
    for (const owner of owners) {
      try {
        owner.stop();
      } catch (error) {
        if (!cleanupFailed) {
          firstCleanupError = error;
          cleanupFailed = true;
        }
      }
    }
    if (cleanupFailed) throw firstCleanupError;

    // A release callback may run arbitrary user code. Recheck the registry
    // before claiming it so re-entrant attempts cannot be overwritten.
    if (this.conflictingOwners().length > 0) {
      throw new Error("Terminal stream is already owned by another driver");
    }

    inputOwners.set(this.options.input, this);
    outputOwners.set(this.options.output, this);
    this.streamsReserved = true;
  }

  private releaseStreams(): void {
    if (!this.streamsReserved) return;
    if (inputOwners.get(this.options.input) === this) {
      inputOwners.delete(this.options.input);
    }
    if (outputOwners.get(this.options.output) === this) {
      outputOwners.delete(this.options.output);
    }
    this.streamsReserved = false;
  }

  start(session?: TerminalDriverStartOptions): void {
    if (this.state !== "idle" || this.hasOwnedResources()) {
      throw new Error("TerminalDriver already started or cleanup is pending");
    }
    this.cleanupBarrier = session
      ? Object.freeze({
          cleanup: session.cleanup,
          retainSessionOnError: session.retainSessionOnError,
        })
      : null;
    this.state = "starting";

    try {
      this.reserveStreams();
    } catch (error) {
      this.state = "idle";
      this.cleanupBarrier = null;
      throw error;
    }

    const { input, output } = this.options;
    const generation = this.generation + 1;
    this.generation = generation;
    this.parser = new InputParser();
    const dataListener = (chunk: Uint8Array | string): void => {
      this.onData(chunk, generation);
    };
    const resizeListener = (): void => {
      this.onResize(generation);
    };
    this.dataListener = dataListener;
    this.resizeListener = resizeListener;
    try {
      if (input.isTTY && input.setRawMode) {
        this.rawModeEnabled = true;
        input.setRawMode(true);
      }
      // `resume()` is only safe to acquire when the same public contract also
      // supplies its inverse. A resume-only stream cannot be restored.
      if (input.resume && input.pause) {
        this.inputResumed = true;
        input.resume();
      }
      this.dataListenerAttached = true;
      input.on("data", dataListener);
      this.resizeListenerAttached = true;
      output.on("resize", resizeListener);
      this.enterSequenceWritten = true;
      output.write(buildEnterSequence(this.mode));
      this.state = "running";
    } catch (error) {
      try {
        this.stopSession(false);
      } catch {
        // Preserve the startup error after best-effort rollback.
      }
      throw error;
    }
  }

  stop(): void {
    if (
      this.state === "idle" &&
      !this.hasOwnedResources() &&
      this.cleanupBarrier === null
    )
      return;
    if (this.state === "starting" || this.state === "stopping") {
      throw new Error(
        "TerminalDriver lifecycle transition is already in progress",
      );
    }
    this.stopSession(true);
  }

  private stopSession(allowRetainSession: boolean): void {
    const previousState = this.state;
    this.state = "stopping";

    let firstError: unknown;
    let hasError = false;
    if (this.cleanupBarrier) {
      const barrier = this.cleanupBarrier;
      try {
        barrier.cleanup();
        if (this.cleanupBarrier === barrier) this.cleanupBarrier = null;
      } catch (error) {
        let retainSession = false;
        if (allowRetainSession && barrier.retainSessionOnError) {
          try {
            retainSession = barrier.retainSessionOnError(error) === true;
          } catch {
            // A policy failure cannot replace the cleanup error or strand the
            // driver mid-transition. Treat it as a non-retain decision.
          }
        }
        if (retainSession) {
          this.state =
            previousState === "cleanup-pending" ? "cleanup-pending" : "running";
          throw error;
        }
        firstError = error;
        hasError = true;
      }
    }

    this.clearEscapeTimer();

    try {
      this.releaseResources();
    } catch (error) {
      if (!hasError) {
        firstError = error;
        hasError = true;
      }
    }

    if (this.cleanupBarrier || this.hasOwnedResources()) {
      this.state = "cleanup-pending";
    } else {
      this.state = "idle";
      this.releaseStreams();
    }

    if (hasError) throw firstError;
  }

  private releaseResources(): void {
    let firstError: unknown;
    let hasError = false;
    const attempt = (release: () => void, released: () => void): void => {
      try {
        release();
        released();
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
      }
    };

    const { input, output } = this.options;
    if (this.enterSequenceWritten) {
      attempt(
        () => output.write(buildLeaveSequence(this.mode)),
        () => {
          this.enterSequenceWritten = false;
        },
      );
    }
    if (this.dataListenerAttached && this.dataListener) {
      const dataListener = this.dataListener;
      attempt(
        () => input.off("data", dataListener),
        () => {
          this.dataListenerAttached = false;
          if (this.dataListener === dataListener) this.dataListener = null;
        },
      );
    }
    if (this.resizeListenerAttached && this.resizeListener) {
      const resizeListener = this.resizeListener;
      attempt(
        () => output.off("resize", resizeListener),
        () => {
          this.resizeListenerAttached = false;
          if (this.resizeListener === resizeListener)
            this.resizeListener = null;
        },
      );
    }
    if (this.rawModeEnabled) {
      attempt(
        () => input.setRawMode?.(false),
        () => {
          this.rawModeEnabled = false;
        },
      );
    }
    if (this.inputResumed) {
      attempt(
        () => input.pause?.(),
        () => {
          this.inputResumed = false;
        },
      );
    }

    if (hasError) throw firstError;
  }
}
