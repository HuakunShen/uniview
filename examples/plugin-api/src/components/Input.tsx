import { createElement } from "react";
import type { ReactElement } from "react";

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
  });
}
