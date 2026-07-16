import type { RgbaImage } from "@uniview/tui-core";

/**
 * Synthetic RGBA test images. They stand in for a decoded photo so the demo is
 * self-contained (no bundled binary, no native decoder) while exercising the
 * exact pipeline a real image takes: a large source raster that `<Image>` box-
 * downsamples and paints as half-block ▀ cells. To view a real file instead,
 * decode it to `{ data: RGBA8, width, height }` (a Node/Bun bridge plugin via
 * `sharp`/`pngjs`, or a browser Worker via `OffscreenCanvas.getImageData`) and
 * hand that to `<Image>` — see the README.
 */

/** The Mandelbrot set with the classic Bernstein-polynomial smooth palette. */
function mandelbrot(width: number, height: number, maxIter = 180): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const [cx0, cx1, cy0, cy1] = [-2.3, 0.9, -1.25, 1.25];
  for (let py = 0; py < height; py += 1) {
    const y0 = cy0 + (cy1 - cy0) * (py / (height - 1));
    for (let px = 0; px < width; px += 1) {
      const x0 = cx0 + (cx1 - cx0) * (px / (width - 1));
      let x = 0;
      let y = 0;
      let iter = 0;
      while (x * x + y * y <= 4 && iter < maxIter) {
        const xt = x * x - y * y + x0;
        y = 2 * x * y + y0;
        x = xt;
        iter += 1;
      }
      const i = (py * width + px) * 4;
      const t = iter / maxIter;
      const inside = iter >= maxIter;
      data[i] = inside ? 0 : Math.round(9 * (1 - t) * t * t * t * 255);
      data[i + 1] = inside ? 0 : Math.round(15 * (1 - t) * (1 - t) * t * t * 255);
      data[i + 2] = inside ? 0 : Math.round(8.5 * (1 - t) * (1 - t) * (1 - t) * t * 255);
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** A smooth two-axis RGB gradient. */
function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const i = (py * width + px) * 4;
      data[i] = Math.round((px / (width - 1)) * 255);
      data[i + 1] = Math.round((py / (height - 1)) * 255);
      data[i + 2] = Math.round((1 - px / (width - 1)) * 255);
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** An HSV color wheel (hue by angle, saturation by radius). */
function colorWheel(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rMax = Math.min(cx, cy);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      const r = Math.hypot(dx, dy) / rMax;
      const i = (py * width + px) * 4;
      if (r > 1) {
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = 255;
        continue;
      }
      const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const [rr, gg, bb] = hsvToRgb(h, r, 1);
      data[i] = rr;
      data[i + 1] = gg;
      data[i + 2] = bb;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export interface NamedImage {
  name: string;
  image: RgbaImage;
}

/** The built-in gallery, generated once at the given source resolution. */
export function gallery(size = 256): NamedImage[] {
  return [
    { name: "Mandelbrot", image: mandelbrot(size, size) },
    { name: "Color wheel", image: colorWheel(size, size) },
    { name: "RGB gradient", image: gradient(size, size) },
  ];
}
