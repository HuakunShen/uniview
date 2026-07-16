import { createElement as h, type ReactElement } from "react";
import { textInputSlices } from "@uniview/tui-core";

export interface TextInputProps {
  /** Controlled text value (the real text, even in mask mode). */
  value: string;
  /** Fired by the host's editing machine on every value change. */
  onChange: (value: string) => void;
  /** Fired on Enter with the current value. */
  onSubmit?: (value: string) => void;
  /** Shown dimmed when value is empty. */
  placeholder?: string;
  /** Password mode: true → "•"; a string sets a custom mask grapheme. */
  mask?: boolean | string;
  /** Caret position in grapheme units. Defaults to end-of-value (see design note). */
  cursor?: number;
  /** Draw the caret cell (default true). */
  showCursor?: boolean;
  /** Fixed field width in cells. Defaults to content width. */
  width?: number;
  /** Placeholder text color. Defaults to "gray". */
  placeholderColor?: string;
}

/**
 * A controlled single-line text field. The host's InputRouter owns editing —
 * this renders the value plus a caret cell and declares role="textbox" so the
 * router adopts it and fires onChange/onSubmit. The caret sits at end-of-value
 * unless a controlled `cursor` is given (see the plan's design note).
 */
export function TextInput(props: TextInputProps): ReactElement {
  const {
    value,
    onChange,
    onSubmit,
    placeholder,
    mask,
    cursor,
    showCursor = true,
    width,
    placeholderColor = "gray",
  } = props;
  const s = textInputSlices(value, { cursor, mask, showCursor, placeholder });
  // The host paints this cell inverse + blinking only while the field is
  // focused (see uinodeToRenderNode) — so exactly one caret blinks at a time.
  const caretCell = showCursor ? h("text", { key: "c", caret: true }, s.caret) : null;
  return h(
    "box",
    { role: "textbox", value, onChange, onSubmit, flexDirection: "row", width },
    s.placeholder
      ? [caretCell, h("text", { key: "p", dim: true, color: placeholderColor }, s.head)]
      : [h("text", { key: "h" }, s.head), caretCell, h("text", { key: "t" }, s.tail)],
  );
}
