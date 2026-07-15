import type { CellStyle, Color } from "../style/style-table";

export const SGR_RESET = "\x1b[0m";
export const CURSOR_SHOW = "\x1b[?25h";
export const CURSOR_HIDE = "\x1b[?25l";

/** Move the cursor to a 0-based cell using a 1-based CUP sequence. */
export function cursorTo(x: number, y: number): string {
  return `\x1b[${y + 1};${x + 1}H`;
}

const NAMED_COLORS: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
  grey: 90,
  brightblack: 90,
  brightred: 91,
  brightgreen: 92,
  brightyellow: 93,
  brightblue: 94,
  brightmagenta: 95,
  brightcyan: 96,
  brightwhite: 97,
};

function colorParams(color: Color, background: boolean): string[] {
  if (typeof color === "string") {
    const base = NAMED_COLORS[color.toLowerCase()];
    if (base === undefined) return []; // unknown token: leave default
    return [String(background ? base + 10 : base)];
  }
  return [background ? "48" : "38", "2", String(color.r), String(color.g), String(color.b)];
}

/** The SGR parameter list (without the leading reset) for a style. */
export function sgrParams(style: CellStyle): string[] {
  const params: string[] = [];
  if (style.bold) params.push("1");
  if (style.dim) params.push("2");
  if (style.italic) params.push("3");
  if (style.underline) params.push("4");
  if (style.inverse) params.push("7");
  if (style.strikethrough) params.push("9");
  if (style.fg !== undefined) params.push(...colorParams(style.fg, false));
  if (style.bg !== undefined) params.push(...colorParams(style.bg, true));
  return params;
}

/**
 * A full SGR sequence that resets then applies `style`. Emitting the leading
 * `0` makes each style self-contained, so switching styles never inherits
 * attributes from whatever was set before.
 */
export function sgrFor(style: CellStyle): string {
  return `\x1b[${["0", ...sgrParams(style)].join(";")}m`;
}
