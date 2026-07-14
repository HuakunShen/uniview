import type { CellStyle } from "../style/style-table";
import { stringCellWidth } from "./graphemes";

/**
 * A run of text sharing one visual {@link CellStyle}. Spans are the atoms of the
 * styled-text model: a syntax-highlighted line, a Markdown paragraph, or a diff
 * line is a list of spans — never an ANSI string — so layout, selection and
 * streaming all keep token boundaries.
 */
export interface StyledSpan {
  text: string;
  style?: CellStyle;
}

/** A single visual line made of consecutively-painted {@link StyledSpan}s. */
export type StyledLine = StyledSpan[];

/** Total terminal-cell width of a styled line (wide chars count as 2). */
export function styledLineWidth(line: StyledLine): number {
  let width = 0;
  for (const span of line) width += stringCellWidth(span.text);
  return width;
}

/** Concatenated plain text of a styled line, ignoring styles. */
export function styledLineText(line: StyledLine): string {
  let text = "";
  for (const span of line) text += span.text;
  return text;
}
