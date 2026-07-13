import { eastAsianWidth } from "get-east-asian-width";

/**
 * The display width of a single grapheme cluster measured in terminal cells.
 * - `0` — zero-width (combining marks, joiners, format/control characters)
 * - `1` — a normal single-cell glyph
 * - `2` — a wide glyph (CJK, fullwidth forms, emoji presentation, flags)
 */
export type CellWidth = 0 | 1 | 2;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Iterate the grapheme clusters of `text` (Unicode-correct, not code points). */
export function* graphemesOf(text: string): Iterable<string> {
  for (const { segment } of segmenter.segment(text)) {
    yield segment;
  }
}

// Regional indicator symbols pair up into flag emoji (each is width 2).
const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u;
// U+FE0F VARIATION SELECTOR-16 forces emoji (wide) presentation.
const VARIATION_SELECTOR_16 = "️";

/**
 * A base scalar that occupies no cell: combining marks (`Mn`/`Mc`/`Me`),
 * format characters such as ZWSP/ZWJ/ZWNJ/BOM (`Cf`), and control codes (`Cc`).
 */
function isZeroWidthBase(scalar: string): boolean {
  return /^[\p{Mark}\p{Cf}\p{Cc}]$/u.test(scalar);
}

/**
 * The display width of a single grapheme cluster.
 *
 * The width is decided by the cluster's leading (base) scalar plus emoji
 * signals carried by the rest of the cluster; trailing combining marks never
 * change the width. This is the invariant the cell buffer relies on to keep
 * measurement and drawing in agreement.
 */
export function unicodeWidth(grapheme: string): CellWidth {
  if (grapheme.length === 0) return 0;

  const scalars = [...grapheme];
  const base = scalars[0]!;

  if (isZeroWidthBase(base)) return 0;

  // Any emoji signal in the cluster makes it wide.
  const isMultiScalarPictographic =
    scalars.length > 1 && /\p{Extended_Pictographic}/u.test(base);
  if (
    REGIONAL_INDICATOR.test(base) ||
    grapheme.includes(VARIATION_SELECTOR_16) ||
    isMultiScalarPictographic ||
    /\p{Emoji_Presentation}/u.test(base)
  ) {
    return 2;
  }

  return eastAsianWidth(base.codePointAt(0)!) === 2 ? 2 : 1;
}

/** A per-grapheme width lookup, matching the plan's `WidthCalculator` seam. */
export interface WidthCalculator {
  widthOf(grapheme: string): CellWidth;
}

/** The default Unicode-aware width calculator. */
export const defaultWidthCalculator: WidthCalculator = {
  widthOf: unicodeWidth,
};

/** Total display width of `text` (sum of grapheme widths). */
export function stringCellWidth(
  text: string,
  widths: WidthCalculator = defaultWidthCalculator,
): number {
  let total = 0;
  for (const grapheme of graphemesOf(text)) {
    total += widths.widthOf(grapheme);
  }
  return total;
}
