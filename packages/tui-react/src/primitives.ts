import { createElement, type Key, type ReactElement, type ReactNode } from "react";
import type {
  Color,
  StyledSpan,
  TuiEventHandlers,
  TuiKeyEvent,
  TuiPointerEvent,
  TuiSemanticProps,
  TuiStyle,
  TuiWheelEvent,
} from "@uniview/tui-core";

/**
 * First-class JSX components for the Uniview TUI host primitives, so plugins
 * author terminal UI in real JSX (ink-style), e.g.
 *
 * ```tsx
 * <Box flexDirection="column" padding={1} border="rounded">
 *   <Text color="cyan" bold>Hello</Text>
 * </Box>
 * ```
 *
 * They are thin, typed wrappers over the `box` / `text` / `richtext` primitives
 * the reconciler renders — capitalized so they never collide with the DOM/SVG
 * intrinsic elements from `@types/react`.
 */

// Event types + semantic props are framework-agnostic and live in
// `@uniview/tui-core`; re-exported here so tui-react's public API is unchanged.
export type {
  TuiEventHandlers,
  TuiKeyEvent,
  TuiPointerEvent,
  TuiSemanticProps,
  TuiWheelEvent,
};

/** Attributes shared by every TUI element: layout ({@link TuiStyle}) + handlers + semantics. */
export interface TuiCommonProps extends TuiStyle, TuiEventHandlers, TuiSemanticProps {
  key?: Key;
  children?: ReactNode;
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
}

/** Props for {@link RichText}. */
export interface RichTextProps extends TuiCommonProps {
  spans?: StyledSpan[];
}

/** A flexbox container (`box` primitive). */
export function Box(props: BoxProps): ReactElement {
  return createElement("box", props);
}

/** Styled text (`text` primitive). Children are strings/numbers. */
export function Text(props: TextProps): ReactElement {
  return createElement("text", props);
}

/** One line of pre-styled spans (`richtext` primitive) — highlighted code / diff lines. */
export function RichText(props: RichTextProps): ReactElement {
  return createElement("richtext", props);
}
