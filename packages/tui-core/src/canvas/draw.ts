import type { RenderNode } from "../paint/paint";
import type { Color } from "../style/style-table";
import type { StyledLine, StyledSpan } from "../text/styled-text";
import { styledLinesToRenderNode } from "../content/styled-render";
import { SubcellCanvas } from "./subcell";
import { dataToPixel } from "./coords";

/**
 * Which glyph family a Canvas rasterizes dots with. The family fixes the dot
 * resolution per cell: braille = 2×4, half-block = 1×2, dot/block = 1×1.
 */
export type Marker = "braille" | "dot" | "block" | "half-block";

/**
 * Per-shape style. `color` is caller-supplied (a named token or explicit rgb);
 * when omitted the dot carries no `fg` and inherits the surface's default
 * foreground — the renderer invents no color. `fill` applies to rect/circle.
 */
export interface DrawStyle {
  color?: Color;
  fill?: boolean;
}

/**
 * A pixel grid the shape algorithms rasterize onto. Origin is bottom-left and
 * `py` grows upward (matching {@link SubcellCanvas}, which already conforms).
 */
export interface PixelGrid {
  readonly widthPx: number;
  readonly heightPx: number;
  set(px: number, py: number, color?: Color): void;
  toStyledLines(): StyledLine[];
}

/**
 * Shared run-merging emitter: one cell row → one StyledLine, coalescing spans
 * whose `Color` is the same object by reference (like SubcellCanvas).
 */
function emitRow(
  cellWidth: number,
  glyphAt: (cx: number) => string,
  colorAt: (cx: number) => Color | undefined,
): StyledSpan[] {
  const spans: StyledSpan[] = [];
  let run = "";
  let runColor: Color | undefined;
  const flush = (): void => {
    if (run.length === 0) return;
    spans.push(runColor === undefined ? { text: run } : { text: run, style: { fg: runColor } });
    run = "";
  };
  for (let cx = 0; cx < cellWidth; cx += 1) {
    const col = colorAt(cx);
    if (col !== runColor) {
      flush();
      runColor = col;
    }
    run += glyphAt(cx);
  }
  flush();
  return spans;
}

/** A 1×1-per-cell grid painting a fixed glyph (`█` for block, `•` for dot). */
export class BlockGrid implements PixelGrid {
  readonly widthPx: number;
  readonly heightPx: number;
  private readonly filled: boolean[];
  private readonly color: (Color | undefined)[];

  constructor(
    readonly cellWidth: number,
    readonly cellHeight: number,
    private readonly glyph: string,
  ) {
    this.widthPx = cellWidth;
    this.heightPx = cellHeight;
    this.filled = new Array<boolean>(cellWidth * cellHeight).fill(false);
    this.color = new Array<Color | undefined>(cellWidth * cellHeight).fill(undefined);
  }

  set(px: number, py: number, color?: Color): void {
    if (px < 0 || py < 0 || px >= this.widthPx || py >= this.heightPx) return;
    const idx = (this.heightPx - 1 - py) * this.cellWidth + px; // flip to top-first
    this.filled[idx] = true;
    if (color !== undefined) this.color[idx] = color;
  }

  toStyledLines(): StyledLine[] {
    const lines: StyledLine[] = [];
    for (let cy = 0; cy < this.cellHeight; cy += 1) {
      const at = (cx: number): number => cy * this.cellWidth + cx;
      lines.push(
        emitRow(
          this.cellWidth,
          (cx) => (this.filled[at(cx)]! ? this.glyph : " "),
          (cx) => (this.filled[at(cx)]! ? this.color[at(cx)] : undefined),
        ),
      );
    }
    return lines;
  }
}

/**
 * A 1×2-per-cell grid (upper/lower halves) using ▀ ▄ █. Doubles vertical
 * resolution; one fg per cell (upper half wins when both are lit).
 */
export class HalfBlockGrid implements PixelGrid {
  readonly widthPx: number;
  readonly heightPx: number;
  private readonly upper: boolean[];
  private readonly lower: boolean[];
  private readonly upperColor: (Color | undefined)[];
  private readonly lowerColor: (Color | undefined)[];

  constructor(
    readonly cellWidth: number,
    readonly cellHeight: number,
  ) {
    this.widthPx = cellWidth;
    this.heightPx = cellHeight * 2;
    const n = cellWidth * cellHeight;
    this.upper = new Array<boolean>(n).fill(false);
    this.lower = new Array<boolean>(n).fill(false);
    this.upperColor = new Array<Color | undefined>(n).fill(undefined);
    this.lowerColor = new Array<Color | undefined>(n).fill(undefined);
  }

  set(px: number, py: number, color?: Color): void {
    if (px < 0 || py < 0 || px >= this.widthPx || py >= this.heightPx) return;
    const row2 = this.heightPx - 1 - py; // 0 = very top
    const idx = (row2 >> 1) * this.cellWidth + px;
    if ((row2 & 1) === 0) {
      this.upper[idx] = true;
      if (color !== undefined) this.upperColor[idx] = color;
    } else {
      this.lower[idx] = true;
      if (color !== undefined) this.lowerColor[idx] = color;
    }
  }

  toStyledLines(): StyledLine[] {
    const lines: StyledLine[] = [];
    for (let cy = 0; cy < this.cellHeight; cy += 1) {
      const at = (cx: number): number => cy * this.cellWidth + cx;
      const glyphAt = (cx: number): string => {
        const u = this.upper[at(cx)]!;
        const l = this.lower[at(cx)]!;
        return u && l ? "█" : u ? "▀" : l ? "▄" : " ";
      };
      const colorAt = (cx: number): Color | undefined => {
        const i = at(cx);
        return this.upper[i] ? this.upperColor[i] : this.lower[i] ? this.lowerColor[i] : undefined;
      };
      lines.push(emitRow(this.cellWidth, glyphAt, colorAt));
    }
    return lines;
  }
}

