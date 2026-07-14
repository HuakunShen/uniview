/** A length: cells, a percentage of the container, or content-sized. */
export type Dimension = number | `${number}%` | "auto";

/** Per-side inset shorthand: a single number or explicit sides. */
export type InsetsValue =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number };

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type JustifyContent =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around";
export type AlignItems = "start" | "center" | "end" | "stretch";
export type AlignSelf = "auto" | AlignItems;

/** Border presets; `true` is shorthand for a single-line border. */
export type BorderValue = boolean | "none" | "single" | "rounded" | "double";

/**
 * A Yoga-flavored, terminal-cell layout + visual style. Lengths are in cells;
 * the layout engine implements a flexbox-compatible subset.
 */
export interface TuiStyle {
  display?: "flex" | "none";
  position?: "relative" | "absolute";

  /** Insets for `position: "absolute"` children (cells or percent of parent). */
  top?: Dimension;
  right?: Dimension;
  bottom?: Dimension;
  left?: Dimension;

  flexDirection?: FlexDirection;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: Dimension;

  justifyContent?: JustifyContent;
  alignItems?: AlignItems;
  alignSelf?: AlignSelf;

  width?: Dimension;
  height?: Dimension;
  minWidth?: Dimension;
  maxWidth?: Dimension;
  minHeight?: Dimension;
  maxHeight?: Dimension;

  margin?: InsetsValue;
  padding?: InsetsValue;
  gap?: number;
  rowGap?: number;
  columnGap?: number;

  border?: BorderValue;
  overflow?: "visible" | "hidden" | "scroll";
  zIndex?: number;
}

const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Expand an {@link InsetsValue} into explicit per-side values. */
export function resolveInsets(value: InsetsValue | undefined): Insets {
  if (value === undefined) return ZERO_INSETS;
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  return {
    top: value.top ?? 0,
    right: value.right ?? 0,
    bottom: value.bottom ?? 0,
    left: value.left ?? 0,
  };
}

/** A visible border contributes one cell on each side. */
export function borderInsets(style: TuiStyle): Insets {
  const border = style.border;
  const visible = border === true || (typeof border === "string" && border !== "none");
  return visible ? { top: 1, right: 1, bottom: 1, left: 1 } : ZERO_INSETS;
}

/**
 * Resolve a {@link Dimension} against a container length. Returns `undefined`
 * for `"auto"` and for absent values so the caller can decide the fallback.
 */
export function resolveDimension(
  dim: Dimension | undefined,
  basis: number,
): number | undefined {
  if (dim === undefined || dim === "auto") return undefined;
  if (typeof dim === "number") return dim;
  const match = /^(-?\d+(?:\.\d+)?)%$/.exec(dim);
  if (match) return Math.round((basis * Number(match[1])) / 100);
  return undefined;
}
