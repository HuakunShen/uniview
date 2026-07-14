import { CellBuffer } from "./cell-buffer";
import type { CellStyle, StyleTable } from "../style/style-table";

/** Terminal cursor position and visibility for a rendered frame. */
export interface CursorState {
  x: number;
  y: number;
  visible: boolean;
}

/** A single serialized cell in a {@link SerializableCellFrame}. */
export interface SerializedCell {
  grapheme: string;
  width: number;
  styleId: number;
  ownerId: number;
}

/**
 * A JSON-safe snapshot of a frame — the `cells.json` correctness truth used by
 * tests and CI. Styles are stored once in the palette (indexed by style id)
 * rather than repeated per cell.
 */
export interface SerializableCellFrame {
  width: number;
  height: number;
  cells: SerializedCell[][];
  styles: CellStyle[];
  cursor: CursorState | null;
}

export interface FrameTextOptions {
  /** Strip trailing blank columns from each line. */
  trimRight?: boolean;
}

/** Render each buffer row to a plain string (one entry per row). */
export function frameToLines(
  buffer: CellBuffer,
  options: FrameTextOptions = {},
): string[] {
  const lines: string[] = [];
  for (let y = 0; y < buffer.height; y += 1) {
    let line = "";
    const base = y * buffer.width;
    for (let x = 0; x < buffer.width; x += 1) {
      // Continuation halves carry an empty grapheme, so joining stays correct.
      line += buffer.graphemes[base + x];
    }
    lines.push(options.trimRight ? line.replace(/\s+$/u, "") : line);
  }
  return lines;
}

/** Render the whole frame to a single newline-joined string. */
export function frameToText(
  buffer: CellBuffer,
  options: FrameTextOptions = {},
): string {
  return frameToLines(buffer, options).join("\n");
}

/** Serialize a buffer (plus optional cursor) to a JSON-safe frame snapshot. */
export function serializeFrame(
  buffer: CellBuffer,
  styles: StyleTable,
  cursor: CursorState | null = null,
): SerializableCellFrame {
  const cells: SerializedCell[][] = [];
  for (let y = 0; y < buffer.height; y += 1) {
    const row: SerializedCell[] = [];
    const base = y * buffer.width;
    for (let x = 0; x < buffer.width; x += 1) {
      const i = base + x;
      row.push({
        grapheme: buffer.graphemes[i]!,
        width: buffer.widths[i]!,
        styleId: buffer.styleIds[i]!,
        ownerId: buffer.ownerIds[i]!,
      });
    }
    cells.push(row);
  }

  return {
    width: buffer.width,
    height: buffer.height,
    cells,
    styles: styles.palette(),
    cursor,
  };
}
