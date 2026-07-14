/**
 * Reads Tailwind's real palette out of the installed `tailwindcss/theme.css`.
 *
 * Tailwind v4 publishes its colors in oklch, so getting a hex out means actually
 * doing the colorspace conversion (oklch → linear sRGB → gamma-encoded sRGB).
 * Shared by the generator and by the drift test, so the two can't disagree about
 * what "the real value" is.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** oklch → `#rrggbb`, clamped into sRGB (Tailwind's own hex docs do the same). */
export function oklchToHex(lightness, chroma, hueDegrees) {
  const h = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(h);
  const b = chroma * Math.sin(h);

  // Inverse of the OKLab transform: back through the LMS cone responses.
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  const channel = (u) => {
    const encoded =
      u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(Math.max(u, 0), 1 / 2.4) - 0.055;
    const byte = Math.round(Math.min(1, Math.max(0, encoded)) * 255);
    return byte.toString(16).padStart(2, "0");
  };

  return `#${linear.map(channel).join("")}`;
}

/** `{ red: ["#fef2f2", …11 shades], … }` — families in Tailwind's own order. */
export function readTailwindFamilies() {
  const css = readFileSync(require.resolve("tailwindcss/theme.css"), "utf8");
  const pattern = /--color-([a-z]+)-(\d+):\s*oklch\(([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\)/g;

  const families = {};
  for (const [, family, shade, lightness, percent, chroma, hue] of css.matchAll(pattern)) {
    const index = SHADES.indexOf(Number(shade));
    if (index === -1) continue;
    families[family] ??= [];
    families[family][index] = oklchToHex(
      Number(lightness) / (percent ? 100 : 1),
      Number(chroma),
      Number(hue),
    );
  }
  return families;
}
