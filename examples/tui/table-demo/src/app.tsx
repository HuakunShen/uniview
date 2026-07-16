import { useState, type ReactElement } from "react";
import { Table, useInput, type Column, type SortState } from "@uniview/tui-react";

export interface AppHost {
  rerender: () => void;
  quit: () => void;
}

interface File {
  name: string;
  size: number;
  kind: string;
}
const files: File[] = [
  { name: "README.md", size: 2048, kind: "markdown" },
  { name: "index.ts", size: 512, kind: "typescript" },
  { name: "logo.png", size: 40960, kind: "image" },
  { name: "notes.txt", size: 128, kind: "text" },
];
const columns: Column<File>[] = [
  { key: "name", header: "Name", accessor: (f) => f.name, flexGrow: 1, sort: (a, b) => a.name.localeCompare(b.name) },
  { key: "size", header: "Size", accessor: (f) => `${f.size}`, width: 8, align: "right", sort: (a, b) => a.size - b.size },
  { key: "kind", header: "Kind", accessor: (f) => f.kind, width: 12 },
];

/**
 * A file-list `<Table>`: column layout, a header row, a highlighted cursor row,
 * and controlled sort. `autoFocus` takes keyboard focus on mount, so the arrow
 * keys move the cursor immediately (without it, a table is unfocused at startup
 * and arrows do nothing until you Tab or click into it). `q` quits.
 */
export function App({ host }: { host: AppHost }): ReactElement {
  const [sel, setSel] = useState(0);
  const [sort, setSort] = useState<SortState | null>(null);

  useInput((input) => {
    if (input === "q") host.quit();
  });

  return (
    <Table<File>
      columns={columns}
      rows={files}
      selectedIndex={sel}
      onSelect={setSel}
      height={4}
      width={34}
      rowName={(f) => f.name}
      sort={sort}
      onSortChange={setSort}
      autoFocus
    />
  );
}
