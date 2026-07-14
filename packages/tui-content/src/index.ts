// Syntax highlighting: code → styled lines (scope-classified, never ANSI)
export { highlightToLines, isLanguageSupported } from "./highlight";
export type { HighlightOptions } from "./highlight";

// Code block: highlighted, paintable render node (+ optional line numbers)
export { renderCode } from "./code";
export type { RenderCodeOptions } from "./code";

// Markdown → paintable render node
export { renderMarkdown } from "./markdown";
export type { RenderMarkdownOptions } from "./markdown";

// Unified diff → paintable render node
export { parseUnifiedDiff, renderDiff } from "./diff";
export type {
  DiffColors,
  DiffFile,
  DiffHunk,
  DiffLine,
  DiffLineKind,
  RenderDiffOptions,
} from "./diff";

// Styled-span word wrapping
export { wrapStyledSpans } from "./wrap";
export type { WrapOptions } from "./wrap";

// Filetype detection for file preview
export { detectLanguage } from "./filetype";