function createGrid(marker: Marker, cellWidth: number, cellHeight: number): PixelGrid {
  switch (marker) {
    case "braille":
      return new SubcellCanvas(cellWidth, cellHeight);
    case "half-block":
      return new HalfBlockGrid(cellWidth, cellHeight);
    case "block":
      return new BlockGrid(cellWidth, cellHeight, "█");
    case "dot":
      return new BlockGrid(cellWidth, cellHeight, "•");
  }
}

export interface CanvasDrawOptions {
  /** Canvas width in terminal cells. */
  width: number;
  /** Canvas height in terminal cells. */
  height: number;
  /** Glyph family. Defaults to "braille" (2×4 dots per cell). */
  marker?: Marker;
  /** X data bounds for {@link DrawContext.project}. Defaults to [0, 1]. */
  xBounds?: readonly [number, number];
  /** Y data bounds for {@link DrawContext.project}. Defaults to [0, 1]. */
  yBounds?: readonly [number, number];
}

export type CanvasDraw = (cv: DrawContext) => void;

/**
 * The drawing handle passed to a Canvas `draw` callback. Shapes take pixel-space
 * coordinates (origin bottom-left, `py` up); use {@link project} to map data
 * space through the shared {@link dataToPixel}.
 */
export class DrawContext {
  readonly width: number;
  readonly height: number;
  readonly widthPx: number;
  readonly heightPx: number;
  private readonly xBounds: readonly [number, number];
  private readonly yBounds: readonly [number, number];

  constructor(
    private readonly grid: PixelGrid,
    options: CanvasDrawOptions,
  ) {
    this.width = options.width;
    this.height = options.height;
    this.widthPx = grid.widthPx;
    this.heightPx = grid.heightPx;
    this.xBounds = options.xBounds ?? [0, 1];
    this.yBounds = options.yBounds ?? [0, 1];
  }

  /** Map a data-space point to pixel-space `[px, py]` via {@link dataToPixel}. */
  project(x: number, y: number): [number, number] {
    return [dataToPixel(x, this.xBounds, this.widthPx), dataToPixel(y, this.yBounds, this.heightPx)];
  }

  set(px: number, py: number, style?: DrawStyle): void {
    this.grid.set(Math.round(px), Math.round(py), style?.color);
  }

  line(x0: number, y0: number, x1: number, y1: number, style?: DrawStyle): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.grid.set(x, y, style?.color);
      if (x === xe && y === ye) break;
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

  rect(x: number, y: number, w: number, h: number, style?: DrawStyle): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = x0 + Math.round(w) - 1;
    const y1 = y0 + Math.round(h) - 1;
    if (style?.fill) {
      for (let yy = y0; yy <= y1; yy += 1) this.line(x0, yy, x1, yy, style);
      return;
    }
    this.line(x0, y0, x1, y0, style);
    this.line(x0, y1, x1, y1, style);
    this.line(x0, y0, x0, y1, style);
    this.line(x1, y0, x1, y1, style);
  }

  circle(cx: number, cy: number, r: number, style?: DrawStyle): void {
    const cx0 = Math.round(cx);
    const cy0 = Math.round(cy);
    const rad = Math.round(r);
    if (rad <= 0) {
      this.grid.set(cx0, cy0, style?.color);
      return;
    }
    if (style?.fill) {
      for (let dy = -rad; dy <= rad; dy += 1) {
        const dx = Math.floor(Math.sqrt(Math.max(0, rad * rad - dy * dy)));
        this.line(cx0 - dx, cy0 + dy, cx0 + dx, cy0 + dy, style);
      }
      return;
    }
    // Midpoint circle: plot all 8 octants.
    let x = rad;
    let y = 0;
    let err = 1 - rad;
    while (x >= y) {
      const pts: readonly [number, number][] = [
        [cx0 + x, cy0 + y],
        [cx0 - x, cy0 + y],
        [cx0 + x, cy0 - y],
        [cx0 - x, cy0 - y],
        [cx0 + y, cy0 + x],
        [cx0 - y, cy0 + x],
        [cx0 + y, cy0 - x],
        [cx0 - y, cy0 - x],
      ];
      for (const [px, py] of pts) this.grid.set(px, py, style?.color);
      y += 1;
      if (err < 0) {
        err += 2 * y + 1;
      } else {
        x -= 1;
        err += 2 * (y - x) + 1;
      }
    }
  }

  points(pts: readonly (readonly [number, number])[], style?: DrawStyle): void {
    for (const [px, py] of pts) this.grid.set(Math.round(px), Math.round(py), style?.color);
  }
}

/**
 * Rasterize a `draw` callback onto a braille/block/half-block grid and emit it
 * as a {@link RenderNode} of styled text lines — the same output path charts use
 * (`styledLinesToRenderNode`), so no new tree primitive is introduced. Pure:
 * data → RenderNode, no React, no terminal I/O.
 */
export function renderCanvas(options: CanvasDrawOptions, draw: CanvasDraw): RenderNode {
  const grid = createGrid(options.marker ?? "braille", options.width, options.height);
  draw(new DrawContext(grid, options));
  return styledLinesToRenderNode(grid.toStyledLines());
}
