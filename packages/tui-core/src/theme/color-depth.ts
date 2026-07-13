import type { RgbColor } from "../style/style-table";

/** The 16 ANSI named colors and their reference rgb values. */
const NAMED_RGB: { name: string; rgb: RgbColor }[] = [
  { name: "black", rgb: { r: 0, g: 0, b: 0 } },
  { name: "red", rgb: { r: 205, g: 0, b: 0 } },
  { name: "green", rgb: { r: 0, g: 205, b: 0 } },
  { name: "yellow", rgb: { r: 205, g: 205, b: 0 } },
  { name: "blue", rgb: { r: 0, g: 0, b: 238 } },
  { name: "magenta", rgb: { r: 205, g: 0, b: 205 } },
  { name: "cyan", rgb: { r: 0, g: 205, b: 205 } },
  { name: "white", rgb: { r: 229, g: 229, b: 229 } },
  { name: "brightblack", rgb: { r: 127, g: 127, b: 127 } },
  { name: "brightred", rgb: { r: 255, g: 0, b: 0 } },
  { name: "brightgreen", rgb: { r: 0, g: 255, b: 0 } },
  { name: "brightyellow", rgb: { r: 255, g: 255, b: 0 } },
  { name: "brightblue", rgb: { r: 92, g: 92, b: 255 } },
  { name: "brightmagenta", rgb: { r: 255, g: 0, b: 255 } },
  { name: "brightcyan", rgb: { r: 0, g: 255, b: 255 } },
  { name: "brightwhite", rgb: { r: 255, g: 255, b: 255 } },
];

function distance(a: RgbColor, b: RgbColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Nearest of the 16 ANSI named colors (a token usable by the SGR encoder). */
export function nearestNamedColor(rgb: RgbColor): string {
  let best = NAMED_RGB[0]!;
  let bestDist = Infinity;
  for (const entry of NAMED_RGB) {
    const d = distance(rgb, entry.rgb);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return best.name;
}

function toCube(component: number): number {
  return Math.round((component / 255) * 5);
}

/** Map an rgb color to an xterm-256 palette index (deterministic). */
export function rgbToAnsi256(rgb: RgbColor): number {
  const { r, g, b } = rgb;
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  return 16 + 36 * toCube(r) + 6 * toCube(g) + toCube(b);
}
