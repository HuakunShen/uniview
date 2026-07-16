import { graphemesOf, unicodeWidth } from "../text/graphemes";
import type { Color } from "../style/style-table";
import type { Dimension } from "../style/tui-style";

export type ColumnAlign = "left" | "right" | "center";
export type SortDirection = "asc" | "desc";
export interface SortState {
  columnKey: string;
  direction: SortDirection;
}

export interface ColumnSpec {
  /** Fixed cell width; omit to flex into leftover space. */
  width?: number;
  /** Lower bound after flex distribution. */
  minWidth?: number;
  /** Share of leftover width; defaults to 1 when `width` is omitted, else 0. */
  flexGrow?: number;
  align?: ColumnAlign;
}

export interface ResolvedColumn {
  width: number;
  align: ColumnAlign;
}

export interface Column<T> extends ColumnSpec {
  /** Stable id; also the sort key. */
  key: string;
  header: string;
  accessor: (row: T) => string;
  /** Per-column foreground (a row's `selectedColor` overrides it). */
  color?: Color;
  /** A comparator makes the column sortable. */
  sort?: (a: T, b: T) => number;
}

export interface TableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[];
  /** Controlled cursor index, in the current (possibly sorted) display order. */
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Body viewport height in rows (excludes the header) — enables virtualization. */
  height: number;
  /** Total width in cells; defaults to the columns' summed widths + gaps. */
  width?: Dimension;
  /** Cells between columns. Default 1. */
  columnGap?: number;
  /** Rows rendered beyond the viewport on each side. Default 0. */
  overscan?: number;
  /** Render the header row. Default true. */
  showHeader?: boolean;
  /** Full-row highlight for the cursor row. Default "blue" (mirrors List). */
  selectedBackground?: Color;
  /** Foreground for the cursor row. */
  selectedColor?: Color;
  /** Accessible name per row, for automation queries. */
  rowName?: (row: T, index: number) => string;
  /** Controlled sort; header click cycles it via `onSortChange`. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /**
   * Take initial keyboard focus on mount, so the arrow keys move the cursor
   * without a preceding Tab. Off by default (a table is not focused until the
   * user Tabs or clicks into it).
   */
  autoFocus?: boolean;
}

/** Display width of a string in terminal cells (a wide glyph counts as 2). */
function cellWidth(text: string): number {
  let w = 0;
  for (const g of graphemesOf(text)) w += unicodeWidth(g);
  return w;
}

/**
 * Distribute `totalWidth` across columns: fixed widths are kept, leftover is
 * split among `flexGrow` columns (a width-less column defaults to grow 1), and
 * every column is clamped up to its `minWidth`. The remainder from integer
 * division goes to the earliest growing columns so the result is deterministic
 * — which is what keeps the React and Solid renders byte-identical.
 */
export function resolveColumnWidths(
  columns: readonly ColumnSpec[],
  totalWidth: number,
  gap = 1,
): ResolvedColumn[] {
  const n = columns.length;
  if (n === 0) return [];

  const base = columns.map((c) => c.width ?? c.minWidth ?? 0);
  const grow = columns.map((c) => c.flexGrow ?? (c.width === undefined ? 1 : 0));
  const gaps = gap * (n - 1);
  const totalGrow = grow.reduce((a, b) => a + b, 0);
  const leftover = Math.max(0, totalWidth - base.reduce((a, b) => a + b, 0) - gaps);

  const widths = base.slice();
  if (leftover > 0 && totalGrow > 0) {
    let distributed = 0;
    for (let i = 0; i < n; i += 1) {
      if (grow[i]! > 0) {
        const add = Math.floor((leftover * grow[i]!) / totalGrow);
        widths[i] += add;
        distributed += add;
      }
    }
    let remainder = leftover - distributed;
    for (let i = 0; i < n && remainder > 0; i += 1) {
      if (grow[i]! > 0) {
        widths[i] += 1;
        remainder -= 1;
      }
    }
  }

  return columns.map((c, i) => ({
    width: Math.max(widths[i]!, c.minWidth ?? 0),
    align: c.align ?? "left",
  }));
}

/** Truncate to at most `width` cells, appending "…" when the text overflows. */
function truncateToWidth(text: string, width: number): string {
  if (cellWidth(text) <= width) return text;
  if (width <= 0) return "";
  const budget = width - 1; // reserve one cell for the ellipsis
  let out = "";
  let w = 0;
  for (const g of graphemesOf(text)) {
    const gw = unicodeWidth(g);
    if (w + gw > budget) break;
    out += g;
    w += gw;
  }
  return out + "…";
}

/** Pad/truncate `text` to exactly `width` display cells with the given alignment. */
export function formatCell(text: string, width: number, align: ColumnAlign = "left"): string {
  if (width <= 0) return "";
  const clipped = truncateToWidth(text, width);
  const pad = width - cellWidth(clipped);
  if (pad <= 0) return clipped;
  if (align === "right") return " ".repeat(pad) + clipped;
  if (align === "center") {
    const left = Math.floor(pad / 2);
    return " ".repeat(left) + clipped + " ".repeat(pad - left);
  }
  return clipped + " ".repeat(pad);
}

/** asc → desc → cleared for the same column; a different column starts at asc. */
export function cycleSort(current: SortState | null, columnKey: string): SortState | null {
  if (!current || current.columnKey !== columnKey) return { columnKey, direction: "asc" };
  if (current.direction === "asc") return { columnKey, direction: "desc" };
  return null;
}

/** A stable index permutation of `rows`; identity when there is no comparator. */
export function orderRows<T>(
  rows: readonly T[],
  compare: ((a: T, b: T) => number) | undefined,
  direction: SortDirection,
): number[] {
  const indices = rows.map((_, i) => i);
  if (!compare) return indices;
  const sign = direction === "asc" ? 1 : -1;
  return indices.sort((a, b) => {
    const c = compare(rows[a]!, rows[b]!) * sign;
    return c !== 0 ? c : a - b; // tiebreak by original index → deterministic
  });
}
