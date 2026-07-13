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
  on(event: "data", listener: (chunk: Buffer) => void): void;
  off(event: "data", listener: (chunk: Buffer) => void): void;
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
  private currentSize: Size;

  constructor(private readonly options: TerminalDriverOptions) {
    this.mode = {
      screen: options.screen ?? DEFAULT_MODE_OPTIONS.screen,
      mouse: options.mouse ?? DEFAULT_MODE_OPTIONS.mouse,
      bracketedPaste: options.bracketedPaste ?? DEFAULT_MODE_OPTIONS.bracketedPaste,
      focusReporting: options.focusReporting ?? DEFAULT_MODE_OPTIONS.focusReporting,
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

  private readonly onData = (chunk: Buffer): void => {
    this.parser.push(chunk);
    for (const event of this.parser.takeEvents()) this.options.onEvent(event);
  };

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
    if (input.isTTY) input.setRawMode?.(true);
    input.resume?.();
    input.on("data", this.onData);
    output.on("resize", this.onResize);
    output.write(buildEnterSequence(this.mode));
  }

  stop(): void {
    if (!this.entered) return;
    this.entered = false;

    const { input, output } = this.options;
    try {
      output.write(buildLeaveSequence(this.mode));
    } finally {
      input.off("data", this.onData);
      output.off("resize", this.onResize);
      if (input.isTTY) input.setRawMode?.(false);
      input.pause?.();
    }
  }
}
