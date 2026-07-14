// Syntax highlighting: code → styled lines (scope-classified, never ANSI)
export { highlightToLines, isLanguageSupported } from "./highlight";
export type { HighlightOptions } from "./highlight";

// Code block: highlighted, paintable render node (+ optional line numbers)
export { renderCode } from "./code";
export type { RenderCodeOptions } from "./code";

// Filetype detection for file preview
export { detectLanguage } from "./filetype";
