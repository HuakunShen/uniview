import type { BorderValue } from "../style/tui-style";

/** The six glyphs that make up a box-drawing border. */
export interface BorderGlyphs {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}

export const BORDER_PRESETS: Record<"single" | "rounded" | "double", BorderGlyphs> = {
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
};

/** Resolve a {@link BorderValue} to its glyph set, or null when there is none. */
export function borderGlyphs(value: BorderValue | undefined): BorderGlyphs | null {
  if (value === undefined || value === false || value === "none") return null;
  if (value === true) return BORDER_PRESETS.single;
  return BORDER_PRESETS[value];
}
