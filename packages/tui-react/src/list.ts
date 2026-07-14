import { createElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { Color, Dimension } from "@uniview/tui-core";
import type { TuiKeyEvent } from "./primitives";

export interface ListProps<T> {
  items: readonly T[];
  /** Controlled selection index. */
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Render a row. Defaults to `String(item)` in a `<text>`. */
  renderItem?: (item: T, index: number, selected: boolean) => ReactNode;
  /** Viewport height in rows. Defaults to the item count (no scrolling). */
  height?: number;
  width?: Dimension;
  /** Full-row highlight color for the selected row. Defaults to `"blue"`. */
  selectedBackground?: Color;
  /** Text color of the selected row. */
  selectedColor?: Color;
}

/** "N of M" position label (1-based), or "0 of 0" when empty. */
export function listCounter(selectedIndex: number, total: number): string {
  if (total <= 0) return "0 of 0";
  return `${Math.min(selectedIndex + 1, total)} of ${total}`;
}

/**
 * A scrollable, selectable list — the lazygit branch/commit list primitive.
 * Controlled (`selectedIndex`/`onSelect`); the full row highlights, arrow
 * keys/Home/End/PageUp/PageDown move the selection, clicking a row selects
 * it, and the viewport scrolls to keep the selection visible.
 */
export function List<T>(props: ListProps<T>): ReactElement {
  const { items, selectedIndex, onSelect, renderItem, width, selectedBackground = "blue", selectedColor } = props;
  const viewport = props.height ?? items.length;
  const maxScroll = Math.max(0, items.length - viewport);
  const [scrollTop, setScrollTop] = useState(0);

  // `selectedIndex` is externally controlled: onSelect(next) only becomes the
  // new prop value once the consumer re-renders us. Back-to-back key events
  // dispatched before that commit (e.g. two ArrowDowns fired synchronously)
  // would otherwise both read the same stale `selectedIndex` and collapse
  // into a single step. This ref tracks the last *requested* index so
  // consecutive synchronous key events compose correctly; it re-syncs to the
  // prop whenever a render actually lands (including externally-driven
  // changes like a mouse click).
  const requestedRef = useRef(selectedIndex);
  useEffect(() => {
    requestedRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    setScrollTop((s) => {
      if (selectedIndex < s) return selectedIndex;
      if (selectedIndex >= s + viewport) return selectedIndex - viewport + 1;
      return Math.min(s, maxScroll);
    });
  }, [selectedIndex, viewport, maxScroll]);

  const onKeyDown = (event: TuiKeyEvent): void => {
    const last = items.length - 1;
    if (last < 0) return;
    const current = requestedRef.current;
    let next: number | undefined;
    if (event.key === "ArrowDown") next = Math.min(current + 1, last);
    else if (event.key === "ArrowUp") next = Math.max(current - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === "PageDown") next = Math.min(current + viewport, last);
    else if (event.key === "PageUp") next = Math.max(current - viewport, 0);
    if (next === undefined) return;
    requestedRef.current = next;
    onSelect(next);
  };

  const rows: ReactNode[] = [];
  const end = Math.min(items.length, scrollTop + viewport);
  for (let i = scrollTop; i < end; i += 1) {
    const selected = i === selectedIndex;
    const index = i;
    const content = renderItem
      ? renderItem(items[i]!, i, selected)
      : createElement("text", { color: selected ? selectedColor : undefined }, String(items[i]));
    rows.push(
      createElement(
        "box",
        {
          key: i,
          width: "100%",
          onClick: () => onSelect(index),
          backgroundColor: selected ? selectedBackground : undefined,
        },
        content,
      ),
    );
  }

  return createElement("box", { onKeyDown, flexDirection: "column", height: viewport, width }, ...rows);
}
