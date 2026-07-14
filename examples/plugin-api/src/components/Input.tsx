import { createElement } from "react";
import type { ReactElement } from "react";
import type { KeyDownEvent } from "@uniview/protocol";

export interface InputProps {
  id?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
  type?: "text" | "email" | "password" | "number" | "tel" | "url";
  disabled?: boolean;
  onChange?: (value: string) => void;
  className?: string;
  /** Put the caret here on mount. */
  autoFocus?: boolean;
  /**
   * The keys this field wants *instead of* their normal editing behaviour —
   * `["ArrowDown", "ArrowUp", "Enter", "Escape"]`.
   *
   * This is what lets a search field drive the list below it. A focused field
   * turns ArrowDown into a caret move before anything else can see the key; it
   * only reaches `onKeyDown` if the field says it wants that key instead.
   * Everything undeclared still types, deletes and navigates exactly as it does
   * in every other field on the machine.
   */
  keyDownEvents?: string[];
  onKeyDown?: (event: KeyDownEvent) => void;
}

export function Input({
  id,
  value,
  defaultValue,
  placeholder,
  label,
  type = "text",
  disabled,
  onChange,
  className,
  autoFocus,
  keyDownEvents,
  onKeyDown,
}: InputProps): ReactElement {
  return createElement("Input", {
    id,
    value,
    defaultValue,
    placeholder,
    label,
    type,
    disabled,
    onChange,
    className,
    autoFocus,
    keyDownEvents,
    onKeyDown,
  });
}
