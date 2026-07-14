import type { RenderNode } from "../paint/paint";
import type { StyledLine } from "../text/styled-text";
import type { TuiStyle } from "../style/tui-style";

export interface StyledLinesOptions {
  id?: string;
  /** Extra layout style merged onto the column container. */
  style?: TuiStyle;
  /** Prefix each output line id with this (line index appended). */
  lineIdPrefix?: string;
}

/**
 * Bridge the styled-text model to the paint pipeline: turn a list of
 * {@link StyledLine}s into a column of rich-text leaves, one leaf per line.
 * This is what every content renderer (code / markdown / diff) ultimately emits.
 */
export function styledLinesToRenderNode(
  lines: StyledLine[],
  options: StyledLinesOptions = {},
): RenderNode {
  const children: RenderNode[] = lines.map((spans, i) => ({
    type: "richtext",
    id: options.lineIdPrefix ? `${options.lineIdPrefix}${i}` : undefined,
    spans,
  }));
  return {
    type: "box",
    id: options.id,
    style: { flexDirection: "column", ...options.style },
    children,
  };
}
