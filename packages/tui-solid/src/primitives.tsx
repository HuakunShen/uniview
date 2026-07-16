import type { JSX } from "solid-js";
import { createElement, spread } from "@uniview/solid-renderer";
import type {
  Color,
  StyledSpan,
  TuiEventHandlers,
  TuiSemanticProps,
  TuiStyle,
} from "@uniview/tui-core";

/**
 * First-class JSX components for the Uniview TUI host primitives, so Solid
 * plugins author terminal UI in real JSX (ink-style), e.g.
 *
 * ```tsx
 * <Box flexDirection="column" padding={1} border="rounded">
 *   <Text color="cyan" bold>Hello</Text>
 * </Box>
 * ```
 *
 * They are thin, typed wrappers over the `box` / `text` / `richtext`
 * primitives the Solid renderer renders — capitalized because Solid's
 * lowercase JSX intrinsics are typed only by a catch-all
 * `[tag: string]: Record<string, unknown>` (zero safety). Mirrors
 * `@uniview/tui-react`'s `primitives.ts` convention.
 */

/** Attributes shared by every TUI element: layout ({@link TuiStyle}) + handlers + semantics. */
export interface TuiCommonProps extends TuiStyle, TuiEventHandlers, TuiSemanticProps {
  children?: JSX.Element;
  /** Fill color for the element's box region (name/CSS string or `{ r, g, b }`). */
  backgroundColor?: Color;
}

/** Props for {@link Box}. */
export type BoxProps = TuiCommonProps;

/** Props for {@link Text}. */
export interface TextProps extends TuiCommonProps {
  color?: Color;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  blink?: boolean;
  hidden?: boolean;
  /**
   * Internal: marks this cell as a text-field caret. The host renders it
   * inverse + blinking only while the enclosing textbox is focused, so a single
   * caret blinks on the field being edited. Used by {@link TextInput}.
   */
  caret?: boolean;
}

/** Props for {@link RichText}. */
export interface RichTextProps extends TuiCommonProps {
  spans?: StyledSpan[];
}

/**
 * A flexbox container (`box` primitive).
 *
 * NOTE: props are spread, never destructured — destructuring would read each
 * prop eagerly and break Solid's fine-grained (getter-based) reactivity.
 */
export function Box(props: BoxProps): JSX.Element {
  return <box {...props} />;
}

/**
 * Styled text (`text` primitive). Children are strings/numbers.
 *
 * Built via the low-level renderer primitives instead of literal
 * `<text {...props} />` JSX: solid-js's own JSX typings declare a `text` SVG
 * intrinsic (`JSX.IntrinsicElements["text"]: TextSVGAttributes<SVGTextElement>`)
 * whose `onChange` expects a DOM `Event`, which is structurally incompatible
 * with {@link TuiEventHandlers.onChange}'s `(value: string) => void`.
 * TypeScript requires every partial declaration merged into
 * `JSX.IntrinsicElements` to agree on a property's type, so that collision
 * can't be resolved by widening `"text"`'s declared prop type — the only tag
 * among box/text/richtext that collides with a real DOM/SVG element name.
 * This mirrors exactly how `@uniview/tui-react` avoids the same class of
 * problem: it builds the element via `createElement("text", props)` instead
 * of raw `<text>` JSX. `spread` reads `props` through its getters inside a
 * reactive effect (the same mechanism the compiler emits for `{...props}`),
 * so this preserves Solid's fine-grained reactivity exactly like the JSX form.
 */
export function Text(props: TextProps): JSX.Element {
  const node = createElement("text");
  spread(node, props, false);
  return node as unknown as JSX.Element;
}

/** One line of pre-styled spans (`richtext` primitive) — highlighted code / diff lines. */
export function RichText(props: RichTextProps): JSX.Element {
  return <richtext {...props} />;
}
