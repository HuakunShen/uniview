import { createElement } from "react";
import type { ReactElement, ReactNode } from "react";

export interface ButtonProps {
  children?: ReactNode;
  title?: string;
  variant?: "primary" | "secondary" | "outline" | "destructive" | "ghost";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function Button({
  children,
  title,
  variant = "secondary",
  onClick,
  disabled,
  className,
}: ButtonProps): ReactElement {
  return createElement(
    "Button",
    {
      title,
      variant,
      onClick,
      disabled,
      className,
    },
    children,
  );
}
