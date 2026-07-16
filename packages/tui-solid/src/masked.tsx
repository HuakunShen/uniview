import { splitProps, type JSX } from "solid-js";
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
 *
 * NOTE: `value`/`mask` are read through `props` (never destructured at the top)
 * so a changing `value` signal keeps re-rendering the masked text.
 */
export function Masked(props: MaskedProps): JSX.Element {
  const [, rest] = splitProps(props, ["value", "mask"]);
  return <Text {...rest}>{maskText(props.value, props.mask ?? DEFAULT_MASK)}</Text>;
}
