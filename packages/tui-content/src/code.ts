import {
  styledLinesToRenderNode,
  type CellStyle,
  type RenderNode,
  type StyledLine,
  type SyntaxTheme,
  type TuiStyle,
} from "@uniview/tui-core";
import { highlightToLines } from "./highlight";

export interface RenderCodeOptions {
  /** highlight.js language id; omit for plain text. */
  lang?: string;
  /** Syntax theme; defaults to the highlighter default (tokyo-night). */
  theme?: SyntaxTheme;
  /** Render a right-aligned line-number gutter. */
  lineNumbers?: boolean;
  /** First line number (1-based). */
  startLine?: number;
  /** Style for the line-number gutter. */
  gutterStyle?: CellStyle;
  /** Node id (for hit-testing / diffing). */
  id?: string;
  /** Extra layout style merged onto the container. */
  style?: TuiStyle;
}

const DEFAULT_GUTTER_STYLE: CellStyle = { dim: true };

/** Prepend a right-aligned line-number gutter to each styled line. */
function withLineNumbers(
  lines: StyledLine[],
  startLine: number,
  gutterStyle: CellStyle,
): StyledLine[] {
  const width = String(startLine + lines.length - 1).length;
  return lines.map((spans, i) => [
    { text: `${String(startLine + i).padStart(width)} `, style: gutterStyle },
    ...spans,
  ]);
}

/**
 * Render source code into a paintable {@link RenderNode} column: syntax
 * highlight → styled lines → rich-text leaves (plan §6). Optionally prefixes a
 * line-number gutter. This is the shared building block for `<Code>`, Markdown
 * fenced blocks and file preview.
 */
export function renderCode(code: string, options: RenderCodeOptions = {}): RenderNode {
  let lines = highlightToLines(code, { lang: options.lang, theme: options.theme });
  if (options.lineNumbers) {
    lines = withLineNumbers(
      lines,
      options.startLine ?? 1,
      options.gutterStyle ?? DEFAULT_GUTTER_STYLE,
    );
  }
  return styledLinesToRenderNode(lines, {
    id: options.id,
    style: options.style,
    lineIdPrefix: options.id ? `${options.id}:` : undefined,
  });
}
