import type { CellStyle, RgbColor } from "../style/style-table";

/**
 * Semantic syntax scopes. These are theme-agnostic *roles* — a highlighter
 * classifies a token as e.g. "keyword", and the {@link SyntaxTheme} decides the
 * color. Never bake colors into the tokenizer (plan §6.3 / §7).
 */
export type SyntaxScope =
  | "text"
  | "keyword"
  | "string"
  | "comment"
  | "function"
  | "type"
  | "variable"
  | "number"
  | "constant"
  | "operator"
  | "punctuation"
  | "property"
  | "tag"
  | "attribute"
  | "regexp"
  | "escape"
  | "meta"
  | "title"
  | "link"
  | "addition"
  | "deletion";

/** The seven scopes the plan requires every theme to define (plan §6.3). */
export const CORE_SYNTAX_SCOPES = [
  "keyword",
  "string",
  "comment",
  "function",
  "type",
  "variable",
  "number",
] as const satisfies readonly SyntaxScope[];

/** A theme maps each {@link SyntaxScope} to a cell style; `text` is the base. */
export interface SyntaxTheme {
  name: string;
  styles: Partial<Record<SyntaxScope, CellStyle>>;
}

const rgb = (r: number, g: number, b: number): RgbColor => ({ r, g, b });

/**
 * Resolve a scope to a concrete {@link CellStyle}, falling back to the theme's
 * plain-text base (then empty) so an unmapped scope still renders sensibly.
 */
export function styleForScope(theme: SyntaxTheme, scope: string): CellStyle {
  return theme.styles[scope as SyntaxScope] ?? theme.styles.text ?? {};
}

/** Tokyo-Night-flavored dark theme — the default. */
export const tokyoNightTheme: SyntaxTheme = {
  name: "tokyo-night",
  styles: {
    text: { fg: rgb(192, 202, 245) },
    keyword: { fg: rgb(187, 154, 247) },
    string: { fg: rgb(158, 206, 106) },
    comment: { fg: rgb(86, 95, 137), italic: true, dim: true },
    function: { fg: rgb(122, 162, 247) },
    title: { fg: rgb(122, 162, 247) },
    type: { fg: rgb(42, 195, 222) },
    variable: { fg: rgb(192, 202, 245) },
    number: { fg: rgb(255, 158, 100) },
    constant: { fg: rgb(255, 158, 100) },
    operator: { fg: rgb(137, 221, 255) },
    punctuation: { fg: rgb(154, 165, 206) },
    property: { fg: rgb(125, 207, 255) },
    tag: { fg: rgb(247, 118, 142) },
    attribute: { fg: rgb(187, 154, 247) },
    regexp: { fg: rgb(180, 249, 248) },
    escape: { fg: rgb(255, 158, 100) },
    meta: { fg: rgb(122, 162, 247) },
    link: { fg: rgb(125, 207, 255), underline: true },
    addition: { fg: rgb(158, 206, 106) },
    deletion: { fg: rgb(247, 118, 142) },
  },
};

/** GitHub-Light-flavored theme for light terminals. */
export const githubLightTheme: SyntaxTheme = {
  name: "github-light",
  styles: {
    text: { fg: rgb(36, 41, 47) },
    keyword: { fg: rgb(207, 34, 46) },
    string: { fg: rgb(10, 48, 105) },
    comment: { fg: rgb(106, 115, 125), italic: true },
    function: { fg: rgb(130, 80, 223) },
    title: { fg: rgb(130, 80, 223) },
    type: { fg: rgb(149, 63, 1) },
    variable: { fg: rgb(0, 92, 197) },
    number: { fg: rgb(0, 92, 197) },
    constant: { fg: rgb(0, 92, 197) },
    operator: { fg: rgb(207, 34, 46) },
    punctuation: { fg: rgb(36, 41, 47) },
    property: { fg: rgb(0, 92, 197) },
    tag: { fg: rgb(17, 99, 41) },
    attribute: { fg: rgb(130, 80, 223) },
    regexp: { fg: rgb(3, 47, 98) },
    escape: { fg: rgb(149, 63, 1) },
    meta: { fg: rgb(130, 80, 223) },
    link: { fg: rgb(0, 92, 197), underline: true },
    addition: { fg: rgb(17, 99, 41) },
    deletion: { fg: rgb(207, 34, 46) },
  },
};

/** The default syntax theme (dark). */
export const defaultSyntaxTheme = tokyoNightTheme;

/** Named-theme registry for `<Code theme="...">` / theme switching (plan §7). */
export const syntaxThemes: Record<string, SyntaxTheme> = {
  [tokyoNightTheme.name]: tokyoNightTheme,
  [githubLightTheme.name]: githubLightTheme,
};
