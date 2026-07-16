import { SGR_RESET, sgrFor } from "../ansi/encode";
import type { StyledLine } from "../text/styled-text";

export interface CommittedOutputOptions {
  /** Sink for finalized lines (same shape as AnsiCellSurface's `write`). */
  write: (chunk: string) => void;
  /** Line terminator between committed lines. Defaults to "\r\n" (raw-mode safe). */
  newline?: string;
}

/**
 * An append-only "committed output" channel that prints finalized lines to the
 * terminal once — above the live frame — and never repaints them. This backs
 * `<Static>`: each line is SGR-encoded and written a single time, so a later
 * live re-render can neither erase nor re-diff it. It is a runtime/host concern,
 * not a `UINode` primitive.
 */
export class CommittedOutput {
  private readonly write: (chunk: string) => void;
  private readonly newline: string;
  private count = 0;

  constructor(options: CommittedOutputOptions) {
    this.write = options.write;
    this.newline = options.newline ?? "\r\n";
  }

  /** The number of lines committed so far — the never-repainted high-water mark. */
  get committedLines(): number {
    return this.count;
  }

  /** Emit `lines` once as finalized scrollback, then advance the high-water mark. */
  commit(lines: readonly StyledLine[]): void {
    if (lines.length === 0) return;
    let out = "";
    for (const line of lines) {
      for (const span of line) {
        out += sgrFor(span.style ?? {});
        out += span.text;
      }
      out += SGR_RESET + this.newline;
    }
    this.write(out);
    this.count += lines.length;
  }
}
