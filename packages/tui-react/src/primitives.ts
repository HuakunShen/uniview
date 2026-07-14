import { createElement, type Key, type ReactElement, type ReactNode } from "react";
import type { Color, StyledSpan, TuiStyle } from "@uniview/tui-core";

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

/** Keyboard event delivered to `onKeyDown`. */
export interface TuiKeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** Mouse-wheel event delivered to `onWheel`. */
export interface TuiWheelEvent {
  deltaY: number;
  x: number;
  y: number;
}

/** Pointer position delivered to click/hover handlers. */
export interface TuiPointerEvent {
  x: number;
  y: number;
}

/** Event handlers any interactive TUI element may declare. */
export interface TuiEventHandlers {
  onClick?: (event?: TuiPointerEvent) => void;
  onKeyDown?: (event: TuiKeyEvent) => void;
  onWheel?: (event: TuiWheelEvent) => void;
  onMouseEnter?: (event?: TuiPointerEvent) => void;
  onMouseLeave?: (event?: TuiPointerEvent) => void;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Semantic / automation attributes read by the host to build the accessibility
 * tree (queryByRole/Name, contract tests). All optional.
 */
export interface TuiSemanticProps {
  role?: string;
  name?: string;
  label?: string;
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
}

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
