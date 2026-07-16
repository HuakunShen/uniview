import { createElement as h, type ReactElement, type ReactNode } from "react";
import { TabsMachine, type TuiInputEvent } from "@uniview/tui-core";

export interface TabItem {
  /** Tab strip label. */
  label: string;
  /** Panel content shown when this tab is active. */
  content: ReactNode;
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
 * A controlled tab strip + active panel. Roving Left/Right/Up/Down/Home/End
 * navigation (wraparound, disabled tabs skipped) runs through a stateless
 * TabsMachine seeded from `value`. role="tablist"/"tab" make it queryable.
 * (Tab itself is the global focus key, so it moves focus in/out of the panel.)
 */
export function Tabs({ tabs, value, onChange, highlightColor = "cyan" }: TabsProps): ReactElement {
  const disabled = tabs.map((t, i) => (t.disabled ? i : -1)).filter((i) => i >= 0);

  const onKeyDown = (event: { key: string }): void => {
    const machine = new TabsMachine({ count: tabs.length, selectedIndex: value, disabled });
    const input: TuiInputEvent = { type: "key", key: event.key, ctrl: false, alt: false, shift: false, meta: false };
    for (const effect of machine.handle(input)) onChange(effect.index);
  };

  const strip = h(
    "box",
    { flexDirection: "row", gap: 1 },
    ...tabs.map((tab, i) =>
      h(
        "text",
        {
          key: tab.label,
          role: "tab",
          selected: i === value,
          disabled: tab.disabled,
          color: i === value ? highlightColor : undefined,
          underline: i === value,
        },
        tab.label,
      ),
    ),
  );

  return h(
    "box",
    { role: "tablist", onKeyDown, flexDirection: "column" },
    strip,
    h("box", null, tabs[value]?.content ?? null),
  );
}
