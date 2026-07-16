import { createEffect, createSignal, For, type JSX } from "solid-js";
import {
  SelectionMachine,
  computeVirtualWindow,
  cycleSort,
  formatCell,
  orderRows,
  resolveColumnWidths,
} from "@uniview/tui-core";
import type { Column, ColumnSpec, TableProps, TuiKeyEvent } from "@uniview/tui-core";
import { Box, Text } from "./primitives";

// Shared shapes from @uniview/tui-core, re-exported so tui-solid mirrors
// tui-react's surface.
export type { Column, TableProps, ColumnAlign, SortDirection, SortState } from "@uniview/tui-core";

function intrinsicWidth<T>(columns: readonly Column<T>[], gap: number): number {
  const cells = columns.reduce((sum, c) => sum + (c.width ?? c.minWidth ?? 8), 0);
  return cells + gap * Math.max(0, columns.length - 1);
}

/**
 * The Solid port of tui-react's `Table`: same controlled props, same box/text
 * output, same virtualization. Props are never destructured (that would
 * snapshot them and break fine-grained reactivity), and the windowed rows are
 * rendered with `<For>` so the reconciler has row identity.
 */
export function Table<T>(props: TableProps<T>): JSX.Element {
  const columnGap = (): number => props.columnGap ?? 1;
  const overscan = (): number => props.overscan ?? 0;
  const showHeader = (): boolean => props.showHeader ?? true;

  const order = (): number[] => {
    const sort = props.sort;
    const column = sort ? props.columns.find((c) => c.key === sort.columnKey) : undefined;
    return sort && column?.sort
      ? orderRows(props.rows, column.sort, sort.direction)
      : props.rows.map((_, i) => i);
  };

  const total = (): number =>
    typeof props.width === "number" ? props.width : intrinsicWidth(props.columns, columnGap());
  const resolved = (): ReturnType<typeof resolveColumnWidths> =>
    resolveColumnWidths(props.columns as readonly ColumnSpec[], total(), columnGap());

  const [scrollTop, setScrollTop] = createSignal(0);
  const maxScroll = (): number => Math.max(0, order().length - props.height);

  // Roving cursor, re-synced to the controlled prop inside an effect.
  const machine = new SelectionMachine({
    count: order().length,
    selectedIndex: props.selectedIndex,
    pageSize: props.height,
  });
  createEffect(() => {
    machine.setCount(order().length);
    machine.setPageSize(props.height);
    machine.setSelectedIndex(props.selectedIndex);
  });

  createEffect(() => {
    const selected = props.selectedIndex;
    const view = props.height;
    const max = maxScroll();
    setScrollTop((top) => {
      if (selected < top) return selected;
      if (selected >= top + view) return selected - view + 1;
      return Math.min(top, max);
    });
  });

  const onKeyDown = (event: TuiKeyEvent): void => {
    const effects = machine.handle({
      type: "key",
      key: event.key,
      ctrl: event.ctrl,
      alt: event.alt,
      shift: event.shift,
      meta: event.meta,
    });
    for (const effect of effects) props.onSelect(effect.index);
  };

  const window = (): ReturnType<typeof computeVirtualWindow> =>
    computeVirtualWindow({
      itemCount: order().length,
      itemHeight: 1,
      viewportHeight: props.height,
      scrollTop: scrollTop(),
      overscan: overscan(),
    });

  const visible = (): number[] => {
    const { startIndex, endIndex } = window();
    const out: number[] = [];
    for (let i = startIndex; i <= endIndex; i += 1) out.push(i);
    return out;
  };

  return (
    <Box
      onKeyDown={onKeyDown}
      role="table"
      autoFocus={props.autoFocus}
      flexDirection="column"
      width={props.width}
      height={(showHeader() ? 1 : 0) + props.height}
    >
      {showHeader() ? (
        <Box role="row" flexDirection="row" gap={columnGap()}>
          <For each={props.columns}>
            {(column, i) => {
              const arrow = (): string => {
                const sort = props.sort;
                return sort && sort.columnKey === column.key ? (sort.direction === "asc" ? " ▲" : " ▼") : "";
              };
              const sortable = (): boolean => Boolean(props.onSortChange && column.sort);
              return (
                <Text
                  role="columnheader"
                  bold
                  onClick={sortable() ? () => props.onSortChange!(cycleSort(props.sort ?? null, column.key)) : undefined}
                >
                  {formatCell(column.header + arrow(), resolved()[i()]!.width, column.align ?? "left")}
                </Text>
              );
            }}
          </For>
        </Box>
      ) : null}
      <For each={visible()}>
        {(i) => {
          const row = (): T => props.rows[order()[i]!]!;
          const selected = (): boolean => i === props.selectedIndex;
          const name = (): string | undefined => (props.rowName ? props.rowName(row(), i) : undefined);
          return (
            <Box
              role="row"
              name={name()}
              selected={selected()}
              flexDirection="row"
              gap={columnGap()}
              width="100%"
              backgroundColor={selected() ? (props.selectedBackground ?? "blue") : undefined}
              onClick={() => props.onSelect(i)}
            >
              <For each={props.columns}>
                {(column, ci) => (
                  <Text color={selected() ? props.selectedColor : column.color}>
                    {formatCell(column.accessor(row()), resolved()[ci()]!.width, column.align ?? "left")}
                  </Text>
                )}
              </For>
            </Box>
          );
        }}
      </For>
    </Box>
  );
}
