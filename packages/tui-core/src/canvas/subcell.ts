import type { StyledLine, StyledSpan } from "../text/styled-text";
import type { Color } from "../style/style-table";

/** Braille bit for a dot at (col∈0..1, row∈0..3) within a 2×4 cell (top row = 0). */
const BRAILLE_BITS: readonly (readonly number[])[] = [
  [0x01, 0x08], // row 0 (top)
  [0x02, 0x10], // row 1
  [0x04, 0x20], // row 2
  [0x40, 0x80], // row 3 (bottom)
];

/** A braille (2×4-per-cell) drawing surface that rasterizes to styled lines. */
export class SubcellCanvas {
  readonly widthPx: number;
  readonly heightPx: number;
  private readonly mask: Uint8Array;
  private readonly color: (Color | undefined)[];

  constructor(
    readonly cellWidth: number,
    readonly cellHeight: number,
  ) {
    this.widthPx = cellWidth * 2;
    this.heightPx = cellHeight * 4;
    this.mask = new Uint8Array(cellWidth * cellHeight);
    this.color = new Array<Color | undefined>(cellWidth * cellHeight).fill(undefined);
  }

  /** Set a dot. Origin is bottom-left; `py` grows upward. */
  set(px: number, py: number, color?: Color): void {
    if (px < 0 || py < 0 || px >= this.widthPx || py >= this.heightPx) return;
    const topRow = this.heightPx - 1 - py; // flip to top-left row space
    const cellX = px >> 1;
    const cellY = topRow >> 2;
    const idx = cellY * this.cellWidth + cellX;
    this.mask[idx]! |= BRAILLE_BITS[topRow & 3]![px & 1]!;
    if (color !== undefined) this.color[idx] = color;
  }

  line(x0: number, y0: number, x1: number, y1: number, color?: Color): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const dx = Math.abs(Math.round(x1) - x);
    const dy = -Math.abs(Math.round(y1) - y);
    const sx = x < x1 ? 1 : -1;
    const sy = y < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x, y, color);
      if (x === Math.round(x1) && y === Math.round(y1)) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  toStyledLines(): StyledLine[] {
    const lines: StyledLine[] = [];
    for (let cy = 0; cy < this.cellHeight; cy += 1) {
      const spans: StyledSpan[] = [];
      let run = "";
      let runColor: Color | undefined;
      const flush = () => {
        if (run.length === 0) return;
        spans.push(runColor === undefined ? { text: run } : { text: run, style: { fg: runColor } });
        run = "";
      };
      for (let cx = 0; cx < this.cellWidth; cx += 1) {
        const idx = cy * this.cellWidth + cx;
        const bits = this.mask[idx]!;
        const glyph = bits === 0 ? " " : String.fromCharCode(0x2800 + bits);
        const col = bits === 0 ? undefined : this.color[idx];
        if (col !== runColor) {
          flush();
          runColor = col;
        }
        run += glyph;
      }
      flush();
      lines.push(spans);
    }
    return lines;
  }
}
