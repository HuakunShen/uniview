import { createElement } from "react";
import type { ReactElement, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost";

export interface ButtonProps {
  children?: ReactNode;
  title?: string;
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * What each variant *looks like* — a design decision, so it lives here, in a
 * component, in TypeScript. It is not a prop the host receives.
 *
 * The renderer used to own this: `<Button variant="primary">` made AppKit paint a
 * blue→violet gradient it had hardcoded. That is a brand compiled into a renderer
 * — unreachable from the tree, unusable by any other product, and about to be
 * copy-pasted into Windows and HarmonyOS. Now the variant compiles to classes, the
 * classes resolve to the Style IR, and the renderer just draws what it is told.
 *
 * `secondary` is deliberately empty: an unstyled button *is* the platform's real
 * button, which is the whole reason to render natively at all.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-linear-to-br from-[#2e91c7] to-[#4f6bf2] text-white font-semibold " +
    "rounded-[10px] shadow-lg shadow-[#2e91c7cc]",
  secondary: "",
  outline: "border border-border rounded-md text-foreground",
  destructive: "bg-red-500 text-white font-semibold rounded-md",
  // A fill of `transparent` is still a fill: it tells the host "the plugin
  // painted this", which is what takes the native bezel away.
  ghost: "bg-transparent text-foreground rounded-md",
};

export function Button({
  children,
  title,
  variant = "secondary",
  onClick,
  disabled,
  className,
}: ButtonProps): ReactElement {
  const classes = [VARIANTS[variant], className].filter(Boolean).join(" ");

  return createElement(
    "Button",
    {
      title,
      onClick,
      disabled,
      ...(classes ? { className: classes } : {}),
    },
    children,
  );
}
