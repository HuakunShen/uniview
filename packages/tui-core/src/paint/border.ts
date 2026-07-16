import type { BorderValue } from "../style/tui-style";

/** The six glyphs that make up a box-drawing border. */
export interface BorderGlyphs {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  /**
   * Per-edge overrides for asymmetric borders (half-block / quadrant). When
   * absent, both opposing edges reuse `horizontal`/`vertical`, so the classic
   * box-drawing presets are byte-for-byte unaffected.
   */
  horizontalTop?: string;
  horizontalBottom?: string;
  verticalLeft?: string;
  verticalRight?: string;
}

export const BORDER_PRESETS: Record<
  "single" | "rounded" | "double" | "thick" | "quadrant-inside" | "quadrant-outside",
  BorderGlyphs
> = {
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
  },
  rounded: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
  },
  double: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
  },
  thick: {
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛",
    horizontal: "━",
    vertical: "┃",
  },
  "quadrant-inside": {
    topLeft: "▗",
    topRight: "▖",
    bottomLeft: "▝",
    bottomRight: "▘",
    horizontal: "▄",
    vertical: "▐",
    horizontalTop: "▄",
    horizontalBottom: "▀",
    verticalLeft: "▐",
    verticalRight: "▌",
  },
  "quadrant-outside": {
    topLeft: "▛",
    topRight: "▜",
    bottomLeft: "▙",
    bottomRight: "▟",
    horizontal: "▀",
    vertical: "▌",
    horizontalTop: "▀",
    horizontalBottom: "▄",
    verticalLeft: "▌",
    verticalRight: "▐",
  },
};

/** Resolve a {@link BorderValue} to its glyph set, or null when there is none. */
export function borderGlyphs(value: BorderValue | undefined): BorderGlyphs | null {
  if (value === undefined || value === false || value === "none") return null;
  if (value === true) return BORDER_PRESETS.single;
  return BORDER_PRESETS[value];
}
