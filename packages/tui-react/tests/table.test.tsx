import { describe, expect, it } from "vitest";
import { createElement as h, useState, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable, type Column, type SortState, type TuiInputEvent } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiReactRoot } from "../src/index";
import { Table } from "../src/table";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

interface Person {
  name: string;
  age: number;
}
const columns: Column<Person>[] = [
  { key: "name", header: "Name", accessor: (r) => r.name, width: 8, sort: (a, b) => a.name.localeCompare(b.name) },
  { key: "age", header: "Age", accessor: (r) => String(r.age), width: 4, align: "right", sort: (a, b) => a.age - b.age },
];
const people: Person[] = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
  { name: "Charlie", age: 40 },
];

function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

function Harness({ rows, height }: { rows: Person[]; height: number }) {
  const [sel, setSel] = useState(0);
  return h(Table<Person>, {
    columns,
    rows,
    selectedIndex: sel,
    onSelect: setSel,
    height,
    width: 13,
    rowName: (r) => r.name,
  });
}

describe("Table", () => {
  it("renders a header and the rows", async () => {
    const { surface } = mount(h(Harness, { rows: people, height: 3 }), 13, 4);
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("Name");
    expect(text).toContain("Age");
    expect(text).toContain("Alice");
    expect(text).toContain("Charlie");
  });

  it("virtualizes: a 1000-row table paints only the visible window", async () => {
    let accessorCalls = 0;
    const many: Person[] = Array.from({ length: 1000 }, (_, i) => ({ name: `P${i}`, age: i }));
    const cols: Column<Person>[] = [
      {
        key: "name",
        header: "Name",
        accessor: (r) => {
          accessorCalls += 1;
          return r.name;
        },
        width: 8,
      },
    ];
    function Big() {
      const [sel, setSel] = useState(0);
      return h(Table<Person>, { columns: cols, rows: many, selectedIndex: sel, onSelect: setSel, height: 4, width: 8 });
    }
    const { surface } = mount(h(Big), 8, 5);
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("P0");
    expect(text).toContain("P3");
    expect(text).not.toContain("P500"); // far outside the viewport
    // 4 visible rows × 1 column, no overscan — proves it did NOT touch all 1000
    expect(accessorCalls).toBeLessThanOrEqual(4 * columns.length + 8);
  });

  it("moves the cursor with the keyboard, asserted via AutomationSession", async () => {
    const { root } = mount(h(Harness, { rows: people, height: 3 }), 13, 4);
    const session = new AutomationSession(root.host);
    await tick();

    // Row 0 (Alice) starts selected.
    session.expect.node({ role: "row", name: "Alice" }, { selected: true });

    root.dispatchInput(key("Tab")); // focus the table (its root box has onKeyDown)
    root.dispatchInput(key("ArrowDown"));
    await tick();
    root.dispatchInput(key("ArrowDown"));
    await tick();

    // Cursor is now on Charlie; Alice is no longer selected.
    session.expect.node({ role: "row", name: "Charlie" }, { selected: true });
    session.expect.node({ role: "row", name: "Alice" }, { selected: false });
    root.destroy();
  });

  it("sorts when a controlled sort is applied", async () => {
    function Sorted() {
      const [sel, setSel] = useState(0);
      const [sort, setSort] = useState<SortState | null>({ columnKey: "age", direction: "asc" });
      return h(Table<Person>, {
        columns,
        rows: people,
        selectedIndex: sel,
        onSelect: setSel,
        height: 3,
        width: 13,
        rowName: (r) => r.name,
        sort,
        onSortChange: setSort,
      });
    }
    const { surface } = mount(h(Sorted), 13, 4);
    await tick();
    // Ascending by age ⇒ Bob(25), Alice(30), Charlie(40): first body line is Bob.
    const bodyLines = surface.text({ trimRight: true }).split("\n").slice(1); // drop header
    expect(bodyLines[0]).toContain("Bob");
    expect(bodyLines[2]).toContain("Charlie");
  });
});
