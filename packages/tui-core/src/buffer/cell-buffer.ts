import {
  defaultWidthCalculator,
  graphemesOf,
  type WidthCalculator,
} from "../text/graphemes";

/** Per-cell bit flags stored in the buffer's `flags` array. */
export enum CellFlags {
  None = 0,
  /** This cell is the trailing half of a wide (width-2) grapheme. */
  Continuation = 1 << 0,
}

/** A read-only view of a single cell, materialised on demand. */
export interface CellView {
  grapheme: string;
  width: 0 | 1 | 2;
  styleId: number;
  ownerId: number;
  flags: CellFlags;
}

const BLANK = " ";

/**
 * A framebuffer of terminal cells stored as a struct-of-arrays for cheap
 * allocation and diffing. Every wide grapheme occupies a lead cell (width 2)
 * followed by a continuation cell (width 0) so that measurement and drawing
 * never disagree — the invariant the POC renderer violated.
 */
export class CellBuffer {
  readonly graphemes: string[];
  readonly widths: Uint8Array;
  readonly styleIds: Uint32Array;
  readonly ownerIds: Uint32Array;
  readonly flags: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const length = width * height;
    this.graphemes = new Array<string>(length).fill(BLANK);
    this.widths = new Uint8Array(length).fill(1);
    this.styleIds = new Uint32Array(length);
    this.ownerIds = new Uint32Array(length);
    this.flags = new Uint8Array(length);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  /** An independent deep copy of this buffer. */
  clone(): CellBuffer {
    const copy = new CellBuffer(this.width, this.height);
    for (let i = 0; i < this.graphemes.length; i += 1) {
      copy.graphemes[i] = this.graphemes[i]!;
    }
    copy.widths.set(this.widths);
    copy.styleIds.set(this.styleIds);
    copy.ownerIds.set(this.ownerIds);
    copy.flags.set(this.flags);
    return copy;
  }

  cellAt(x: number, y: number): CellView {
    const i = this.index(x, y);
    return {
      grapheme: this.graphemes[i]!,
      width: this.widths[i] as 0 | 1 | 2,
      styleId: this.styleIds[i]!,
      ownerId: this.ownerIds[i]!,
      flags: this.flags[i] as CellFlags,
    };
  }

  /** Reset every cell to a blank single-width cell carrying `styleId`. */
  clear(styleId = 0, ownerId = 0): void {
    this.graphemes.fill(BLANK);
    this.widths.fill(1);
    this.styleIds.fill(styleId);
    this.ownerIds.fill(ownerId);
    this.flags.fill(CellFlags.None);
  }

  /** Reset a single cell in-place to a blank single-width cell. */
  private blankCell(i: number): void {
    this.graphemes[i] = BLANK;
    this.widths[i] = 1;
    this.styleIds[i] = 0;
    this.ownerIds[i] = 0;
    this.flags[i] = CellFlags.None;
  }

  /**
   * Repair the wide-cell invariant around `(x, y)` before overwriting it so a
   * new write never leaves a dangling lead or continuation half behind.
   */
  private repairBefore(x: number, y: number): void {
    const i = this.index(x, y);
    // Overwriting a continuation half orphans its lead to the left.
    if (this.flags[i]! & CellFlags.Continuation && x > 0) {
      this.blankCell(this.index(x - 1, y));
    }
    // Overwriting a wide lead orphans its continuation to the right.
    if (this.widths[i] === 2 && x + 1 < this.width) {
      const right = this.index(x + 1, y);
      if (this.flags[right]! & CellFlags.Continuation) {
        this.blankCell(right);
      }
    }
  }

  /**
   * Draw `text` starting at `(x, y)` and return the ending cursor column.
   * Zero-width clusters attach to the previous lead cell; wide clusters write a
   * lead + continuation pair; writes are clipped to the buffer's right edge.
   */
  writeText(
    x: number,
    y: number,
    text: string,
    styleId: number,
    ownerId: number,
    widths: WidthCalculator = defaultWidthCalculator,
    clipRight: number = this.width,
  ): number {
    if (y < 0 || y >= this.height) return x;

    const right = Math.min(this.width, clipRight);
    let cursor = x;

    for (const grapheme of graphemesOf(text)) {
      const width = widths.widthOf(grapheme);

      if (width === 0) {
        // Combining-only cluster: fold it into the lead cell to its left.
        const left = cursor - 1;
        if (left >= 0 && left < this.width && !(this.flags[this.index(left, y)]! & CellFlags.Continuation)) {
          this.graphemes[this.index(left, y)] += grapheme;
        }
        continue;
      }

      if (cursor >= right) break;
      if (width === 2 && cursor === right - 1) break;

      this.repairBefore(cursor, y);
      const lead = this.index(cursor, y);
      this.graphemes[lead] = grapheme;
      this.widths[lead] = width;
      this.styleIds[lead] = styleId;
      this.ownerIds[lead] = ownerId;
      this.flags[lead] = CellFlags.None;

      if (width === 2) {
        this.repairBefore(cursor + 1, y);
        const cont = this.index(cursor + 1, y);
        this.graphemes[cont] = "";
        this.widths[cont] = 0;
        this.styleIds[cont] = styleId;
        this.ownerIds[cont] = ownerId;
        this.flags[cont] = CellFlags.Continuation;
      }

      cursor += width;
    }

    return cursor;
  }
}
