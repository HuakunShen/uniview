import { createMemo, Index, type JSX } from "solid-js";
import { Text } from "./primitives";

export interface SelectProps {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  /** Foreground color of the highlighted option. Defaults to cyan. */
  highlightColor?: string;
}

interface KeyPayload {
  key: string;
}

/**
 * A keyboard-navigable Select. Focus it (Tab) and use Up/Down to move the
 * selection (controlled — each move fires `onChange`). The current option is
 * marked with a caret. `role="listbox"` makes it queryable by automation.
 */
export function Select(props: SelectProps): JSX.Element {
  const index = createMemo(() => Math.max(0, props.options.indexOf(props.value)));

  const onKeyDown = (event: KeyPayload): void => {
    const i = index();
    const options = props.options;
    if (event.key === "ArrowDown") {
      props.onChange(options[Math.min(i + 1, options.length - 1)] ?? props.value);
    } else if (event.key === "ArrowUp") {
      props.onChange(options[Math.max(i - 1, 0)] ?? props.value);
    } else if (event.key === "Home") {
      props.onChange(options[0] ?? props.value);
    } else if (event.key === "End") {
      props.onChange(options[options.length - 1] ?? props.value);
    }
  };

  return (
    <box onKeyDown={onKeyDown} role="listbox" flexDirection="column">
      <Index each={props.options}>
        {(option, i) => {
          const active = createMemo(() => i === index());
          return (
            <Text color={active() ? (props.highlightColor ?? "cyan") : undefined}>
              {`${active() ? "› " : "  "}${option()}`}
            </Text>
          );
        }}
      </Index>
    </box>
  );
}
