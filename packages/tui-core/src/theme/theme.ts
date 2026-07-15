import type { RgbColor } from "../style/style-table";
import type { BorderGlyphs } from "../paint/border";
import { BORDER_PRESETS } from "../paint/border";

export interface ThemeColors {
  background: RgbColor;
  surface: RgbColor;
  surfaceRaised: RgbColor;
  text: RgbColor;
  textMuted: RgbColor;
  border: RgbColor;
  primary: RgbColor;
  primaryText: RgbColor;
  danger: RgbColor;
  warning: RgbColor;
  success: RgbColor;
  focusRing: RgbColor;
}

export interface TuiTheme {
  name: string;
  colors: ThemeColors;
  /** Spacing scale in cells, indexed 0..n. */
  spacing: readonly number[];
  borders: Record<"none" | "single" | "rounded" | "double", BorderGlyphs | null>;
}

const rgb = (r: number, g: number, b: number): RgbColor => ({ r, g, b });

/** The built-in dark theme — restrained, readable in 16-color and truecolor. */
export const defaultTheme: TuiTheme = {
  name: "uniview-dark",
  colors: {
    background: rgb(30, 30, 30),
    surface: rgb(37, 37, 38),
    surfaceRaised: rgb(45, 45, 48),
    text: rgb(212, 212, 212),
    textMuted: rgb(133, 133, 133),
    border: rgb(69, 69, 69),
    primary: rgb(0, 122, 204),
    primaryText: rgb(255, 255, 255),
    danger: rgb(244, 71, 71),
    warning: rgb(204, 167, 0),
    success: rgb(35, 209, 139),
    focusRing: rgb(0, 150, 255),
  },
  spacing: [0, 1, 2, 3, 4],
  borders: {
    none: null,
    single: BORDER_PRESETS.single,
    rounded: BORDER_PRESETS.rounded,
    double: BORDER_PRESETS.double,
  },
};

/** A spacing-scale lookup, clamped to the theme's range. */
export function themeSpacing(theme: TuiTheme, step: number): number {
  if (step <= 0) return theme.spacing[0] ?? 0;
  return theme.spacing[Math.min(step, theme.spacing.length - 1)] ?? 0;
}
