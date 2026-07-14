import { common, createLowlight } from "lowlight";
import type { ElementContent, RootContent } from "hast";
import {
  defaultSyntaxTheme,
  styleForScope,
  type StyledLine,
  type SyntaxScope,
  type SyntaxTheme,
} from "@uniview/tui-core";

/** Shared highlighter instance with the ~37 "common" languages registered. */
const lowlight = createLowlight(common);

/**
 * Map highlight.js scope classes (`hljs-<scope>`) to Uniview's semantic
 * {@link SyntaxScope}s. The tokenizer stays theme-agnostic (plan §6.3): it emits
 * roles, the theme decides colors.
 */
const HLJS_SCOPE: Record<string, SyntaxScope> = {
  keyword: "keyword",
  built_in: "type",
  type: "type",
  literal: "constant",
  number: "number",
  operator: "operator",
  punctuation: "punctuation",
  property: "property",
  string: "string",
  subst: "text",
  symbol: "constant",
  regexp: "regexp",
  char: "escape",
  escape: "escape",
  comment: "comment",
  doctag: "comment",
  quote: "comment",
  meta: "meta",
  function: "function",
  title: "title",
  params: "text",
  variable: "variable",
  "template-variable": "variable",
  "template-tag": "keyword",
  attr: "property",
  attribute: "attribute",
  name: "tag",
  tag: "tag",
  "selector-tag": "tag",
  "selector-id": "variable",
  "selector-class": "type",
  "selector-attr": "attribute",
  "selector-pseudo": "keyword",
  bullet: "punctuation",
  section: "title",
  link: "link",
  addition: "addition",
  deletion: "deletion",
};

export interface HighlightOptions {
  /** highlight.js language id (typescript, javascript, json, rust, python, ...). */
  lang?: string;
  /** Theme mapping scopes to colors. Defaults to {@link defaultSyntaxTheme}. */
  theme?: SyntaxTheme;
}

/** Whether a language id has a highlighter registered. */
export function isLanguageSupported(lang: string): boolean {
  return lowlight.registered(lang);
}

function classList(className: unknown): string[] {
  if (Array.isArray(className)) {
    return className.filter((c): c is string => typeof c === "string");
  }
  if (typeof className === "string") return className.split(/\s+/);
  return [];
}

/** Resolve the semantic scope for a hast element's class list, if any. */
function scopeForClass(className: unknown): SyntaxScope | undefined {
  for (const cls of classList(className)) {
    if (cls.startsWith("hljs-")) {
      const mapped = HLJS_SCOPE[cls.slice(5)];
      if (mapped) return mapped;
    }
  }
  return undefined;
}

/** Append text (which may contain newlines) as styled spans across lines. */
function pushText(text: string, style: StyledLine[number]["style"], lines: StyledLine[]): void {
  const parts = text.split("\n");
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) lines.push([]);
    const part = parts[i]!;
    if (part.length > 0) lines[lines.length - 1]!.push({ text: part, style });
  }
}

function walk(
  nodes: ReadonlyArray<RootContent | ElementContent>,
  scope: SyntaxScope,
  theme: SyntaxTheme,
  lines: StyledLine[],
): void {
  for (const node of nodes) {
    if (node.type === "text") {
      pushText(node.value, styleForScope(theme, scope), lines);
    } else if (node.type === "element") {
      const next = scopeForClass(node.properties?.className) ?? scope;
      walk(node.children, next, theme, lines);
    }
  }
}

/** Split plain (un-highlightable) code into one text-styled line per source line. */
function plainLines(code: string, theme: SyntaxTheme): StyledLine[] {
  const style = styleForScope(theme, "text");
  return code.split("\n").map((line) => (line.length > 0 ? [{ text: line, style }] : []));
}

/**
 * Tokenize `code` into styled lines (plan §6.2/§6.3): one {@link StyledLine} per
 * source line, each a list of scope-styled spans. Never emits ANSI. Unknown or
 * omitted languages fall back to plain, still-structured text so layout,
 * selection and streaming keep working.
 */
export function highlightToLines(code: string, options: HighlightOptions = {}): StyledLine[] {
  const theme = options.theme ?? defaultSyntaxTheme;
  const lang = options.lang;
  if (!lang || !lowlight.registered(lang)) return plainLines(code, theme);

  const tree = lowlight.highlight(lang, code);
  const lines: StyledLine[] = [[]];
  walk(tree.children, "text", theme, lines);
  return lines;
}
