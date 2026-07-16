import { createElement, type ReactElement } from "react";
import { Text } from "./primitives";

/** A flex filler (ink's `<Spacer>`): a box that grows to eat free main-axis space. */
export function Spacer(): ReactElement {
  return createElement("box", { flexGrow: 1 });
}

export interface NewlineProps {
  /** Number of blank rows to insert. Defaults to 1. */
  count?: number;
}

/**
 * Vertical whitespace (ink's `<Newline>`). Text leaves are single-line here — a
 * literal "\n" is a zero-width control char that never breaks a line — so blank
 * space is expressed as layout rows: a box `count` cells tall.
 */
export function Newline({ count = 1 }: NewlineProps): ReactElement {
  return createElement("box", { height: count });
}

export interface TransformProps {
  /** The text to transform (may contain "\n" for multiple lines). */
  children: string;
  /** Maps each input line to its rendered form. */
  transform: (line: string, index: number) => string;
}

/**
 * Per-line output transform (ink's `<Transform>`): each line of `children` is
 * run through `transform` and rendered as its own `<Text>` in a column.
 */
export function Transform({ children, transform }: TransformProps): ReactElement {
  const lines = String(children).split("\n");
  return createElement(
    "box",
    { flexDirection: "column" },
    ...lines.map((line, i) => createElement(Text, { key: String(i) }, transform(line, i))),
  );
}
