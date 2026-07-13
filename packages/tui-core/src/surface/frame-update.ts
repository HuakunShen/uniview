import type { CellBuffer } from "../buffer/cell-buffer";
import type { CursorState } from "../buffer/frame";
import { diffFrames, type CellRun } from "../diff/frame-diff";
import type { FrameUpdate } from "./types";

/** A hidden cursor at the origin — the default when a frame has no caret. */
export const HIDDEN_CURSOR: CursorState = { x: 0, y: 0, visible: false };

function fullRepaintRuns(next: CellBuffer): CellRun[] {
  const runs: CellRun[] = [];
  for (let y = 0; y < next.height; y += 1) {
    runs.push({ y, start: 0, end: next.width });
  }
  return runs;
}

function uniqueRows(runs: readonly CellRun[]): number[] {
  const rows: number[] = [];
  let last = -1;
  for (const run of runs) {
    if (run.y !== last) {
      rows.push(run.y);
      last = run.y;
    }
  }
  return rows;
}

/**
 * Derive a {@link FrameUpdate} from a diff of `prev -> next`. With no previous
 * frame (or a size change) the result is a full repaint of every row.
 */
export function buildFrameUpdate(
  prev: CellBuffer | null,
  next: CellBuffer,
  revision: number,
  cursor: CursorState,
): FrameUpdate {
  const dimensionsChanged =
    prev === null ||
    prev.width !== next.width ||
    prev.height !== next.height;

  if (dimensionsChanged) {
    const runs = fullRepaintRuns(next);
    return {
      revision,
      dirtyRows: uniqueRows(runs),
      changedRuns: runs,
      cursor,
      fullRepaint: true,
    };
  }

  const runs = diffFrames(prev, next);
  return {
    revision,
    dirtyRows: uniqueRows(runs),
    changedRuns: runs,
    cursor,
    fullRepaint: false,
  };
}
