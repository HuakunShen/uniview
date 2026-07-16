import { graphemesOf } from "./graphemes";

/** Default mask grapheme for {@link maskText} / password fields. */
export const DEFAULT_MASK = "•";

/**
 * Replace every grapheme cluster of `text` with `mask`, preserving cluster
 * count — a 6-grapheme secret masks to 6 bullets, not 6 code points, so wide
 * clusters and emoji collapse to a single mask each.
 */
export function maskText(text: string, mask: string = DEFAULT_MASK): string {
  let out = "";
  for (const _grapheme of graphemesOf(text)) out += mask;
  return out;
}
