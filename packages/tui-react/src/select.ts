import { createElement as h } from "react";
import type { ReactElement } from "react";

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
export function Select({ options, value, onChange, highlightColor = "cyan" }: SelectProps): ReactElement {
  const index = Math.max(0, options.indexOf(value));

  const onKeyDown = (event: KeyPayload): void => {
    if (event.key === "ArrowDown") {
      onChange(options[Math.min(index + 1, options.length - 1)] ?? value);
    } else if (event.key === "ArrowUp") {
      onChange(options[Math.max(index - 1, 0)] ?? value);
    } else if (event.key === "Home") {
      onChange(options[0] ?? value);
    } else if (event.key === "End") {
      onChange(options[options.length - 1] ?? value);
    }
  };

  return h(
    "box",
    { onKeyDown, role: "listbox", flexDirection: "column" },
    ...options.map((option, i) =>
      h(
        "text",
        { key: option, color: i === index ? highlightColor : undefined },
        `${i === index ? "› " : "  "}${option}`,
      ),
    ),
  );
}
