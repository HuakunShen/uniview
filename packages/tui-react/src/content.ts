import { createElement, memo, type ReactElement } from "react";
import {
  detectLanguage,
  renderCode,
  renderDiff,
  renderMarkdown,
  splitStableMarkdown,
  type RenderCodeOptions,
  type RenderDiffOptions,
  type RenderMarkdownOptions,
} from "@uniview/tui-content";
import type { CellStyle, RenderNode, SyntaxTheme } from "@uniview/tui-core";

/**
 * Convert a tui-core {@link RenderNode} (as produced by the content renderers)
 * into React elements of the `box`/`richtext`/`text` host primitives. The tree
 * then flows React → UINode → host → cells like any other plugin output — the
 * `spans` prop is JSON-safe, so it survives the RPC boundary unchanged.
 */
function toElement(node: RenderNode, key: number): ReactElement {
  const style = node.style ?? {};
  if (node.type === "richtext") {
    return createElement("richtext", {
      key,
      spans: node.spans ?? [],
      backgroundColor: node.background,
      ...style,
    });
  }
  if (node.text !== undefined && (node.children?.length ?? 0) === 0) {
    const textStyle: CellStyle = node.textStyle ?? {};
    return createElement(
      "text",
      {
        key,
        color: textStyle.fg,
        backgroundColor: node.background,
        bold: textStyle.bold,
        dim: textStyle.dim,
        italic: textStyle.italic,
        underline: textStyle.underline,
        strikethrough: textStyle.strikethrough,
        inverse: textStyle.inverse,
        ...style,
      },
      node.text,
    );
  }
  const children = (node.children ?? []).map((child, i) => toElement(child, i));
  return createElement(
    "box",
    { key, backgroundColor: node.background, ...style },
    ...children,
  );
}

/** Render a content {@link RenderNode} as a React element (with an optional list key). */
export function renderNodeToElement(node: RenderNode, key = 0): ReactElement {
  return toElement(node, key);
}

export interface MarkdownProps extends RenderMarkdownOptions {
  content: string;
}

/**
 * Render Markdown to the terminal: headings, lists, quotes, tables, inline
 * emphasis/code/links and syntax-highlighted fenced code (plan §5). Memoized so
 * unchanged content is not re-parsed — the basis for streaming reuse (plan §9).
 */
export const Markdown = memo(function Markdown({ content, ...options }: MarkdownProps): ReactElement {
  return renderNodeToElement(renderMarkdown(content, options));
});

export interface StreamingMarkdownProps extends RenderMarkdownOptions {
  content: string;
}

/**
 * Streaming Markdown for AI output (plan §9). Splits the growing text into
 * already-complete blocks and the in-progress tail: the stable subtree is a
 * memoized {@link Markdown} keyed by its own text, so incoming tokens only
 * re-parse and re-render the small tail — completed blocks are reused.
 */
export function StreamingMarkdown({ content, ...options }: StreamingMarkdownProps): ReactElement {
  const { stable, tail } = splitStableMarkdown(content);
  return createElement(
    "box",
    { flexDirection: "column" },
    stable.length > 0
      ? createElement(Markdown, { key: "stable", content: stable, ...options })
      : null,
    tail.length > 0 ? createElement(Markdown, { key: "tail", content: tail, ...options }) : null,
  );
}

export interface CodeProps extends RenderCodeOptions {
  content: string;
  /** Language id; if omitted, inferred from `filename`. */
  language?: string;
  /** File name used to infer the language when `language` is not given. */
  filename?: string;
}

/**
 * Render syntax-highlighted code (plan §6/§10). `language` wins; otherwise the
 * language is detected from `filename`.
 */
export const Code = memo(function Code({
  content,
  language,
  filename,
  ...options
}: CodeProps): ReactElement {
  const lang = language ?? (filename ? detectLanguage(filename) : options.lang);
  return renderNodeToElement(renderCode(content, { ...options, lang }));
});

export interface DiffProps extends RenderDiffOptions {
  patch: string;
  /** Language id for the diff content. */
  language?: string;
}

/** Render a unified diff with gutters, sign column, highlight and bands (plan §8). */
export const Diff = memo(function Diff({ patch, language, ...options }: DiffProps): ReactElement {
  return renderNodeToElement(renderDiff(patch, { ...options, lang: language ?? options.lang }));
});

export type { SyntaxTheme };
