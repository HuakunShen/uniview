import type { ReactNode } from "react";
import { Button } from "@/lib/components/ui/button";

type PluginVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost";
type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost"
  | "link";

const variantMap: Record<PluginVariant, ButtonVariant> = {
  primary: "default",
  secondary: "secondary",
  outline: "outline",
  destructive: "destructive",
  ghost: "ghost",
};

interface PluginButtonProps {
  title?: string;
  variant?: PluginVariant | ButtonVariant;
  disabled?: boolean;
  className?: string;
  onClick?: (...args: unknown[]) => void | Promise<void>;
  children?: ReactNode;
}

export function PluginButton({
  title,
  variant = "secondary",
  disabled,
  className,
  onClick,
  children,
}: PluginButtonProps) {
  const handleClick = () => {
    onClick?.();
  };

  const mappedVariant =
    variantMap[variant as PluginVariant] ?? (variant as ButtonVariant);

  return (
    <Button
      variant={mappedVariant}
      disabled={disabled}
      className={className}
      onClick={handleClick}
    >
      {children || title}
    </Button>
  );
}
