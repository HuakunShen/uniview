import { createElement as h, type ReactElement } from "react";
import { CalendarMachine } from "@uniview/tui-core";
import type { CalendarCell, Color, YearMonthDay } from "@uniview/tui-core";
import type { TuiKeyEvent } from "./primitives";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** `YYYY-MM-DD` — the stable automation name for a day cell. */
export function isoDate(d: YearMonthDay): string {
  const p = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
  return `${d.year}-${p(d.month)}-${p(d.day)}`;
}

/** Right-align a day number into a 2-cell field (`" 1"`, `"16"`). */
function pad2(n: number): string {
  return n < 10 ? ` ${n}` : `${n}`;
}

/** Rotate the weekday labels so index 0 is `weekStartsOn`. */
function weekdayLabels(weekStartsOn: 0 | 1): string[] {
  return WEEKDAYS.slice(weekStartsOn).concat(WEEKDAYS.slice(0, weekStartsOn));
}

export interface CalendarProps {
  /** Injected reference ("today") and initial view. Deterministic — never Date.now(). */
  referenceDate: YearMonthDay;
  /** Controlled selected date. */
  value: YearMonthDay;
  onChange: (date: YearMonthDay) => void;
  /** Fired on Enter (confirm). */
  onSubmit?: (date: YearMonthDay) => void;
  /** 0 = weeks start Sunday (default), 1 = Monday. */
  weekStartsOn?: 0 | 1;
  /** Highlight background of the selected day. Defaults to `"blue"`. */
  selectedBackground?: Color;
  selectedColor?: Color;
  /** Foreground of the reference ("today") day when not selected. */
  todayColor?: Color;
}

export function Calendar(props: CalendarProps): ReactElement {
  const weekStartsOn = props.weekStartsOn ?? 0;
  const selectedBackground = props.selectedBackground ?? "blue";

  const machine = new CalendarMachine({ reference: props.referenceDate, weekStartsOn });
  machine.setSelected(props.value);
  const weeks = machine.weeks();

  const onKeyDown = (event: TuiKeyEvent): void => {
    for (const effect of machine.handle({ type: "key", ...event })) {
      if (effect.type === "change") props.onChange(effect.date);
      else props.onSubmit?.(effect.date);
    }
  };

  const cell = (c: CalendarCell, ci: number): ReactElement => {
    if (!c.date) return h("text", { key: `pad-${ci}` }, "   "); // 3-wide blank ("dd ")
    const selected = c.focused;
    return h(
      "text",
      {
        key: isoDate(c.date),
        role: "gridcell",
        name: isoDate(c.date),
        selected,
        backgroundColor: selected ? selectedBackground : undefined,
        color: selected ? props.selectedColor : c.today ? props.todayColor : undefined,
      },
      `${pad2(c.date.day)} `,
    );
  };

  const header = h("text", { bold: true }, `${MONTHS[props.value.month - 1]} ${props.value.year}`);
  const weekdayRow = h("text", { dim: true }, weekdayLabels(weekStartsOn).join(" "));
  const rows = weeks.map((week, wi) =>
    h("box", { key: `w-${wi}`, role: "row", flexDirection: "row" }, ...week.map(cell)),
  );

  return h("box", { role: "grid", onKeyDown, flexDirection: "column" }, header, weekdayRow, ...rows);
}
