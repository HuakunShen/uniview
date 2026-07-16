import type { RenderNode } from "../paint/paint";
import { styledLinesToRenderNode } from "../content/styled-render";
import type { RgbColor } from "../style/style-table";
import type { StyledLine, StyledSpan } from "../text/styled-text";

/**
 * A decoded raster image: row-major RGBA8, `data.length === width * height * 4`.
 * The plugin decodes the file (a Node/Bun bridge via `sharp`/`pngjs`, or a
 * browser Worker via `OffscreenCanvas`) — the renderer only paints the pixels it
 * is handed, inventing no color (the PRIME DIRECTIVE).
 */
export interface RgbaImage {
  data: Uint8Array | Uint8ClampedArray | number[];
  width: number;
  height: number;
}

const BLACK: RgbColor = { r: 0, g: 0, b: 0 };

/** Alpha-composite an RGBA sample over `bg`, returning an opaque `RgbColor`. */
function composite(
  data: RgbaImage["data"],
  index: number,
  bg: RgbColor,
): RgbColor {
  const a = (data[index + 3] ?? 255) / 255;
  if (a >= 1) return { r: data[index]!, g: data[index + 1]!, b: data[index + 2]! };
  const mix = (c: number, b: number): number => Math.round(c * a + b * (1 - a));
  return {
    r: mix(data[index]!, bg.r),
    g: mix(data[index + 1]!, bg.g),
    b: mix(data[index + 2]!, bg.b),
  };
}

function sameColor(a: RgbColor, b: RgbColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export interface ImageHalfBlockOptions {
  /** Background composited under transparent pixels / padded rows. Default black. */
  background?: RgbColor;
}

/**
 * Convert an RGBA image to half-block styled lines: each cell is `▀` with
 * `fg` = the upper pixel and `bg` = the lower pixel, so one text row shows two
 * pixel rows at full color (2 vertical pixels per cell). An odd final row pads
 * its missing bottom pixel with `background`. Runs of cells sharing the same
 * (fg, bg) coalesce into one span to keep the frame diff small.
 *
 * Expects `src` already sized to the target cell grid (`width` = columns,
 * `height` ≈ 2 × rows); pair it with {@link resizeImage} + {@link fitDimensions}.
 */
export function imageToHalfBlockLines(
  src: RgbaImage,
  options: ImageHalfBlockOptions = {},
): StyledLine[] {
  const bg = options.background ?? BLACK;
  const { data, width, height } = src;
  const rows = Math.ceil(height / 2);
  const lines: StyledLine[] = [];

  for (let r = 0; r < rows; r += 1) {
    const topY = r * 2;
    const bottomY = topY + 1;
    const spans: StyledSpan[] = [];
    let run = "";
    let runFg: RgbColor | undefined;
    let runBg: RgbColor | undefined;
    const flush = (): void => {
      if (run.length === 0) return;
      spans.push({ text: run, style: { fg: runFg, bg: runBg } });
      run = "";
    };
    for (let x = 0; x < width; x += 1) {
      const fg = composite(data, (topY * width + x) * 4, bg);
      const cellBg =
        bottomY < height ? composite(data, (bottomY * width + x) * 4, bg) : bg;
      if (runFg === undefined || !sameColor(fg, runFg) || !sameColor(cellBg, runBg!)) {
        flush();
        runFg = fg;
        runBg = cellBg;
      }
      run += "▀";
    }
    flush();
    lines.push(spans);
  }
  return lines;
}

/**
 * Box-average resize of an RGBA image to `dstW × dstH`. Each destination pixel
 * is the mean of the source pixels covering its area — good for the downscale
 * that fitting an image into a terminal always is (it degrades to nearest for
 * upscale). Deterministic (integer sums, rounded) so the render is stable.
 */
export function resizeImage(src: RgbaImage, dstW: number, dstH: number): RgbaImage {
  const w = Math.max(1, Math.floor(dstW));
  const h = Math.max(1, Math.floor(dstH));
  const out = new Uint8ClampedArray(w * h * 4);
  const { data, width, height } = src;

  for (let dy = 0; dy < h; dy += 1) {
    const sy0 = Math.floor((dy * height) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((dy + 1) * height) / h));
    for (let dx = 0; dx < w; dx += 1) {
      const sx0 = Math.floor((dx * width) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((dx + 1) * width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1 && sy < height; sy += 1) {
        for (let sx = sx0; sx < sx1 && sx < width; sx += 1) {
          const i = (sy * width + sx) * 4;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          a += data[i + 3] ?? 255;
          n += 1;
        }
      }
      const o = (dy * w + dx) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Fit an `imgW × imgH` image into at most `maxCols × maxRows` terminal cells,
 * preserving aspect. A half-block cell is 1 pixel wide × 2 pixels tall, and a
 * cell is roughly twice as tall as wide, so a half-block pixel is ~square — the
 * target pixel grid is `cols × (rows × 2)` and we solve `cols / (2·rows) = imgW / imgH`.
 */
export function fitDimensions(
  imgW: number,
  imgH: number,
  maxCols: number,
  maxRows: number,
): { cols: number; rows: number } {
  const aspect = imgW / imgH; // pixels wide per pixel tall
  let cols = Math.max(1, Math.floor(maxCols));
  let rows = Math.max(1, Math.round(cols / (2 * aspect)));
  if (rows > maxRows) {
    rows = Math.max(1, Math.floor(maxRows));
    cols = Math.max(1, Math.min(Math.round(rows * 2 * aspect), Math.floor(maxCols)));
  }
  return { cols, rows };
}

export interface RenderImageOptions extends ImageHalfBlockOptions {
  /** Maximum width in terminal cells. */
  maxCols: number;
  /** Maximum height in terminal cells (rows). */
  maxRows: number;
}

/**
 * One-shot: fit → box-resize → half-block lines → a `RenderNode` column, the
 * same styled-lines-to-tree path the charts/canvas use (no new tree primitive).
 */
export function renderImage(src: RgbaImage, options: RenderImageOptions): RenderNode {
  const { cols, rows } = fitDimensions(src.width, src.height, options.maxCols, options.maxRows);
  const resized = resizeImage(src, cols, rows * 2);
  return styledLinesToRenderNode(imageToHalfBlockLines(resized, options));
}
