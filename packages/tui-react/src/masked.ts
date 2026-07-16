import { createElement, type ReactElement } from "react";
import { DEFAULT_MASK, maskText } from "@uniview/tui-core";
import { Text, type TextProps } from "./primitives";

export interface MaskedProps extends Omit<TextProps, "children"> {
  /** The secret text to mask. */
  value: string;
  /** The grapheme rendered for each cluster of `value`. Defaults to "•". */
  mask?: string;
}

/**
 * A {@link Text} that renders each grapheme of `value` as a mask glyph — a
 * password field. All other `<Text>` styling props pass through unchanged.
 */
export function Masked(props: MaskedProps): ReactElement {
  const { value, mask = DEFAULT_MASK, ...rest } = props;
  return createElement(Text, rest, maskText(value, mask));
}
