import type { CellBuffer } from "../buffer/cell-buffer";
import type { CursorState } from "../buffer/frame";
import type { CellRun } from "../diff/frame-diff";

/** A terminal size in cells. */
export interface Size {
  width: number;
  height: number;
}

/**
 * The minimal changes needed to bring a surface from the previous frame to the
 * next one. `changedRuns` are the exact column ranges; `dirtyRows` is the set
 * of affected rows (a convenience for row-granular surfaces such as the DOM).
 */
export interface FrameUpdate {
  revision: number;
  dirtyRows: readonly number[];
  changedRuns: readonly CellRun[];
  cursor: CursorState;
  fullRepaint: boolean;
}

/** What a surface reports after presenting a frame. */
export interface PresentStats {
  rowsPainted: number;
  runsPainted: number;
  bytesWritten?: number;
}

export type SurfaceKind = "ansi" | "dom" | "svg" | "memory";

/**
 * A presentation target for computed frames. A backend computes a
 * {@link CellBuffer}; a `CellSurface` turns it into pixels/bytes/DOM. The same
 * buffer can drive ANSI, DOM, SVG and Memory surfaces identically.
 */
export interface CellSurface {
  readonly kind: SurfaceKind;
  mount(size: Size): void;
  resize(size: Size): void;
  present(frame: CellBuffer, update: FrameUpdate): PresentStats;
  destroy(): void;
}
