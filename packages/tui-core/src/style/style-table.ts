/** An explicit 24-bit color. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** A color is either a named/theme token or an explicit rgb triple. */
export type Color = string | RgbColor;

/**
 * A fully resolved visual style for a single cell. Every field is optional;
 * an all-empty style is the default and interns to {@link DEFAULT_STYLE_ID}.
 */
export interface CellStyle {
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  link?: string;
}

/** The interned id of the default (empty) style. */
export const DEFAULT_STYLE_ID = 0;

const BOOLEAN_KEYS = [
  "bold",
  "dim",
  "italic",
  "underline",
  "strikethrough",
  "inverse",
] as const;

/** Drop falsy/undefined attributes so equal styles compare equal. */
function normalize(style: CellStyle): CellStyle {
  const out: CellStyle = {};
  if (style.fg !== undefined) out.fg = style.fg;
  if (style.bg !== undefined) out.bg = style.bg;
  for (const key of BOOLEAN_KEYS) {
    if (style[key]) out[key] = true;
  }
  if (style.link !== undefined) out.link = style.link;
  return out;
}

/** A stable, order-independent key for a normalized style. */
function keyOf(style: CellStyle): string {
  const color = (c: Color | undefined): string =>
    c === undefined ? "" : typeof c === "string" ? `s:${c}` : `r:${c.r},${c.g},${c.b}`;
  const flags = BOOLEAN_KEYS.map((k) => (style[k] ? "1" : "0")).join("");
  return `${color(style.fg)}|${color(style.bg)}|${flags}|${style.link ?? ""}`;
}

/**
 * Interns {@link CellStyle} values into small integer ids so the cell buffer
 * can store a `Uint32` per cell instead of an object. Id 0 is always the
 * default empty style. Interning is deterministic and order-independent.
 */
export class StyleTable {
  private readonly styles: CellStyle[] = [{}];
  private readonly ids = new Map<string, number>([[keyOf({}), DEFAULT_STYLE_ID]]);

  /** Number of distinct interned styles, including the default. */
  get size(): number {
    return this.styles.length;
  }

  /** Intern a style, returning its stable id. */
  intern(style: CellStyle): number {
    const normalized = normalize(style);
    const key = keyOf(normalized);
    const existing = this.ids.get(key);
    if (existing !== undefined) return existing;
    const id = this.styles.length;
    this.styles.push(normalized);
    this.ids.set(key, id);
    return id;
  }

  /** Read back the style for an id. Throws for unknown ids. */
  get(id: number): CellStyle {
    const style = this.styles[id];
    if (style === undefined) {
      throw new Error(`Unknown style id: ${id}`);
    }
    return style;
  }

  /** A snapshot palette: index === style id. */
  palette(): CellStyle[] {
    return this.styles.map((s) => ({ ...s }));
  }
}
