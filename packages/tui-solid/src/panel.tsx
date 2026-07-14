import { splitProps, type JSX } from "solid-js";
import type { BorderValue, Color } from "@uniview/tui-core";
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

/**
 * Solid port of `@uniview/tui-react`'s `Panel` — stateless, a pure prop→element
 * mapping onto the `box` primitive (whose `title`/`footer`/`borderColor` props
 * are interpreted by `@uniview/host-tui`'s converter).
 *
 * NOTE: props are read through {@link splitProps} + getters, never destructured
 * — destructuring would snapshot each prop eagerly and break Solid's
 * fine-grained reactivity (a `focused` signal would stop repainting the border).
 */
export function Panel(props: PanelProps): JSX.Element {
  const [, rest] = splitProps(props, [
    "title",
    "titleAlign",
    "footer",
    "footerAlign",
    "focused",
    "focusedColor",
    "borderColor",
    "border",
    "children",
  ]);
  const border = (): BorderValue => props.border ?? "rounded";
  const resolvedBorderColor = (): Color | undefined =>
    props.focused ? (props.focusedColor ?? "green") : props.borderColor;
  return (
    <box
      {...rest}
      border={border()}
      title={props.title}
      titleAlign={props.titleAlign}
      footer={props.footer}
      footerAlign={props.footerAlign}
      borderColor={resolvedBorderColor()}
    >
      {props.children}
    </box>
  );
}
