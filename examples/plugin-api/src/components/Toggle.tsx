import { createElement } from "react";
import type { ReactElement, ReactNode } from "react";

export interface ToggleProps {
  children?: ReactNode;
  pressed?: boolean;
  defaultPressed?: boolean;
  disabled?: boolean;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  onClick?: () => void;
  className?: string;
}

export function Toggle({
  children,
  pressed,
  defaultPressed,
  disabled,
  variant = "default",
  size = "default",
  onClick,
  className,
}: ToggleProps): ReactElement {
  return createElement(
    "Toggle",
    {
      pressed,
      defaultPressed,
      disabled,
      variant,
      size,
      onClick,
      className,
    },
    children,
  );
}
