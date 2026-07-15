import { marked, type Token, type Tokens } from "marked";
import {
  defaultSyntaxTheme,
  stringCellWidth,
  styleForScope,
  styledLineText,
  type CellStyle,
  type RenderNode,
  type StyledLine,
  type StyledSpan,
  type SyntaxTheme,
} from "@uniview/tui-core";
import { highlightToLines } from "./highlight";
import { wrapStyledSpans } from "./wrap";

export interface RenderMarkdownOptions {
  /** Wrap width in cells (default 80). A non-positive value disables wrapping. */
  width?: number;
  /** Syntax theme used for fenced code and derived text styles. */
  theme?: SyntaxTheme;
  /** Node id for the container. */
  id?: string;
}

interface MarkdownStyles {
  text: CellStyle;
  heading: CellStyle[];
  strong: CellStyle;
  emphasis: CellStyle;
  del: CellStyle;
  code: CellStyle;
  link: CellStyle;
  quote: CellStyle;
  bar: CellStyle;
  bullet: CellStyle;
  rule: CellStyle;
  tableHeader: CellStyle;
  tableRule: CellStyle;
}

function markdownStyles(theme: SyntaxTheme): MarkdownStyles {
  const scope = (s: string): CellStyle => styleForScope(theme, s);
  const bold = (s: CellStyle): CellStyle => ({ ...s, bold: true });
  return {
    text: scope("text"),
    heading: [
      bold(scope("title")),
      bold(scope("function")),
      bold(scope("keyword")),
      bold(scope("type")),
      { bold: true },
      { bold: true },
    ],
    strong: { bold: true },
    emphasis: { italic: true },
    del: { strikethrough: true },
    code: { fg: scope("string").fg },
    link: scope("link"),
    quote: { ...scope("text"), italic: true, dim: true },
    bar: scope("comment"),
    bullet: { fg: scope("keyword").fg },
    rule: { dim: true },
    tableHeader: { bold: true },
    tableRule: { dim: true },
  };
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

/** Decode the HTML entities marked emits in token text back to plain characters. */
function decode(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

function merge(base: CellStyle, over: CellStyle): CellStyle {
  return { ...base, ...over };
}

/** Convert marked inline tokens to styled spans, honoring nested emphasis. */
function inlineToSpans(
  tokens: Token[] | undefined,
  base: CellStyle,
  st: MarkdownStyles,
): StyledSpan[] {
  if (!tokens) return [];
  const out: StyledSpan[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "text": {
        const nested = (token as Tokens.Text).tokens;
        if (nested && nested.length > 0) out.push(...inlineToSpans(nested, base, st));
        else out.push({ text: decode(token.text), style: base });
        break;
      }
      case "strong":
        out.push(...inlineToSpans(token.tokens, merge(base, st.strong), st));
        break;
      case "em":
        out.push(...inlineToSpans(token.tokens, merge(base, st.emphasis), st));
        break;
      case "del":
        out.push(...inlineToSpans(token.tokens, merge(base, st.del), st));
        break;
      case "codespan":
        out.push({ text: decode(token.text), style: merge(base, st.code) });
        break;
      case "link":
        out.push(...inlineToSpans(token.tokens, merge(base, st.link), st));
        break;
      case "image":
        out.push({ text: token.text || token.href, style: merge(base, st.link) });
        break;
      case "br":
        out.push({ text: " ", style: base });
        break;
      case "escape":
        out.push({ text: token.text, style: base });
        break;
      case "html":
        break;
      default: {
        const text = (token as { text?: string }).text;
        if (typeof text === "string") out.push({ text: decode(text), style: base });
      }
    }
  }
  return out;
}

/** A rich-text line node from styled spans. */
function lineNode(spans: StyledLine): RenderNode {
  return { type: "richtext", spans };
}

class MarkdownBuilder {
  readonly children: RenderNode[] = [];
  private first = true;

  constructor(
    private readonly width: number,
    private readonly st: MarkdownStyles,
    private readonly theme: SyntaxTheme,
  ) {}

  private gap(): void {
    if (!this.first) this.children.push(lineNode([]));
    this.first = false;
  }

  private pushLines(lines: StyledLine[]): void {
    for (const line of lines) this.children.push(lineNode(line));
  }

  private wrap(spans: StyledSpan[], width = this.width, hangingIndent = 0): StyledLine[] {
    return wrapStyledSpans(spans, width, { hangingIndent });
  }

  block(token: Token): void {
    switch (token.type) {
      case "space":
      case "html":
        return;
      case "heading": {
        this.gap();
        const style = this.st.heading[Math.min(token.depth - 1, this.st.heading.length - 1)]!;
        this.pushLines(this.wrap(inlineToSpans(token.tokens, style, this.st)));
        return;
      }
      case "paragraph": {
        this.gap();
        this.pushLines(this.wrap(inlineToSpans(token.tokens, this.st.text, this.st)));
        return;
      }
      case "code": {
        this.gap();
        this.codeBlock(token as Tokens.Code);
        return;
      }
      case "blockquote": {
        this.gap();
        this.blockquote(token as Tokens.Blockquote);
        return;
      }
      case "list": {
        this.gap();
        this.list(token as Tokens.List, 0);
        return;
      }
      case "table": {
        this.gap();
        this.table(token as Tokens.Table);
        return;
      }
      case "hr": {
        this.gap();
        const width = this.width > 0 ? this.width : 24;
        this.children.push(lineNode([{ text: "─".repeat(width), style: this.st.rule }]));
        return;
      }
      default: {
        const text = (token as { tokens?: Token[] }).tokens;
        if (text) {
          this.gap();
          this.pushLines(this.wrap(inlineToSpans(text, this.st.text, this.st)));
        }
      }
    }
  }

  private codeBlock(token: Tokens.Code): void {
    const lines = highlightToLines(token.text, { lang: token.lang || undefined, theme: this.theme });
    const bar: StyledSpan = { text: "│ ", style: this.st.bar };
    for (const line of lines) this.children.push(lineNode([bar, ...line]));
  }

  private blockquote(token: Tokens.Blockquote): void {
    const inner = new MarkdownBuilder(Math.max(1, this.width - 2), this.st, this.theme);
    for (const child of token.tokens) inner.block(child);
    const bar: StyledSpan = { text: "│ ", style: this.st.bar };
    for (const child of inner.children) {
      const spans = child.spans ?? [];
      this.children.push(
        lineNode([bar, ...spans.map((s) => ({ ...s, style: merge(this.st.quote, s.style ?? {}) }))]),
      );
    }
  }

  private list(token: Tokens.List, depth: number): void {
    const indent = depth * 2;
    token.items.forEach((item, i) => {
      const marker = token.ordered ? `${Number(token.start || 1) + i}. ` : "• ";
      const markerWidth = stringCellWidth(marker);
      const contentWidth = this.width > 0 ? Math.max(1, this.width - indent - markerWidth) : 0;

      const inline: Token[] = [];
      const nested: Tokens.List[] = [];
      for (const child of item.tokens) {
        if (child.type === "list") nested.push(child as Tokens.List);
        else if (child.type === "text") inline.push(...((child as Tokens.Text).tokens ?? [child]));
        else if (child.type === "paragraph") inline.push(...(child.tokens ?? []));
      }

      const wrapped = wrapStyledSpans(inlineToSpans(inline, this.st.text, this.st), contentWidth);
      wrapped.forEach((line, li) => {
        if (li === 0) {
          this.children.push(
            lineNode([
              { text: " ".repeat(indent), style: this.st.text },
              { text: marker, style: this.st.bullet },
              ...line,
            ]),
          );
        } else {
          this.children.push(
            lineNode([{ text: " ".repeat(indent + markerWidth), style: this.st.text }, ...line]),
          );
        }
      });
      for (const child of nested) this.list(child, depth + 1);
    });
  }

  private table(token: Tokens.Table): void {
    const header = token.header.map((c) => inlineToSpans(c.tokens, this.st.tableHeader, this.st));
    const rows = token.rows.map((row) => row.map((c) => inlineToSpans(c.tokens, this.st.text, this.st)));
    const cols = token.header.length;
    const widths = new Array<number>(cols).fill(0);
    const measure = (spans: StyledSpan[]): number => stringCellWidth(styledLineText(spans));
    header.forEach((c, i) => (widths[i] = Math.max(widths[i]!, measure(c))));
    for (const row of rows) row.forEach((c, i) => (widths[i] = Math.max(widths[i]!, measure(c))));

    const pad = (spans: StyledSpan[], width: number): StyledSpan[] => {
      const gap = width - measure(spans);
      return gap > 0 ? [...spans, { text: " ".repeat(gap) }] : spans;
    };
    const sep: StyledSpan = { text: " │ ", style: this.st.tableRule };

    const rowNode = (cells: StyledSpan[][]): RenderNode => {
      const spans: StyledSpan[] = [];
      cells.forEach((c, i) => {
        if (i > 0) spans.push(sep);
        spans.push(...pad(c, widths[i]!));
      });
      return lineNode(spans);
    };

    this.children.push(rowNode(header));
    this.children.push(
      lineNode([
        {
          text: widths.map((w) => "─".repeat(w)).join("─┼─"),
          style: this.st.tableRule,
        },
      ]),
    );
    for (const row of rows) this.children.push(rowNode(row));
  }
}

/**
 * Render a Markdown document into a paintable {@link RenderNode} column
 * (plan §5): headings, paragraphs (word-wrapped), lists, blockquotes, tables,
 * inline emphasis/code/links, and syntax-highlighted fenced code blocks — all
 * as a structured styled-text model, never ANSI.
 */
export function renderMarkdown(markdown: string, options: RenderMarkdownOptions = {}): RenderNode {
  const width = options.width ?? 80;
  const theme = options.theme ?? defaultSyntaxTheme;
  const builder = new MarkdownBuilder(width, markdownStyles(theme), theme);
  for (const token of marked.lexer(markdown)) builder.block(token);
  return {
    type: "box",
    id: options.id,
    style: { flexDirection: "column" },
    children: builder.children,
  };
}
