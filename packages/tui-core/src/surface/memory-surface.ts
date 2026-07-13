import { CellBuffer } from "../buffer/cell-buffer";
import {
  frameToLines,
  frameToText,
  serializeFrame,
  type FrameTextOptions,
  type SerializableCellFrame,
} from "../buffer/frame";
import { StyleTable } from "../style/style-table";
import type { CellSurface, FrameUpdate, PresentStats, Size } from "./types";

export interface MemoryCellSurfaceOptions {
  /**
   * Style table used to resolve style ids when serializing cells. Pass the same
   * table the frames were painted with; defaults to a fresh empty table.
   */
  styles?: StyleTable;
}

/**
 * A {@link CellSurface} that records presented frames in memory instead of
 * emitting them anywhere. It is the canonical test oracle: assert on
 * `lines()`/`text()`/`cells()` and inspect `debug` for painted rows.
 */
export class MemoryCellSurface implements CellSurface {
  readonly kind = "memory" as const;

  private readonly styles: StyleTable;
  private frame: CellBuffer | null = null;
  private update: FrameUpdate | null = null;
  private presents = 0;

  readonly debug = { lastUpdatedRows: [] as number[] };

  constructor(options: MemoryCellSurfaceOptions = {}) {
    this.styles = options.styles ?? new StyleTable();
  }

  mount(_size: Size): void {
    this.reset();
  }

  resize(_size: Size): void {
    // The next presented frame carries the new size; nothing to pre-allocate.
  }

  present(frame: CellBuffer, update: FrameUpdate): PresentStats {
    this.frame = frame.clone();
    this.update = update;
    this.presents += 1;
    this.debug.lastUpdatedRows = [...update.dirtyRows];
    return {
      rowsPainted: update.dirtyRows.length,
      runsPainted: update.changedRuns.length,
    };
  }

  destroy(): void {
    this.reset();
  }

  private reset(): void {
    this.frame = null;
    this.update = null;
    this.debug.lastUpdatedRows = [];
  }

  // --- Test accessors -------------------------------------------------------

  get presentCount(): number {
    return this.presents;
  }

  get lastUpdate(): FrameUpdate | null {
    return this.update;
  }

  get lastFrame(): CellBuffer | null {
    return this.frame;
  }

  lines(options?: FrameTextOptions): string[] {
    return this.frame ? frameToLines(this.frame, options) : [];
  }

  text(options?: FrameTextOptions): string {
    return this.frame ? frameToText(this.frame, options) : "";
  }

  cells(): SerializableCellFrame | null {
    if (!this.frame) return null;
    return serializeFrame(this.frame, this.styles, this.update?.cursor ?? null);
  }

  cursor(): FrameUpdate["cursor"] | null {
    return this.update?.cursor ?? null;
  }
}
