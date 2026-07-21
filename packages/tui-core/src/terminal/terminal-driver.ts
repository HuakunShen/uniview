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

/**
 * Owns the real terminal for one session: raw mode, enter/leave sequences,
 * stdin parsing, and resize reporting. All I/O is injected so it runs under
 * unit tests with fake streams — no real TTY required. `stop` is idempotent
 * and always restores the terminal.
 */
export class TerminalDriver {
  private readonly parser = new InputParser();
  private readonly mode;
  private entered = false;
  private rawModeEnabled = false;
  private inputResumed = false;
  private dataListenerAttached = false;
  private resizeListenerAttached = false;
  private enterSequenceWritten = false;
  private currentSize: Size;
  private escapeTimer: ReturnType<typeof setTimeout> | null = null;

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

  private readonly onData = (chunk: Uint8Array | string): void => {
    this.clearEscapeTimer();
    this.parser.push(chunk);
    this.emitEvents();
    this.armEscapeFlush();
  };

  private emitEvents(): void {
    for (const event of this.parser.takeEvents()) this.options.onEvent(event);
  }

  /** After input goes idle, resolve a held lone ESC as an Escape keypress. */
  private armEscapeFlush(): void {
    if (!this.parser.awaitingEscape) return;
    this.escapeTimer = setTimeout(() => {
      this.escapeTimer = null;
      this.parser.flush();
      this.emitEvents();
    }, this.options.escapeFlushMs ?? 40);
    this.escapeTimer.unref?.();
  }

  private clearEscapeTimer(): void {
    if (this.escapeTimer !== null) {
      clearTimeout(this.escapeTimer);
      this.escapeTimer = null;
    }
  }

  private readonly onResize = (): void => {
    this.currentSize = this.readSize();
    this.options.onEvent({
      type: "resize",
      width: this.currentSize.width,
      height: this.currentSize.height,
    });
  };

  start(): void {
    if (this.entered) throw new Error("TerminalDriver already started");
    this.entered = true;

    const { input, output } = this.options;
    try {
      if (input.isTTY && input.setRawMode) {
        input.setRawMode(true);
        this.rawModeEnabled = true;
      }
      if (input.resume) {
        input.resume();
        this.inputResumed = true;
      }
      input.on("data", this.onData);
      this.dataListenerAttached = true;
      output.on("resize", this.onResize);
      this.resizeListenerAttached = true;
      output.write(buildEnterSequence(this.mode));
      this.enterSequenceWritten = true;
    } catch (error) {
      try {
        this.stop();
      } catch {
        // Preserve the startup error after best-effort rollback.
      }
      throw error;
    }
  }

  stop(): void {
    if (!this.entered) return;
    this.entered = false;
    this.clearEscapeTimer();

    const { input, output } = this.options;
    try {
      if (this.enterSequenceWritten) {
        this.enterSequenceWritten = false;
        output.write(buildLeaveSequence(this.mode));
      }
    } finally {
      if (this.dataListenerAttached) {
        this.dataListenerAttached = false;
        input.off("data", this.onData);
      }
      if (this.resizeListenerAttached) {
        this.resizeListenerAttached = false;
        output.off("resize", this.onResize);
      }
      if (this.rawModeEnabled) {
        this.rawModeEnabled = false;
        input.setRawMode?.(false);
      }
      if (this.inputResumed) {
        this.inputResumed = false;
        input.pause?.();
      }
    }
  }
}
