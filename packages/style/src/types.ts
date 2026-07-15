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
export type FontStyle = "normal" | "italic";
export type TextDecoration = "none" | "underline" | "line-through";
/** `none` removes the box from layout entirely (Yoga's `display: none`). */
export type Display = "flex" | "none";
export type Overflow = "visible" | "hidden" | "scroll";

/**
 * A drop shadow, as geometry rather than a name.
 *
 * `shadow-lg` is a *look*, and every design system draws it differently — so the
 * IR carries the numbers and the theme owns the scale. A host that hardcodes the
 * radius and offset (as this one did) can render exactly one shadow, forever.
 */
export interface BoxShadow {
  offsetX: number;
  offsetY: number;
  radius: number;
  color: string;
}

/** Tailwind's eight gradient directions, as unit vectors the host can use as-is. */
export type GradientDirection =
  | "to-t"
  | "to-tr"
  | "to-r"
  | "to-br"
  | "to-b"
  | "to-bl"
  | "to-l"
  | "to-tl";

/**
 * A linear gradient — `bg-linear-to-br from-sky-500 via-indigo-400 to-violet-600`.
 *
 * This exists so that a *brand* can live in the plugin. The AppKit host used to
 * hardcode a blue→violet diagonal and paint it on any `<Button variant="primary">`:
 * a product decision compiled into a renderer, unreachable from the tree, and due
 * to be copy-pasted into every new platform. A gradient is geometry; whose
 * gradient it is, is not the renderer's business.
 */
export interface LinearGradient {
  direction: GradientDirection;
  /** `from`, then any `via`, then `to` — at least two stops. */
  colors: string[];
}

/**
 * A condition a style can be gated on. These are all things the *host* knows and
 * the plugin does not: which appearance the view ended up in, where the mouse is,
 * who holds first responder.
 */
export type VariantName =
  | "dark"
  | "light"
  | "hover"
  | "focus"
  | "active"
  | "disabled";

/**
 * Conditional styles, keyed by their condition chain (`"dark"`, `"hover"`,
 * `"dark:hover"`). Every condition in the key must hold for the style to apply;
 * more specific keys (more conditions) win over less specific ones.
 *
 * The whole point is that these are resolved by the HOST, not the plugin.
 * `dark:bg-zinc-900` could have been done by pushing the color scheme to the
 * plugin and re-rendering — but that costs a round trip, it can't be per-view
 * (one window forced light while the system is dark), and `hover:` can't work
 * that way at all: streaming every mouse-enter over RPC to re-render a tree is
 * absurd. So both variants travel *with* the style and the view picks.
 */
export type StyleVariants = Record<string, ResolvedStyle>;

/**
 * The resolved style object. Padding/margin are always expressed as the
 * four explicit edges (hosts map these straight onto Yoga edges).
 */
export interface ResolvedStyle {
  /** Conditional overlays. See `StyleVariants`. */
  variants?: StyleVariants;
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
  // Margins take a Dimension, not a plain number: `mx-auto` (auto margins) is
  // how Tailwind centers a fixed-width box, and Yoga implements it natively.
  marginTop?: Dimension;
  marginRight?: Dimension;
  marginBottom?: Dimension;
  marginLeft?: Dimension;
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
  /** Sibling paint order. Higher draws later (on top). */
  zIndex?: number;
  /** `none` takes the box out of layout — not merely invisible, absent. */
  display?: Display;
  overflow?: Overflow;
  /** width / height. Yoga sizes the missing axis from the other one. */
  aspectRatio?: number;
  // Visual
  backgroundColor?: string;
  backgroundGradient?: LinearGradient;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  shadow?: BoxShadow;
  /** Overrides `shadow.color`, so `shadow-lg shadow-emerald-500/30` composes. */
  shadowColor?: string;
  // Typography
  color?: string;
  fontSize?: number;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  fontFamily?: string;
  textAlign?: TextAlign;
  textDecoration?: TextDecoration;
  /** Line height in points. Wins over `lineHeightMultiple` when both are set. */
  lineHeight?: number;
  /**
   * Line height as a multiple of the font size — what Tailwind's `leading-tight`
   * actually means. It can't be resolved to points here: the font size may be set
   * by a *later* class, or inherited from a parent the resolver never sees. The
   * host knows the final font size, so the host does the multiplication.
   */
  lineHeightMultiple?: number;
  /** Truncate to this many lines (`truncate` = 1, `line-clamp-3` = 3). */
  maxLines?: number;
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
  margin?: Dimension;
  marginHorizontal?: Dimension;
  marginVertical?: Dimension;
}
