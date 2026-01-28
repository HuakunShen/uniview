import type { ReactNode } from "react";
import { Toggle } from "@/lib/components/ui/toggle";

interface PluginToggleProps {
  pressed?: boolean;
  defaultPressed?: boolean;
  disabled?: boolean;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  className?: string;
  onClick?: (...args: unknown[]) => void | Promise<void>;
  children?: ReactNode;
}

export function PluginToggle({
  pressed,
  defaultPressed,
  disabled,
  variant = "default",
  size = "default",
  className,
  onClick,
  children,
}: PluginToggleProps) {
  const handlePressedChange = () => {
    onClick?.();
  };

  return (
    <Toggle
      pressed={pressed}
      defaultPressed={defaultPressed}
      disabled={disabled}
      variant={variant}
      size={size}
      className={className}
      onPressedChange={handlePressedChange}
    >
      {children}
    </Toggle>
  );
}
