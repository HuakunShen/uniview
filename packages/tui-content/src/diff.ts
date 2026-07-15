import {
  defaultSyntaxTheme,
  styleForScope,
  type CellStyle,
  type Color,
  type RenderNode,
  type StyledSpan,
  type SyntaxTheme,
} from "@uniview/tui-core";
import { highlightToLines } from "./highlight";

/** A single line within a diff hunk. */
export type DiffLineKind = "context" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  /** 1-based line number in the old file (context + deletions). */
  oldLine?: number;
  /** 1-based line number in the new file (context + additions). */
  newLine?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  /** The raw `@@ ... @@` header line. */
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath?: string;
  newPath?: string;
  hunks: DiffHunk[];
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function stripPath(rest: string): string {
  return rest.split("\t")[0]!.trim();
}

/**
 * Parse a unified diff patch (plan §8) into a structured model: files → hunks →
 * classified, line-numbered lines. Hand-written (no dependency) so the model is
 * exactly what the renderer needs and fully testable.
 */
export function parseUnifiedDiff(patch: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  const newFile = (): DiffFile => {
    const f: DiffFile = { hunks: [] };
    files.push(f);
    return f;
  };

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("diff --git")) {
      file = newFile();
      hunk = null;
      const m = /^diff --git (\S+) (\S+)/.exec(raw);
      if (m) {
        file.oldPath = m[1];
        file.newPath = m[2];
      }
      continue;
    }
    if (raw.startsWith("--- ")) {
      if (!file || file.hunks.length > 0) file = newFile();
      hunk = null;
      file.oldPath = stripPath(raw.slice(4));
      continue;
    }
    if (raw.startsWith("+++ ")) {
      if (!file) file = newFile();
      file.newPath = stripPath(raw.slice(4));
      continue;
    }
    const hm = HUNK_RE.exec(raw);
    if (hm) {
      hunk = {
        oldStart: Number(hm[1]),
        oldCount: hm[2] !== undefined ? Number(hm[2]) : 1,
        newStart: Number(hm[3]),
        newCount: hm[4] !== undefined ? Number(hm[4]) : 1,
        header: raw,
        lines: [],
      };
      if (!file) file = newFile();
      file.hunks.push(hunk);
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      continue;
    }
    if (!hunk) continue; // index/preamble lines outside a hunk
    if (raw.startsWith("\\")) continue; // "\ No newline at end of file"

    const sign = raw[0];
    if (sign === "+") {
      hunk.lines.push({ kind: "add", text: raw.slice(1), newLine });
      newLine += 1;
    } else if (sign === "-") {
      hunk.lines.push({ kind: "del", text: raw.slice(1), oldLine });
      oldLine += 1;
    } else if (sign === " ") {
      hunk.lines.push({ kind: "context", text: raw.slice(1), oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    } else {
      hunk = null; // blank line or unknown prefix ends the hunk
    }
  }
  return files;
}

/** Colors and styles for diff rendering. */
export interface DiffColors {
  addBg: Color;
  delBg: Color;
  addFg: Color;
  delFg: Color;
  gutter: CellStyle;
  hunkHeader: CellStyle;
  fileHeader: CellStyle;
}

export interface RenderDiffOptions {
  /** highlight.js language id for the diff content. */
  lang?: string;
  /** Syntax theme for content + accent colors. */
  theme?: SyntaxTheme;
  /** Override individual diff colors. */
  colors?: Partial<DiffColors>;
  /** Show the `@@ ... @@` hunk header line (default true). */
  showHunkHeader?: boolean;
  /** Show the file path header (default true). */
  showFileHeader?: boolean;
  /** Node id for the container. */
  id?: string;
}

function defaultDiffColors(theme: SyntaxTheme): DiffColors {
  return {
    addBg: { r: 19, g: 43, b: 33 },
    delBg: { r: 55, g: 26, b: 30 },
    addFg: styleForScope(theme, "addition").fg ?? { r: 87, g: 171, b: 90 },
    delFg: styleForScope(theme, "deletion").fg ?? { r: 229, g: 83, b: 75 },
    gutter: { dim: true },
    hunkHeader: { fg: styleForScope(theme, "comment").fg, dim: true },
    fileHeader: { bold: true },
  };
}

function lineNode(spans: StyledSpan[], background?: Color): RenderNode {
  const node: RenderNode = { type: "richtext", spans };
  if (background !== undefined) node.background = background;
  return node;
}

function fileLabel(file: DiffFile): string {
  if (file.oldPath && file.newPath && file.oldPath !== file.newPath) {
    return `${file.oldPath} → ${file.newPath}`;
  }
  return file.newPath ?? file.oldPath ?? "";
}

function diffLineNode(
  line: DiffLine,
  gutterWidth: number,
  colors: DiffColors,
  theme: SyntaxTheme,
  lang: string | undefined,
): RenderNode {
  const oldG = line.oldLine != null ? String(line.oldLine).padStart(gutterWidth) : " ".repeat(gutterWidth);
  const newG = line.newLine != null ? String(line.newLine).padStart(gutterWidth) : " ".repeat(gutterWidth);
  const sign = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
  const band = line.kind === "add" ? colors.addBg : line.kind === "del" ? colors.delBg : undefined;
  const accent = line.kind === "add" ? colors.addFg : line.kind === "del" ? colors.delFg : undefined;

  const withBand = (style: CellStyle): CellStyle => (band !== undefined ? { ...style, bg: band } : style);
  const gutterStyle = withBand(colors.gutter);

  const content = highlightToLines(line.text, { lang, theme })[0] ?? [{ text: line.text }];
  const contentSpans = band ? content.map((s) => ({ ...s, style: withBand(s.style ?? {}) })) : content;

  const spans: StyledSpan[] = [
    { text: oldG, style: gutterStyle },
    { text: " ", style: gutterStyle },
    { text: newG, style: gutterStyle },
    { text: " ", style: gutterStyle },
    { text: sign, style: withBand(accent !== undefined ? { fg: accent } : {}) },
    { text: " ", style: withBand({}) },
    ...contentSpans,
  ];
  return lineNode(spans, band);
}

/**
 * Render a unified diff into a paintable {@link RenderNode} column (plan §8):
 * old/new line-number gutters, a +/-/space sign column, syntax-highlighted
 * content, and add/remove background bands — all as structured styled text.
 */
export function renderDiff(patch: string, options: RenderDiffOptions = {}): RenderNode {
  const theme = options.theme ?? defaultSyntaxTheme;
  const colors = { ...defaultDiffColors(theme), ...options.colors };
  const files = parseUnifiedDiff(patch);
  const children: RenderNode[] = [];

  for (const file of files) {
    if (options.showFileHeader !== false && (file.oldPath || file.newPath)) {
      children.push(lineNode([{ text: fileLabel(file), style: colors.fileHeader }]));
    }
    let maxNum = 1;
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        maxNum = Math.max(maxNum, line.oldLine ?? 0, line.newLine ?? 0);
      }
    }
    const gutterWidth = String(maxNum).length;
    for (const hunk of file.hunks) {
      if (options.showHunkHeader !== false) {
        children.push(lineNode([{ text: hunk.header, style: colors.hunkHeader }]));
      }
      for (const line of hunk.lines) {
        children.push(diffLineNode(line, gutterWidth, colors, theme, options.lang));
      }
    }
  }
  return { type: "box", id: options.id, style: { flexDirection: "column" }, children };
}
