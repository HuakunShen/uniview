/**
 * Filetype → highlight.js language detection for file preview (plan §10).
 * Returns a language id understood by the highlighter, or `undefined` when the
 * file type is unknown (callers then render it as plain text).
 */

/** Extension (without dot, lowercased) → highlight.js language id. */
const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  rs: "rust",
  py: "python",
  pyi: "python",
  go: "go",
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  markdown: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  swift: "swift",
  sql: "sql",
  html: "xml",
  xml: "xml",
  svg: "xml",
  css: "css",
  scss: "scss",
  less: "less",
  diff: "diff",
  patch: "diff",
  lua: "lua",
  dart: "dart",
  scala: "scala",
  ex: "elixir",
  exs: "elixir",
};

/** Well-known extensionless basenames (lowercased) → language id. */
const BASENAME_TO_LANG: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  gnumakefile: "makefile",
  cmakelists: "cmake",
};

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** Detect the highlighter language id for a filename or path. */
export function detectLanguage(filename: string): string | undefined {
  const name = basename(filename);
  const dot = name.lastIndexOf(".");
  if (dot > 0) {
    const ext = name.slice(dot + 1).toLowerCase();
    const byExt = EXT_TO_LANG[ext];
    if (byExt) return byExt;
  }
  return BASENAME_TO_LANG[name.toLowerCase()];
}
