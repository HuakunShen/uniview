import { createEffect, createSignal, For, type JSX } from "solid-js";
import { listCounter } from "@uniview/tui-core";
import type { Color, Dimension, TuiKeyEvent } from "@uniview/tui-core";
import { Text } from "./primitives";

// `listCounter` is a pure, framework-agnostic helper that lives in
// `@uniview/tui-core`; re-exported here so tui-solid's surface mirrors
// `@uniview/tui-react`'s `list` module.
export { listCounter };

export interface ListProps<T> {
  items: readonly T[];
  /** Controlled selection index. */
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Render a row. Defaults to `String(item)` in a `Text`. */
  renderItem?: (item: T, index: number, selected: boolean) => JSX.Element;
  /** Viewport height in rows. Defaults to the item count (no scrolling). */
  height?: number;
  width?: Dimension;
  /** Full-row highlight color for the selected row. Defaults to `"blue"`. */
  selectedBackground?: Color;
  /** Text color of the selected row. */
  selectedColor?: Color;
}

/**
 * A scrollable, selectable list — the lazygit branch/commit list primitive, and
 * the Solid port of `@uniview/tui-react`'s `List`. Controlled
 * (`selectedIndex`/`onSelect`); the full row highlights, arrow
 * keys/Home/End/PageUp/PageDown move the selection, clicking a row selects it,
 * and the viewport scrolls to keep the selection visible.
 *
 * NOTE: props are never destructured — that would snapshot them eagerly and
 * break Solid's fine-grained reactivity.
 */
export function List<T>(props: ListProps<T>): JSX.Element {
  const viewport = (): number => props.height ?? props.items.length;
  const maxScroll = (): number => Math.max(0, props.items.length - viewport());
  const [scrollTop, setScrollTop] = createSignal(0);

  // `selectedIndex` is externally controlled: onSelect(next) only becomes the
  // new prop value once the consumer commits it — and that commit can trail the
  // key event (a parent that batches, or a host that owns the selection and
  // echoes it back over RPC). Back-to-back key events dispatched before that
  // commit (e.g. two ArrowDowns fired synchronously) would otherwise both read
  // the same stale `selectedIndex` and collapse into a single step. This plain
  // mutable variable tracks the last *requested* index so consecutive
  // synchronous events compose correctly. It is deliberately NOT a signal: it
  // is written and read synchronously inside one event, never read reactively.
  // The effect below re-syncs it whenever the prop actually changes (including
  // externally-driven changes).
  let requested = props.selectedIndex;
  createEffect(() => {
    requested = props.selectedIndex;
  });

  createEffect(() => {
    const selected = props.selectedIndex;
    const view = viewport();
    const max = maxScroll();
    setScrollTop((top) => {
      if (selected < top) return selected;
      if (selected >= top + view) return selected - view + 1;
      return Math.min(top, max);
    });
  });

  const select = (index: number): void => {
    requested = index;
    props.onSelect(index);
  };

  const onKeyDown = (event: TuiKeyEvent): void => {
    const last = props.items.length - 1;
    if (last < 0) return;
    const view = viewport();
    const current = requested;
    let next: number | undefined;
    if (event.key === "ArrowDown") next = Math.min(current + 1, last);
    else if (event.key === "ArrowUp") next = Math.max(current - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === "PageDown") next = Math.min(current + view, last);
    else if (event.key === "PageUp") next = Math.max(current - view, 0);
    if (next === undefined) return;
    select(next);
  };

  /** Indices of the rows currently inside the viewport. */
  const visible = (): number[] => {
    const start = scrollTop();
    const end = Math.min(props.items.length, start + viewport());
    const indices: number[] = [];
    for (let i = start; i < end; i += 1) indices.push(i);
    return indices;
  };

  return (
    <box onKeyDown={onKeyDown} flexDirection="column" height={viewport()} width={props.width}>
      <For each={visible()}>
        {(index) => {
          const selected = (): boolean => index === props.selectedIndex;
          return (
            <box
              width="100%"
              onClick={() => select(index)}
              backgroundColor={selected() ? (props.selectedBackground ?? "blue") : undefined}
            >
              {props.renderItem ? (
                props.renderItem(props.items[index]!, index, selected())
              ) : (
                <Text color={selected() ? props.selectedColor : undefined}>
                  {String(props.items[index])}
                </Text>
              )}
            </box>
          );
        }}
      </For>
    </box>
  );
}
