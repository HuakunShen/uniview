import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable, type Column, type SortState, type TuiInputEvent } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiSolidRoot } from "../src/index";
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

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

describe("Table (solid)", () => {
  it("renders a header and the rows", async () => {
    const { root, surface } = mount(() => {
      const [sel, setSel] = createSignal(0);
      return (
        <Table columns={columns} rows={people} selectedIndex={sel()} onSelect={setSel} height={3} width={13} rowName={(r) => r.name} />
      );
    }, 13, 4);
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("Name");
    expect(text).toContain("Alice");
    expect(text).toContain("Charlie");
    root.destroy();
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
    const { root, surface } = mount(() => {
      const [sel, setSel] = createSignal(0);
      return <Table columns={cols} rows={many} selectedIndex={sel()} onSelect={setSel} height={4} width={8} />;
    }, 8, 5);
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("P0");
    expect(text).not.toContain("P500");
    expect(accessorCalls).toBeLessThanOrEqual(4 + 8);
    root.destroy();
  });

  it("moves the cursor with the keyboard, asserted via AutomationSession", async () => {
    const { root } = mount(() => {
      const [sel, setSel] = createSignal(0);
      return <Table columns={columns} rows={people} selectedIndex={sel()} onSelect={setSel} height={3} width={13} rowName={(r) => r.name} />;
    }, 13, 4);
    const session = new AutomationSession(root.host);
    await tick();

    session.expect.node({ role: "row", name: "Alice" }, { selected: true });
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowDown"));
    await tick();
    root.dispatchInput(key("ArrowDown"));
    await tick();
    session.expect.node({ role: "row", name: "Charlie" }, { selected: true });
    session.expect.node({ role: "row", name: "Alice" }, { selected: false });
    root.destroy();
  });

  it("sorts when a controlled sort is applied", async () => {
    const { root, surface } = mount(() => {
      const [sel, setSel] = createSignal(0);
      const [sort, setSort] = createSignal<SortState | null>({ columnKey: "age", direction: "asc" });
      return (
        <Table columns={columns} rows={people} selectedIndex={sel()} onSelect={setSel} height={3} width={13} rowName={(r) => r.name} sort={sort()} onSortChange={setSort} />
      );
    }, 13, 4);
    await tick();
    const bodyLines = surface.text({ trimRight: true }).split("\n").slice(1);
    expect(bodyLines[0]).toContain("Bob");
    expect(bodyLines[2]).toContain("Charlie");
    root.destroy();
  });
});
