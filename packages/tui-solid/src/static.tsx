import { type JSX } from "solid-js";

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
 *
 * NOTE: `items`/`children` are read through getters (never destructured) so a
 * changing `items` signal keeps re-emitting the prop and re-triggering the host
 * commit.
 */
export function Static<T>(props: StaticProps<T>): JSX.Element {
  const staticLines = (): string[] => props.items.map((item, i) => props.children(item, i));
  return <box role="log" staticLines={staticLines()} height={0} />;
}
