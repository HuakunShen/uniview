import { createElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  SelectionMachine,
  computeVirtualWindow,
  cycleSort,
  formatCell,
  orderRows,
  resolveColumnWidths,
} from "@uniview/tui-core";
import type { Column, ColumnSpec, TableProps } from "@uniview/tui-core";
import type { TuiKeyEvent } from "./primitives";

// The row/column shapes live in @uniview/tui-core so React and Solid cannot
// drift; re-exported here so tui-react's public API is self-contained.
export type { Column, TableProps, ColumnAlign, SortDirection, SortState } from "@uniview/tui-core";

/** Total content width when the caller did not pin one: summed column widths + gaps. */
function intrinsicWidth<T>(columns: readonly Column<T>[], gap: number): number {
  const cells = columns.reduce((sum, c) => sum + (c.width ?? c.minWidth ?? 8), 0);
  return cells + gap * Math.max(0, columns.length - 1);
}

/**
 * A controlled, virtualized, selectable data table built from box/text. The
 * cursor is a shared {@link SelectionMachine}; rows are windowed with
 * {@link computeVirtualWindow} so only the visible slice paints, however many
 * rows there are; columns are laid out and formatted by the tui-core helpers.
 * Optional controlled column sort (`sort`/`onSortChange`) reorders rows;
 * clicking a sortable header cycles it. Arrow/Home/End/PageUp/PageDown move the
 * cursor and the viewport follows it.
 */
export function Table<T>(props: TableProps<T>): ReactElement {
  const {
    columns,
    rows,
    selectedIndex,
    onSelect,
    height,
    width,
    columnGap = 1,
    overscan = 0,
    showHeader = true,
    selectedBackground = "blue",
    selectedColor,
    rowName,
    sort = null,
    onSortChange,
  } = props;

  // Sort order: a permutation of row indices in the current display order.
  const activeColumn = sort ? columns.find((c) => c.key === sort.columnKey) : undefined;
  const order =
    sort && activeColumn?.sort ? orderRows(rows, activeColumn.sort, sort.direction) : rows.map((_, i) => i);

  const total = typeof width === "number" ? width : intrinsicWidth(columns, columnGap);
  const resolved = resolveColumnWidths(columns as readonly ColumnSpec[], total, columnGap);

  const [scrollTop, setScrollTop] = useState(0);
  const maxScroll = Math.max(0, order.length - height);

  // Roving cursor. Re-synced to the controlled prop AFTER commit (in an effect,
  // like List) so back-to-back synchronous keys compose before the prop lands.
  const machineRef = useRef<SelectionMachine | null>(null);
  const machine = (machineRef.current ??= new SelectionMachine({
    count: order.length,
    selectedIndex,
    pageSize: height,
  }));
  useEffect(() => {
    machine.setCount(order.length);
    machine.setPageSize(height);
    machine.setSelectedIndex(selectedIndex);
  }, [machine, order.length, height, selectedIndex]);

  // Keep the cursor inside the viewport (List's clamp).
  useEffect(() => {
    setScrollTop((s) => {
      if (selectedIndex < s) return selectedIndex;
      if (selectedIndex >= s + height) return selectedIndex - height + 1;
      return Math.min(s, maxScroll);
    });
  }, [selectedIndex, height, maxScroll]);

  const onKeyDown = (event: TuiKeyEvent): void => {
    const effects = machine.handle({
      type: "key",
      key: event.key,
      ctrl: event.ctrl,
      alt: event.alt,
      shift: event.shift,
      meta: event.meta,
    });
    for (const effect of effects) onSelect(effect.index);
  };

  const out: ReactNode[] = [];

  if (showHeader) {
    const headerCells = columns.map((column, i) => {
      const arrow = sort && sort.columnKey === column.key ? (sort.direction === "asc" ? " ▲" : " ▼") : "";
      const label = formatCell(column.header + arrow, resolved[i]!.width, column.align ?? "left");
      const sortable = Boolean(onSortChange && column.sort);
      return createElement(
        "text",
        {
          key: column.key,
          role: "columnheader",
          bold: true,
          onClick: sortable ? () => onSortChange!(cycleSort(sort, column.key)) : undefined,
        },
        label,
      );
    });
    out.push(
      createElement("box", { key: "__header", role: "row", flexDirection: "row", gap: columnGap }, ...headerCells),
    );
  }

  const window = computeVirtualWindow({
    itemCount: order.length,
    itemHeight: 1,
    viewportHeight: height,
    scrollTop,
    overscan,
  });
  for (let i = window.startIndex; i <= window.endIndex; i += 1) {
    const displayIndex = i;
    const row = rows[order[i]!]!;
    const selected = i === selectedIndex;
    const cells = columns.map((column, ci) =>
      createElement(
        "text",
        { key: column.key, color: selected ? selectedColor : column.color },
        formatCell(column.accessor(row), resolved[ci]!.width, column.align ?? "left"),
      ),
    );
    const name = rowName ? rowName(row, displayIndex) : undefined;
    out.push(
      createElement(
        "box",
        {
          key: name ?? displayIndex,
          role: "row",
          name,
          selected,
          flexDirection: "row",
          gap: columnGap,
          width: "100%",
          backgroundColor: selected ? selectedBackground : undefined,
          onClick: () => onSelect(displayIndex),
        },
        ...cells,
      ),
    );
  }

  return createElement(
    "box",
    { onKeyDown, role: "table", flexDirection: "column", width, height: (showHeader ? 1 : 0) + height },
    ...out,
  );
}
