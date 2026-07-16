import { For, type JSX } from "solid-js";
import { CalendarMachine } from "@uniview/tui-core";
import type { CalendarCell, Color, TuiKeyEvent, YearMonthDay } from "@uniview/tui-core";
import { Box, Text } from "./primitives";

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

export function isoDate(d: YearMonthDay): string {
  const p = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
  return `${d.year}-${p(d.month)}-${p(d.day)}`;
}

function pad2(n: number): string {
  return n < 10 ? ` ${n}` : `${n}`;
}

function weekdayLabels(weekStartsOn: 0 | 1): string[] {
  return WEEKDAYS.slice(weekStartsOn).concat(WEEKDAYS.slice(0, weekStartsOn));
}

export interface CalendarProps {
  referenceDate: YearMonthDay;
  value: YearMonthDay;
  onChange: (date: YearMonthDay) => void;
  onSubmit?: (date: YearMonthDay) => void;
  weekStartsOn?: 0 | 1;
  selectedBackground?: Color;
  selectedColor?: Color;
  todayColor?: Color;
}

export function Calendar(props: CalendarProps): JSX.Element {
  const weekStartsOn = (): 0 | 1 => props.weekStartsOn ?? 0;

  const weeks = (): CalendarCell[][] => {
    const machine = new CalendarMachine({ reference: props.referenceDate, weekStartsOn: weekStartsOn() });
    machine.setSelected(props.value);
    return machine.weeks();
  };

  const onKeyDown = (event: TuiKeyEvent): void => {
    const machine = new CalendarMachine({ reference: props.referenceDate, weekStartsOn: weekStartsOn() });
    machine.setSelected(props.value);
    for (const effect of machine.handle({ type: "key", ...event })) {
      if (effect.type === "change") props.onChange(effect.date);
      else props.onSubmit?.(effect.date);
    }
  };

  const cell = (c: CalendarCell): JSX.Element => {
    if (!c.date) return <Text>{"   "}</Text>;
    const selected = c.focused;
    return (
      <Text
        role="gridcell"
        name={isoDate(c.date)}
        selected={selected}
        backgroundColor={selected ? (props.selectedBackground ?? "blue") : undefined}
        color={selected ? props.selectedColor : c.today ? props.todayColor : undefined}
      >
        {`${pad2(c.date.day)} `}
      </Text>
    );
  };

  return (
    <box role="grid" onKeyDown={onKeyDown} flexDirection="column">
      <Text bold>{`${MONTHS[props.value.month - 1]} ${props.value.year}`}</Text>
      <Text dim>{weekdayLabels(weekStartsOn()).join(" ")}</Text>
      <For each={weeks()}>
        {(week) => (
          <Box role="row" flexDirection="row">
            <For each={week}>{(c) => cell(c)}</For>
          </Box>
        )}
      </For>
    </box>
  );
}
