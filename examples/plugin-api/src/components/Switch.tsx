import { createElement } from "react";
import type { ReactElement } from "react";

export interface SwitchProps {
  id?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}

export function Switch({
  id,
  checked,
  defaultChecked,
  disabled,
  onChange,
  className,
}: SwitchProps): ReactElement {
  return createElement("Switch", {
    id,
    checked,
    defaultChecked,
    disabled,
    onChange,
    className,
  });
}
