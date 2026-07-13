/**
 * Normalized, JSON-safe style contract shared between the plugin-side
 * resolver and every native host. Native hosts consume ResolvedStyle
 * directly (no Tailwind parsing on the native side). All fields optional;
 * an unset field means "inherit / engine default".
 */

/** A length: px number, percentage string, or "auto". */
export type Dimension = number | `${number}%` | "auto";

export type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type JustifyContent =
  | "flex-start"
  | "center"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly";
export type AlignItems =
  | "flex-start"
  | "center"
  | "flex-end"
  | "stretch"
  | "baseline";
export type AlignSelf = "auto" | AlignItems;
export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
export type PositionType = "relative" | "absolute";
export type TextAlign = "left" | "center" | "right";
export type FontWeight = "normal" | "medium" | "semibold" | "bold";

/**
 * The resolved style object. Padding/margin are always expressed as the
 * four explicit edges (hosts map these straight onto Yoga edges).
 */
export interface ResolvedStyle {
  // Layout — flex container
  flexDirection?: FlexDirection;
  justifyContent?: JustifyContent;
  alignItems?: AlignItems;
  alignSelf?: AlignSelf;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: Dimension;
  flexWrap?: FlexWrap;
  gap?: number;
  // Layout — box edges
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  // Layout — sizing
  width?: Dimension;
  height?: Dimension;
  minWidth?: Dimension;
  minHeight?: Dimension;
  maxWidth?: Dimension;
  maxHeight?: Dimension;
  // Layout — positioning
  position?: PositionType;
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  // Visual
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  // Typography
  color?: string;
  fontSize?: number;
  fontWeight?: FontWeight;
  fontFamily?: string;
  textAlign?: TextAlign;
  lineHeight?: number;
}

/**
 * The style-object shape authors may pass via `style={{ ... }}`. Extends
 * ResolvedStyle with padding/margin shorthands that the resolver expands
 * into the four explicit edges.
 */
export interface StyleInput extends ResolvedStyle {
  padding?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
  margin?: number;
  marginHorizontal?: number;
  marginVertical?: number;
}
