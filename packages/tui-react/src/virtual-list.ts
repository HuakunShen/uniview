import { createElement as h, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { computeVirtualWindow } from "@uniview/tui-core";

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Viewport height in rows. */
  height: number;
  /** Rows per item (uniform). Defaults to 1. */
  itemHeight?: number;
  /** Items rendered beyond the viewport on each side. Defaults to 0. */
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
}

interface KeyPayload {
  key: string;
}

/**
 * A keyboard-scrollable virtualized list: only the visible (+overscan) items
 * are rendered, no matter how many `items` there are. Focus it (Tab) and use
 * Up/Down to scroll — the plan's Phase 10 virtualization applied through the
 * host's onKeyDown routing. Scroll state is local to the widget.
 */
export function VirtualList<T>(props: VirtualListProps<T>): ReactElement {
  const itemHeight = props.itemHeight ?? 1;
  const [scrollTop, setScrollTop] = useState(0);
  const maxScroll = Math.max(0, props.items.length * itemHeight - props.height);

  const window = computeVirtualWindow({
    itemCount: props.items.length,
    itemHeight,
    viewportHeight: props.height,
    scrollTop,
    overscan: props.overscan,
  });

  const onKeyDown = (event: KeyPayload): void => {
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      const step = event.key === "PageDown" ? props.height : itemHeight;
      setScrollTop((s) => Math.min(s + step, maxScroll));
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      const step = event.key === "PageUp" ? props.height : itemHeight;
      setScrollTop((s) => Math.max(0, s - step));
    }
  };

  const children: ReactNode[] = [];
  for (let index = window.startIndex; index <= window.endIndex; index += 1) {
    children.push(props.renderItem(props.items[index]!, index));
  }

  return h(
    "box",
    { onKeyDown, flexDirection: "column", height: props.height },
    ...children,
  );
}
