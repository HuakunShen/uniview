import { createMemo, Show, type JSX } from "solid-js";
import { textInputSlices } from "@uniview/tui-core";
import { Text } from "./primitives";

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
 * A controlled single-line text field (Solid). Mirrors `@uniview/tui-react`'s
 * `TextInput` exactly (byte-identical SVG): the host's InputRouter owns editing,
 * this renders value + caret and declares role="textbox" so the router adopts it.
 */
export function TextInput(props: TextInputProps): JSX.Element {
  const slices = createMemo(() =>
    textInputSlices(props.value, {
      cursor: props.cursor,
      mask: props.mask,
      showCursor: props.showCursor ?? true,
      placeholder: props.placeholder,
    }),
  );
  const showCursor = (): boolean => props.showCursor ?? true;
  return (
    <box
      role="textbox"
      value={props.value}
      onChange={props.onChange}
      onSubmit={props.onSubmit}
      flexDirection="row"
      width={props.width}
    >
      <Show
        when={slices().placeholder}
        fallback={
          <>
            <Text>{slices().head}</Text>
            <Show when={showCursor()}>
              <Text caret>{slices().caret}</Text>
            </Show>
            <Text>{slices().tail}</Text>
          </>
        }
      >
        <Show when={showCursor()}>
          <Text inverse>{slices().caret}</Text>
        </Show>
        <Text dim color={props.placeholderColor ?? "gray"}>
          {slices().head}
        </Text>
      </Show>
    </box>
  );
}
