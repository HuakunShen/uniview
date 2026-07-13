import type { Color } from "./style-table";

/** Standard (xterm-ish) hex values for the named 16-color palette. */
export const NAMED_HEX: Record<string, string> = {
  black: "#000000",
  red: "#cd0000",
  green: "#00cd00",
  yellow: "#cdcd00",
  blue: "#0000ee",
  magenta: "#cd00cd",
  cyan: "#00cdcd",
  white: "#e5e5e5",
  gray: "#7f7f7f",
  grey: "#7f7f7f",
  brightblack: "#7f7f7f",
  brightred: "#ff0000",
  brightgreen: "#00ff00",
  brightyellow: "#ffff00",
  brightblue: "#5c5cff",
  brightmagenta: "#ff00ff",
  brightcyan: "#00ffff",
  brightwhite: "#ffffff",
};

/**
 * Resolve a {@link Color} to a CSS/SVG color string, or null when it cannot be
 * resolved (unknown token). Accepts named tokens, `#hex` strings, and rgb.
 */
export function resolveColorCss(color: Color | undefined): string | null {
  if (color === undefined) return null;
  if (typeof color === "string") {
    if (color.startsWith("#")) return color;
    return NAMED_HEX[color.toLowerCase()] ?? null;
  }
  return `rgb(${color.r},${color.g},${color.b})`;
}
