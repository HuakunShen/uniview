import { graphemesOf } from "../text/graphemes";
import { DEFAULT_MASK } from "../text/mask";

/** The three display slices of a text field around its caret cell. */
export interface TextInputSlices {
  head: string;
  /** The single grapheme (or " ") under the caret; "" when showCursor is false and the value ends there. */
  caret: string;
  tail: string;
  /** True when the field is empty and a placeholder is shown. */
  placeholder: boolean;
}

export interface TextInputSliceOptions {
  /** Caret position in grapheme units. Defaults to end-of-value. */
  cursor?: number;
  /** Password mode: true → the default mask ("•"); a string sets a custom mask grapheme. */
  mask?: boolean | string;
  /** Draw a caret cell (default true). */
  showCursor?: boolean;
  /** Placeholder shown when the value is empty. */
  placeholder?: string;
}

/**
 * Split a text-field `value` into `head` / `caret` / `tail` display slices,
 * masking the *display* when `mask` is set (the source value is never mutated —
 * the real text still flows to onChange/semantics). Both bindings call this so
 * they split identically (the byte-identical guarantee). The caret sits at
 * end-of-value unless a controlled `cursor` is given.
 */
export function textInputSlices(value: string, options: TextInputSliceOptions): TextInputSlices {
  const { cursor, mask, showCursor = true, placeholder } = options;
  if (value.length === 0 && placeholder !== undefined) {
    return { head: placeholder, caret: showCursor ? " " : "", tail: "", placeholder: true };
  }
  const graphemes = [...graphemesOf(value)];
  const maskChar = typeof mask === "string" ? mask : mask ? DEFAULT_MASK : undefined;
  const display = maskChar !== undefined ? graphemes.map(() => maskChar) : graphemes;
  const c = Math.max(0, Math.min(cursor ?? display.length, display.length));
  const head = display.slice(0, c).join("");
  const at = display[c];
  const caret = showCursor ? (at ?? " ") : (at ?? "");
  const tail = display.slice(c + 1).join("");
  return { head, caret, tail, placeholder: false };
}
