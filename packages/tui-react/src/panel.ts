import { createElement, type ReactElement } from "react";
import type { Color } from "@uniview/tui-core";
import type { TuiCommonProps } from "./primitives";

/** A bordered, titled, focusable panel — the lazygit window primitive. */
export interface PanelProps extends TuiCommonProps {
  title?: string;
  titleAlign?: "left" | "center" | "right";
  footer?: string;
  footerAlign?: "left" | "center" | "right";
  /** When true, the border uses {@link PanelProps.focusedColor}. */
  focused?: boolean;
  /** Border color while focused. Defaults to `"green"`. */
  focusedColor?: Color;
  /** Border color while not focused (default terminal color when unset). */
  borderColor?: Color;
}

export function Panel(props: PanelProps): ReactElement {
  const { title, titleAlign, footer, footerAlign, focused, focusedColor = "green", borderColor, border, children, ...rest } = props;
  const resolvedBorderColor = focused ? focusedColor : borderColor;
  return createElement(
    "box",
    { ...rest, border: border ?? "rounded", title, titleAlign, footer, footerAlign, borderColor: resolvedBorderColor },
    children,
  );
}
