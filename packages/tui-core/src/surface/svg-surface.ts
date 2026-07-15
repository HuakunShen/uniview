import { CellBuffer, CellFlags } from "../buffer/cell-buffer";
import { resolveColorCss } from "../style/palette";
import { StyleTable, type CellStyle } from "../style/style-table";
import type { CellSurface, FrameUpdate, PresentStats, Size } from "./types";

export interface SvgRenderOptions {
  cellWidth?: number;
  cellHeight?: number;
  fontSize?: number;
  fontFamily?: string;
  background?: string;
  defaultForeground?: string;
}

const DEFAULTS = {
  cellWidth: 8,
  cellHeight: 16,
  fontSize: 13,
  // A stack, not the generic `monospace`: box-drawing glyphs (│ ╭ ─ ╯) only join
  // up into unbroken frames in fonts that actually draw them edge-to-edge, and
  // the generic family resolves to whatever the renderer happens to pick. Single
  // quotes because this sits inside a double-quoted XML attribute.
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace",
  background: "#1e1e1e",
  defaultForeground: "#d0d0d0",
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A style key so consecutive same-styled glyphs share one `<text>` run. */
function textKey(style: CellStyle): string {
  return [
    resolveColorCss(style.fg) ?? "",
    style.bold ? 1 : 0,
    style.italic ? 1 : 0,
    style.underline ? 1 : 0,
  ].join("|");
}

/** Render a frame to a standalone SVG string on a monospace cell grid. */
export function renderSvg(
  buffer: CellBuffer,
  styles: StyleTable,
  options: SvgRenderOptions = {},
): string {
  const opt = { ...DEFAULTS, ...options };
  const width = buffer.width * opt.cellWidth;
  const height = buffer.height * opt.cellHeight;
  const parts: string[] = [];

  // The XML declaration is not optional here. A terminal frame is full of
  // box-drawing and block glyphs (│ ╭ █ ▄ ⣿), and a standalone .svg served or
  // opened without an encoding hint is decoded as Latin-1 — every one of those
  // characters turns to mojibake. Inlined into MDX/HTML it would inherit the
  // document's charset, but the file has to stand on its own too.
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="${opt.background}"/>`);

  // Background rects: coalesce runs of the same bg color per row.
  for (let y = 0; y < buffer.height; y += 1) {
    let runStart = -1;
    let runColor: string | null = null;
    const flush = (endX: number) => {
      if (runStart < 0 || runColor === null) return;
      const rx = runStart * opt.cellWidth;
      const rw = (endX - runStart) * opt.cellWidth;
      parts.push(
        `<rect x="${rx}" y="${y * opt.cellHeight}" width="${rw}" height="${opt.cellHeight}" fill="${runColor}"/>`,
      );
      runStart = -1;
      runColor = null;
    };
    for (let x = 0; x < buffer.width; x += 1) {
      const bg = resolveColorCss(styles.get(buffer.styleIds[buffer.index(x, y)]!).bg);
      if (bg !== runColor) {
        flush(x);
        if (bg !== null) {
          runStart = x;
          runColor = bg;
        }
      }
    }
    flush(buffer.width);
  }

  // Text runs: coalesce consecutive non-blank glyphs of the same style per row.
  const baseline = Math.round((opt.cellHeight + opt.fontSize) / 2) - 1;
  for (let y = 0; y < buffer.height; y += 1) {
    let runStartX = -1;
    let runKey = "";
    let runText = "";
    let runStyle: CellStyle = {};

    /**
     * `endX` is the column the run stops at, so its cell span (and therefore its
     * exact pixel width) is known. Two things depend on that:
     *
     * - `xml:space="preserve"`, because a run coalesces the spaces *between*
     *   words and SVG collapses whitespace by default — without it every glyph
     *   after an interior gap slides left onto the wrong cell.
     * - `textLength`, because `font-family: monospace` is a generic family whose
     *   advance width differs per machine; trusting glyph metrics lets error
     *   accumulate across a row. Pinning each run to its cell width keeps the
     *   grid exact on any renderer. `lengthAdjust="spacing"` distributes the
     *   slack between glyphs rather than stretching the glyphs themselves.
     */
    const flush = (endX: number) => {
      // Drop whitespace-only runs (padding); interior spaces stay in a run.
      if (runStartX < 0 || runText.trim().length === 0) {
        runStartX = -1;
        runText = "";
        return;
      }
      const fill = resolveColorCss(runStyle.fg) ?? opt.defaultForeground;
      const cellSpan = endX - runStartX;
      const attrs = [
        `x="${runStartX * opt.cellWidth}"`,
        `y="${y * opt.cellHeight + baseline}"`,
        `font-family="${opt.fontFamily}"`,
        `font-size="${opt.fontSize}"`,
        `fill="${fill}"`,
        `textLength="${cellSpan * opt.cellWidth}"`,
        `lengthAdjust="spacing"`,
        `xml:space="preserve"`,
      ];
      if (runStyle.bold) attrs.push(`font-weight="bold"`);
      if (runStyle.italic) attrs.push(`font-style="italic"`);
      if (runStyle.underline) attrs.push(`text-decoration="underline"`);
      parts.push(`<text ${attrs.join(" ")}>${escapeXml(runText)}</text>`);
      runStartX = -1;
      runText = "";
    };

    for (let x = 0; x < buffer.width; x += 1) {
      const i = buffer.index(x, y);
      // The trailing half of a wide glyph: it belongs to the run already, and
      // counts toward the span, so do not break the run here.
      if (buffer.flags[i]! & CellFlags.Continuation) continue;
      const grapheme = buffer.graphemes[i]!;
      if (grapheme === "") {
        // An unwritten cell. End the run here rather than swallowing the hole:
        // a run whose text is shorter than its span would be stretched by
        // textLength.
        flush(x);
        continue;
      }
      const style = styles.get(buffer.styleIds[i]!);
      const key = textKey(style);
      if (runStartX < 0 || key !== runKey) {
        flush(x);
        runStartX = x;
        runKey = key;
        runStyle = style;
      }
      runText += grapheme;
    }
    flush(buffer.width);
  }

  parts.push("</svg>");
  return parts.join("");
}

/** A {@link CellSurface} that records frames and renders them to SVG artifacts. */
export class SvgCellSurface implements CellSurface {
  readonly kind = "svg" as const;
  private readonly styles: StyleTable;
  private readonly options: SvgRenderOptions;
  private frame: CellBuffer | null = null;

  constructor(options: SvgRenderOptions & { styles?: StyleTable } = {}) {
    const { styles, ...rest } = options;
    this.styles = styles ?? new StyleTable();
    this.options = rest;
  }

  mount(_size: Size): void {
    this.frame = null;
  }

  resize(_size: Size): void {}

  present(frame: CellBuffer, _update: FrameUpdate): PresentStats {
    this.frame = frame.clone();
    return { rowsPainted: frame.height, runsPainted: 0 };
  }

  destroy(): void {
    this.frame = null;
  }

  /** The recorded frame rendered to an SVG string, or null if none yet. */
  toSVG(): string | null {
    return this.frame ? renderSvg(this.frame, this.styles, this.options) : null;
  }
}
