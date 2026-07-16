import { createElement as h, useMemo, useState, type ReactElement } from "react";
import { Box, Scrollbar, StatusBar, Table, Text, useInput, type Column } from "@uniview/tui-react";
import { compileQuery, naturalCompare, type CsvData } from "./csv";

export interface AppHost {
  quit: () => void;
}

type Mode = "normal" | "search" | "filter";
type SortDir = "asc" | "desc";
interface Sort {
  col: number;
  dir: SortDir;
}

/** A CSV row paired with its original file line (1-based, for the status bar). */
interface Indexed {
  cells: string[];
  line: number;
}

/**
 * `less` for CSV — a virtualized pager over a `<Table>`, modelled on ratatui
 * `csvlens`. Reuses the framework Table nearly as-is: virtualized rows, column
 * layout, and a cursor. Sorting, regex find (`/`, `n`/`N`) and a regex row
 * filter (`&`) are app code on top. Phase-1 scope from the research doc — the
 * four deeper Table gaps (horizontal column scroll, freezing, cell selection,
 * in-cell wrapping) are intentionally out of scope here.
 *
 *   ↑/↓ PgUp/PgDn Home/End : move · ←/→ : pick sort column · s : sort
 *   / : find · n/N : next/prev match · & : filter rows · Esc : clear · q : quit
 */
export function App({
  data,
  name,
  cols,
  rows,
  host,
}: {
  data: CsvData;
  name: string;
  cols: number;
  rows: number;
  host: AppHost;
}): ReactElement {
  const [cursor, setCursor] = useState(0);
  const [sortCol, setSortCol] = useState(0);
  const [sort, setSort] = useState<Sort | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("normal");
  const [buffer, setBuffer] = useState("");

  // Which columns are numeric (all non-empty cells parse as numbers)?
  const numeric = useMemo(
    () => data.header.map((_, i) => data.rows.length > 0 && data.rows.every((r) => r[i] === "" || !Number.isNaN(Number(r[i])))),
    [data],
  );

  // filter → sort. Both app-side, so the Table just renders the final order and
  // `cursor` indexes the displayed array directly.
  const view = useMemo<Indexed[]>(() => {
    const pred = compileQuery(filter);
    let out: Indexed[] = data.rows
      .map((cells, i) => ({ cells, line: i + 2 })) // +2: 1-based + header line
      .filter((r) => filter === "" || r.cells.some((c) => pred(c)));
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const num = numeric[sort.col];
      out = out.slice().sort((a, b) => {
        const av = a.cells[sort.col] ?? "";
        const bv = b.cells[sort.col] ?? "";
        const cmp = num ? (Number(av) || 0) - (Number(bv) || 0) : naturalCompare(av, bv);
        return cmp * dir;
      });
    }
    return out;
  }, [data, filter, sort, numeric]);

  // Search matches: display-row indices where any cell matches the query.
  const matches = useMemo<number[]>(() => {
    if (search === "") return [];
    const pred = compileQuery(search);
    const out: number[] = [];
    view.forEach((r, i) => {
      if (r.cells.some((c) => pred(c))) out.push(i);
    });
    return out;
  }, [view, search]);

  const clampedCursor = Math.max(0, Math.min(cursor, view.length - 1));

  const jump = (dir: 1 | -1): void => {
    if (matches.length === 0) return;
    // Next/prev match relative to the cursor, wrapping around.
    const ahead = matches.filter((m) => (dir === 1 ? m > clampedCursor : m < clampedCursor));
    const target = ahead.length ? (dir === 1 ? ahead[0]! : ahead[ahead.length - 1]!) : dir === 1 ? matches[0]! : matches[matches.length - 1]!;
    setCursor(target);
  };

  const bodyHeight = Math.max(3, rows - 3); // header row + status + prompt
  const tableHeight = bodyHeight - 1; // Table.height excludes its own header

  useInput((input, k) => {
    if (mode !== "normal") {
      if (k.return) {
        if (mode === "search") {
          setSearch(buffer);
          setCursor(0);
        } else {
          setFilter(buffer);
          setCursor(0);
        }
        setMode("normal");
      } else if (k.escape) {
        setMode("normal");
      } else if (k.backspace) {
        setBuffer((b) => b.slice(0, -1));
      } else if (input && !k.tab) {
        setBuffer((b) => b + input);
      }
      return;
    }

    if (input === "q") host.quit();
    else if (input === "/") {
      setMode("search");
      setBuffer("");
    } else if (input === "&") {
      setMode("filter");
      setBuffer("");
    } else if (input === "s") {
      setSort((s) =>
        s?.col !== sortCol ? { col: sortCol, dir: "asc" } : s.dir === "asc" ? { col: sortCol, dir: "desc" } : null,
      );
    } else if (input === "n") jump(1);
    else if (input === "N") jump(-1);
    else if (k.escape) {
      setSearch("");
      setFilter("");
    } else if (k.upArrow) setCursor((c) => Math.max(0, c - 1));
    else if (k.downArrow) setCursor((c) => Math.min(view.length - 1, c + 1));
    else if (k.pageUp) setCursor((c) => Math.max(0, c - tableHeight));
    else if (k.pageDown) setCursor((c) => Math.min(view.length - 1, c + tableHeight));
    else if (k.leftArrow) setSortCol((c) => Math.max(0, c - 1));
    else if (k.rightArrow) setSortCol((c) => Math.min(data.header.length - 1, c + 1));
  });

  // Rebuild columns each render so the header carries the sort arrow + the
  // current-column cursor marker (in-cell rich styling is a deferred Table gap).
  const columns: Column<Indexed>[] = data.header.map((title, i) => {
    let header = title;
    if (sort?.col === i) header += sort.dir === "asc" ? " ▲" : " ▼";
    if (i === sortCol) header = `▸${header}`;
    return {
      key: String(i),
      header,
      accessor: (r: Indexed) => r.cells[i] ?? "",
      align: numeric[i] ? "right" : "left",
      minWidth: 6,
      flexGrow: 1,
    };
  });

  const scrollTop = Math.max(0, Math.min(clampedCursor - Math.floor(tableHeight / 2), Math.max(0, view.length - tableHeight)));
  const tableWidth = Math.max(10, cols - 1); // leave a column for the scrollbar

  const promptLine =
    mode === "search"
      ? `/${buffer}`
      : mode === "filter"
        ? `&${buffer}`
        : search || filter
          ? [search && `search:/${search}/ ${matches.length} match${matches.length === 1 ? "" : "es"}`, filter && `filter:/${filter}/`]
              .filter(Boolean)
              .join("   ")
          : "/ find · & filter · s sort · ←/→ pick column";

  return h(
    Box,
    { flexDirection: "column", width: "100%", height: "100%" },
    h(
      Box,
      { flexDirection: "row", flexGrow: 1 },
      h(Table<Indexed>, {
        columns,
        rows: view,
        selectedIndex: clampedCursor,
        onSelect: setCursor,
        height: tableHeight,
        width: tableWidth,
        sort: null,
      }),
      h(Scrollbar, { total: Math.max(view.length, 1), height: tableHeight + 1, value: scrollTop }),
    ),
    h(Text, { color: mode === "normal" ? "gray" : "yellow" }, ` ${promptLine}`),
    h(StatusBar, {
      height: 1,
      items: [
        { label: name, keyHint: `${view.length}${filter ? `/${data.rows.length}` : ""} rows` },
        { label: "row", keyHint: `${view.length ? clampedCursor + 1 : 0}` },
        { label: "quit", keyHint: "q" },
      ],
    }),
  );
}
