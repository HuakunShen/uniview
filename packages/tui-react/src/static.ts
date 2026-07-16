import { createElement, type ReactElement } from "react";

export interface StaticProps<T> {
  /** The full append-only list. Only items appended since the last render commit. */
  items: readonly T[];
  /** Render one item to a finalized line string. */
  children: (item: T, index: number) => string;
}

/**
 * An append-only, never-repainted log region (ink's `<Static>`). Each item is
 * rendered to a line and carried on a zero-height `box` (`role="log"`,
 * `staticLines`); the host commits the new lines above the live frame and
 * de-dupes by node id, so appending items commits only the new ones. It paints
 * nothing in the live frame.
 */
export function Static<T>({ items, children }: StaticProps<T>): ReactElement {
  const staticLines = items.map((item, i) => children(item, i));
  return createElement("box", { role: "log", staticLines, height: 0 });
}
