import { CellBuffer, CellFlags } from "../buffer/cell-buffer";

/** A contiguous run of changed columns `[start, end)` on row `y`. */
export interface CellRun {
  y: number;
  start: number;
  end: number;
}

/** Two cells are visually equal when glyph, width and style all match. */
function cellsEqual(prev: CellBuffer, next: CellBuffer, i: number): boolean {
  return (
    prev.graphemes[i] === next.graphemes[i] &&
    prev.widths[i] === next.widths[i] &&
    prev.styleIds[i] === next.styleIds[i]
  );
}

/** True when column `x` on row `y` is the trailing half of a wide glyph. */
function isContinuation(buffer: CellBuffer, x: number, y: number): boolean {
  return (buffer.flags[buffer.index(x, y)]! & CellFlags.Continuation) !== 0;
}

/**
 * Compute the changed cell runs between two frames.
 *
 * Runs never split a wide glyph: a run is expanded left to include a lead cell
 * when it begins on a continuation half, and expanded right to include the
 * continuation half when it ends on a wide lead. A dimension change forces a
 * full repaint (every row of `next`).
 */
export function diffFrames(prev: CellBuffer, next: CellBuffer): CellRun[] {
  if (prev.width !== next.width || prev.height !== next.height) {
    const runs: CellRun[] = [];
    for (let y = 0; y < next.height; y += 1) {
      runs.push({ y, start: 0, end: next.width });
    }
    return runs;
  }

  const runs: CellRun[] = [];
  const width = next.width;

  for (let y = 0; y < next.height; y += 1) {
    const rowBase = y * width;
    let x = 0;

    while (x < width) {
      if (cellsEqual(prev, next, rowBase + x)) {
        x += 1;
        continue;
      }

      // Start of a changed run; pull the start back to a wide lead if needed.
      let start = x;
      if (isContinuation(next, start, y) || isContinuation(prev, start, y)) {
        start = Math.max(0, start - 1);
      }

      let end = x + 1;
      while (end < width && !cellsEqual(prev, next, rowBase + end)) {
        end += 1;
      }

      // Extend past a trailing wide glyph so its continuation is repainted too.
      while (
        end < width &&
        (isContinuation(next, end, y) || isContinuation(prev, end, y))
      ) {
        end += 1;
      }

      runs.push({ y, start, end });
      x = end;
    }
  }

  return runs;
}
