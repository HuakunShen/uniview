import { createMemo, createSignal, For, type JSX } from "solid-js";
import { computeVirtualWindow } from "@uniview/tui-core";

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Viewport height in rows. */
  height: number;
  /** Rows per item (uniform). Defaults to 1. */
  itemHeight?: number;
  /** Items rendered beyond the viewport on each side. Defaults to 0. */
  overscan?: number;
  renderItem: (item: T, index: number) => JSX.Element;
}

interface KeyPayload {
  key: string;
}

/**
 * A keyboard-scrollable virtualized list: only the visible (+overscan) items
 * are rendered, no matter how many `items` there are. Focus it (Tab) and use
 * Up/Down to scroll. Scroll state is local to the widget.
 */
export function VirtualList<T>(props: VirtualListProps<T>): JSX.Element {
  const itemHeight = (): number => props.itemHeight ?? 1;
  const [scrollTop, setScrollTop] = createSignal(0);
  const maxScroll = createMemo(() =>
    Math.max(0, props.items.length * itemHeight() - props.height),
  );

  const window = createMemo(() =>
    computeVirtualWindow({
      itemCount: props.items.length,
      itemHeight: itemHeight(),
      viewportHeight: props.height,
      scrollTop: scrollTop(),
      overscan: props.overscan,
    }),
  );

  const onKeyDown = (event: KeyPayload): void => {
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      const step = event.key === "PageDown" ? props.height : itemHeight();
      setScrollTop((s) => Math.min(s + step, maxScroll()));
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      const step = event.key === "PageUp" ? props.height : itemHeight();
      setScrollTop((s) => Math.max(0, s - step));
    }
  };

  /**
   * The visible slice, paired with each item's absolute index. `<For>` (rather
   * than a plain `.map`) is what gives the reconciler row identity — Solid has
   * no `key` prop to fall back on.
   */
  const visible = createMemo(() => {
    const { startIndex, endIndex } = window();
    const out: { item: T; index: number }[] = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
      const item = props.items[index];
      if (item !== undefined) out.push({ item, index });
    }
    return out;
  });

  return (
    <box onKeyDown={onKeyDown} flexDirection="column" height={props.height}>
      <For each={visible()}>{(row) => props.renderItem(row.item, row.index)}</For>
    </box>
  );
}
