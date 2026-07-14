import {
  graphemesOf,
  stringCellWidth,
  type StyledLine,
  type StyledSpan,
} from "@uniview/tui-core";

export interface WrapOptions {
  /** Cells of indentation added to every line after the first. */
  hangingIndent?: number;
}

interface Word {
  frags: StyledSpan[];
  width: number;
}

/** Split styled spans into words (maximal non-whitespace runs), dropping gaps. */
function toWords(spans: StyledSpan[]): Word[] {
  const words: Word[] = [];
  let frags: StyledSpan[] = [];
  let width = 0;
  const flush = () => {
    if (frags.length > 0) {
      words.push({ frags, width });
      frags = [];
      width = 0;
    }
  };
  for (const span of spans) {
    for (const piece of span.text.split(/(\s+)/)) {
      if (piece === "") continue;
      if (/^\s+$/.test(piece)) {
        flush();
        continue;
      }
      frags.push({ text: piece, style: span.style });
      width += stringCellWidth(piece);
    }
  }
  flush();
  return words;
}

/** Grapheme-aware hard break of an over-long word across chunk widths. */
function breakWord(frags: StyledSpan[], firstAvail: number, contAvail: number): Word[] {
  const chunks: Word[] = [];
  let current: StyledSpan[] = [];
  let width = 0;
  let cap = Math.max(1, firstAvail);
  const flush = () => {
    if (current.length > 0) {
      chunks.push({ frags: current, width });
      current = [];
      width = 0;
      cap = Math.max(1, contAvail);
    }
  };
  for (const frag of frags) {
    for (const g of graphemesOf(frag.text)) {
      const w = stringCellWidth(g);
      if (width + w > cap && width > 0) flush();
      const last = current[current.length - 1];
      if (last && last.style === frag.style) last.text += g;
      else current.push({ text: g, style: frag.style });
      width += w;
    }
  }
  if (current.length > 0) chunks.push({ frags: current, width });
  return chunks;
}

/**
 * Word-wrap styled spans to `width` cells, preserving each span's style and
 * measuring wide characters as 2 cells. Words longer than the width are
 * hard-broken at grapheme boundaries. Continuation lines get `hangingIndent`
 * leading spaces. A non-positive width disables wrapping.
 */
export function wrapStyledSpans(
  spans: StyledSpan[],
  width: number,
  options: WrapOptions = {},
): StyledLine[] {
  if (width <= 0) return [spans];
  const indent = Math.max(0, options.hangingIndent ?? 0);
  const words = toWords(spans);
  if (words.length === 0) return [[]];

  const lines: StyledLine[] = [];
  let current: StyledSpan[] = [];
  let currentWidth = 0;
  let started = false;

  const indentFor = (): number => (lines.length === 0 ? 0 : indent);
  const flush = (): void => {
    lines.push(current);
    current = [];
    currentWidth = 0;
    started = false;
  };
  const ensureStart = (): void => {
    if (started) return;
    const ind = indentFor();
    if (ind > 0) {
      current.push({ text: " ".repeat(ind) });
      currentWidth = ind;
    }
    started = true;
  };
  const place = (frags: StyledSpan[], w: number): void => {
    current.push(...frags);
    currentWidth += w;
  };

  for (const word of words) {
    ensureStart();
    const hasContent = currentWidth > indentFor();
    const space = hasContent ? 1 : 0;
    if (currentWidth + space + word.width <= width) {
      if (space > 0) place([{ text: " " }], 1);
      place(word.frags, word.width);
      continue;
    }
    if (hasContent) {
      flush();
      ensureStart();
    }
    if (currentWidth + word.width <= width) {
      place(word.frags, word.width);
      continue;
    }
    // Word is wider than a full line: hard-break it.
    const chunks = breakWord(word.frags, width - currentWidth, width - indentFor());
    chunks.forEach((chunk, i) => {
      if (i > 0) {
        flush();
        ensureStart();
      }
      place(chunk.frags, chunk.width);
    });
  }
  flush();
  return lines;
}
