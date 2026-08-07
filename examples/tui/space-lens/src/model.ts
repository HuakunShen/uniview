import {
  scrollbarThumb,
  VirtualListMachine,
  type RenderNode,
  type Size,
  type TuiInputEvent,
} from "@uniview/tui-core";

export interface ScanRow {
  size: string;
  name: string;
  detail?: string;
}

export interface SpaceLensState {
  cursor: number;
  scrollTop: number;
}

const FIXED_HEADER_ROWS = 3;
const PANEL_CHROME_ROWS = 4; // top/bottom border + top/bottom padding

export const ROWS: readonly ScanRow[] = Array.from(
  { length: 186 },
  (_, index) => {
    if (index === 0) return { size: "1.5 GiB", name: "." };
    if (index === 1) return { size: "4.0 KiB", name: "skills-lock.json" };
    if (index === 2) return { size: "224.0 KiB", name: "apps" };
    if (index === 3) return { size: "20.0 KiB", name: "  cli" };
    if (index === 4) return { size: "12.0 KiB", name: "  src" };
    if (index === 5) return { size: "8.0 KiB", name: "    main.rs" };
    if (index === 6) return { size: "4.0 KiB", name: "  Cargo.toml" };
    if (index === 7) return { size: "136.0 KiB", name: "  tui" };
    if (index === 8)
      return { size: "44.0 KiB", name: "dist [ignored] [collapsed]" };
    return {
      size: `${((index * 13) % 96) + 4}.0 KiB`,
      name: `row-${index.toString().padStart(3, "0")}`,
      detail: index % 11 === 0 ? "[ignored]" : undefined,
    };
  },
);

export function viewportHeight(size: Size): number {
  return Math.max(1, size.height - FIXED_HEADER_ROWS - PANEL_CHROME_ROWS);
}

export function createInitialState(): SpaceLensState {
  return { cursor: 0, scrollTop: 0 };
}

function eventKey(event: TuiInputEvent): string | null {
  if (event.type === "key") return event.key;
  if (event.type === "text") return event.text;
  return null;
}

export function reduce(
  state: SpaceLensState,
  event: TuiInputEvent,
  height: number,
): SpaceLensState {
  const machine = new VirtualListMachine({
    itemCount: ROWS.length,
    itemHeight: 1,
    viewportHeight: height,
    scrollTop: state.scrollTop,
  });
  machine.setItemCount(ROWS.length);

  const key = eventKey(event);
  let cursor = state.cursor;
  if (event.type === "resize") {
    machine.setViewportHeight(height);
  } else if (key === "j" || key === "ArrowDown") {
    cursor = Math.min(ROWS.length - 1, cursor + 1);
  } else if (key === "k" || key === "ArrowUp") {
    cursor = Math.max(0, cursor - 1);
  } else if (key === "PageDown") {
    machine.scrollBy(height);
    cursor = Math.min(ROWS.length - 1, cursor + height);
  } else if (key === "PageUp") {
    machine.scrollBy(-height);
    cursor = Math.max(0, cursor - height);
  } else if (key === "Home") {
    cursor = 0;
    machine.scrollTo(0);
  } else if (key === "End") {
    cursor = ROWS.length - 1;
    machine.scrollTo(machine.maxScroll);
  } else {
    return state;
  }

  machine.ensureVisible(cursor);
  return { cursor, scrollTop: machine.scrollTop };
}

function rowNode(row: ScanRow, selected: boolean): RenderNode {
  return {
    type: "text",
    text: `${selected ? ">" : " "} ${row.size.padStart(18)}  ${row.name}${row.detail ? ` ${row.detail}` : ""}`,
    textStyle: selected ? { fg: "cyan", bold: true } : { fg: "white" },
  };
}

function scrollbarNode(height: number, scrollTop: number): RenderNode {
  const { start, thumb } = scrollbarThumb(ROWS.length, height, scrollTop);
  return {
    type: "box",
    style: { width: 1, flexShrink: 0, alignSelf: "stretch" },
    children: Array.from({ length: height }, (_, index) => ({
      type: "text" as const,
      text: index >= start && index < start + thumb ? "█" : "│",
      textStyle: {
        fg: index >= start && index < start + thumb ? "cyan" : "gray",
      },
    })),
  };
}

export function view(state: SpaceLensState, size: Size): RenderNode {
  const height = viewportHeight(size);
  return {
    type: "box",
    style: { flexDirection: "column" },
    children: [
      {
        type: "text",
        text: "Space Lens | SCAN | tab switch | j/k move | q quit",
        textStyle: { fg: "cyan", bold: true },
      },
      {
        type: "text",
        text: `${ROWS.length} nodes | 1.5 GiB (1607888896 bytes) | tree view`,
        textStyle: { fg: "white" },
      },
      {
        type: "text",
        text: "Scan mode shows disk tree. Clean mode lets you select candidates.",
        textStyle: { fg: "gray" },
      },
      {
        type: "box",
        title: "scan tree",
        style: {
          flexGrow: 1,
          flexShrink: 1,
          minHeight: 0,
          flexDirection: "row",
          gap: 1,
          padding: 1,
          border: "rounded",
        },
        children: [
          {
            type: "box",
            style: {
              flexGrow: 1,
              flexShrink: 1,
              overflow: "scroll",
              scrollTop: state.scrollTop,
            },
            children: ROWS.map((row, index) =>
              rowNode(row, index === state.cursor),
            ),
          },
          scrollbarNode(height, state.scrollTop),
        ],
      },
    ],
  };
}
