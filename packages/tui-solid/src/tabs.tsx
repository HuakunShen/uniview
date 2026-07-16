import { Index, type JSX } from "solid-js";
import { TabsMachine, type TuiInputEvent } from "@uniview/tui-core";
import { Text } from "./primitives";

export interface TabItem {
  /** Tab strip label. */
  label: string;
  /** Panel content shown when this tab is active. */
  content: JSX.Element;
  /** Skipped by roving navigation and not selectable. */
  disabled?: boolean;
}

export interface TabsProps {
  tabs: readonly TabItem[];
  /** Controlled active index. */
  value: number;
  /** Fired when roving navigation selects a different enabled tab. */
  onChange: (index: number) => void;
  /** Foreground color of the active tab label. Defaults to "cyan". */
  highlightColor?: string;
}

/**
 * A controlled tab strip + active panel (Solid). Mirrors `@uniview/tui-react`'s
 * `Tabs`: roving arrow navigation (wraparound, disabled skipped) through a
 * stateless TabsMachine seeded from `value`; role="tablist"/"tab" queryable.
 */
export function Tabs(props: TabsProps): JSX.Element {
  const onKeyDown = (event: { key: string }): void => {
    const disabled = props.tabs.map((t, i) => (t.disabled ? i : -1)).filter((i) => i >= 0);
    const machine = new TabsMachine({ count: props.tabs.length, selectedIndex: props.value, disabled });
    const input: TuiInputEvent = { type: "key", key: event.key, ctrl: false, alt: false, shift: false, meta: false };
    for (const effect of machine.handle(input)) props.onChange(effect.index);
  };

  return (
    <box role="tablist" onKeyDown={onKeyDown} flexDirection="column">
      <box flexDirection="row" gap={1}>
        <Index each={props.tabs}>
          {(tab, i) => (
            <Text
              role="tab"
              selected={i === props.value}
              disabled={tab().disabled}
              color={i === props.value ? (props.highlightColor ?? "cyan") : undefined}
              underline={i === props.value}
            >
              {tab().label}
            </Text>
          )}
        </Index>
      </box>
      <box>{props.tabs[props.value]?.content ?? null}</box>
    </box>
  );
}
