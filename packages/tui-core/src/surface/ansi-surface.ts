import { CellBuffer, CellFlags } from "../buffer/cell-buffer";
import { StyleTable, DEFAULT_STYLE_ID } from "../style/style-table";
import {
  CURSOR_HIDE,
  CURSOR_SHOW,
  SGR_RESET,
  SYNC_BEGIN,
  SYNC_END,
  cursorTo,
  sgrFor,
} from "../ansi/encode";
import type { CellSurface, FrameUpdate, PresentStats, Size } from "./types";

export interface AnsiCellSurfaceOptions {
  /** Sink for ANSI bytes. Inject a capture in tests; default is stdout. */
  write: (chunk: string) => void;
  /** Style table used to resolve style ids painted into frames. */
  styles?: StyleTable;
}

/**
 * A {@link CellSurface} that emits ANSI escape sequences for exactly the
 * changed cell runs — never a full-screen clear. A style/cursor state machine
 * avoids redundant SGR sequences, so a single-cell update is a few bytes.
 */
export class AnsiCellSurface implements CellSurface {
  readonly kind = "ansi" as const;

  private readonly write: (chunk: string) => void;
  private readonly styles: StyleTable;
  private cursorVisible: boolean | null = null;

  constructor(options: AnsiCellSurfaceOptions) {
    this.write = options.write;
    this.styles = options.styles ?? new StyleTable();
  }

  mount(_size: Size): void {
    this.cursorVisible = null;
  }

  resize(_size: Size): void {
    // The next frame carries a dimension change, which forces a full repaint.
  }

  present(frame: CellBuffer, update: FrameUpdate): PresentStats {
    let out = "";
    let currentStyle = -1;

    for (const run of update.changedRuns) {
      out += cursorTo(run.start, run.y);
      let x = run.start;
      while (x < run.end) {
        const i = frame.index(x, run.y);
        if (frame.flags[i]! & CellFlags.Continuation) {
          x += 1;
          continue;
        }
        const styleId = frame.styleIds[i]!;
        if (styleId !== currentStyle) {
          out += sgrFor(this.styles.get(styleId));
          currentStyle = styleId;
        }
        out += frame.graphemes[i];
        x += Math.max(1, frame.widths[i]!);
      }
    }

    // Leave the terminal in a known style after touching any cells.
    if (currentStyle !== -1 && currentStyle !== DEFAULT_STYLE_ID) {
      out += SGR_RESET;
    }

    const cursor = update.cursor;
    if (cursor.visible !== this.cursorVisible) {
      out += cursor.visible ? CURSOR_SHOW : CURSOR_HIDE;
      this.cursorVisible = cursor.visible;
    }
    if (cursor.visible) {
      out += cursorTo(cursor.x, cursor.y);
    }

    // Present the whole frame atomically: wrap the changed-run writes in
    // Synchronized Output so a large delta composites in one step (no tearing),
    // and hide the hardware cursor across the bulk write so it doesn't flash
    // across half-painted cells. Unsupported terminals ignore both.
    if (out.length > 0) {
      const guardCursor = cursor.visible;
      this.write(`${SYNC_BEGIN}${guardCursor ? CURSOR_HIDE : ""}${out}${guardCursor ? CURSOR_SHOW + cursorTo(cursor.x, cursor.y) : ""}${SYNC_END}`);
    }

    return {
      rowsPainted: update.dirtyRows.length,
      runsPainted: update.changedRuns.length,
      bytesWritten: Buffer.byteLength(out, "utf8"),
    };
  }

  destroy(): void {
    this.write(SGR_RESET + CURSOR_SHOW);
    this.cursorVisible = true;
  }
}
