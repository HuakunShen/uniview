import { createMemo, Index, type JSX } from "solid-js";
import { Text } from "./primitives";

/** A flex filler (ink's `<Spacer>`): a box that grows to eat free main-axis space. */
export function Spacer(): JSX.Element {
  return <box flexGrow={1} />;
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
export function Newline(props: NewlineProps): JSX.Element {
  return <box height={props.count ?? 1} />;
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
export function Transform(props: TransformProps): JSX.Element {
  const lines = createMemo(() => String(props.children).split("\n"));
  return (
    <box flexDirection="column">
      <Index each={lines()}>{(line, i) => <Text>{props.transform(line(), i)}</Text>}</Index>
    </box>
  );
}
