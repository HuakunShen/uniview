import { splitProps, type JSX } from "solid-js";
import type { TuiCommonProps } from "./primitives";
import { Text } from "./primitives";

export interface StatusItem {
  label: string;
  keyHint: string;
}

export interface StatusBarProps extends TuiCommonProps {
  items: readonly StatusItem[];
  /** Separator between items. Defaults to `" | "`. */
  separator?: string;
}

/**
 * A docked keybinding bar (lazygit's bottom row) — Solid port of
 * `@uniview/tui-react`'s `StatusBar`. Stateless; `children` are ignored, as in
 * the React original.
 *
 * NOTE: props are read through {@link splitProps} + getters, never destructured
 * (that would break Solid's fine-grained reactivity).
 */
export function StatusBar(props: StatusBarProps): JSX.Element {
  const [, rest] = splitProps(props, ["items", "separator", "children"]);
  const label = (): string =>
    props.items.map((i) => `${i.label}: ${i.keyHint}`).join(props.separator ?? " | ");
  return (
    <box {...rest} flexDirection="row">
      <Text>{label()}</Text>
    </box>
  );
}
