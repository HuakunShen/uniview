import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable, renderSvg, type Column } from "@uniview/tui-core";
import { createTuiReactRoot, Table as ReactTable } from "@uniview/tui-react";
import { createTuiSolidRoot } from "../src/index";
import { Table as SolidTable } from "../src/table";
import { tick } from "./tick";

interface Row {
  name: string;
  qty: number;
}
const columns: Column<Row>[] = [
  { key: "name", header: "Name", accessor: (r) => r.name, width: 8 },
  { key: "qty", header: "Qty", accessor: (r) => String(r.qty), width: 4, align: "right" },
];
const rows: Row[] = [
  { name: "Alpha", qty: 3 },
  { name: "Beta", qty: 12 },
  { name: "Gamma", qty: 7 },
];
const SIZE = { width: 13, height: 4 };

async function reactSvg(): Promise<string> {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: SIZE });
  root.render(
    h(ReactTable<Row>, { columns, rows, selectedIndex: 1, onSelect: () => {}, height: 3, width: 13, rowName: (r) => r.name }),
  );
  await tick();
  const svg = renderSvg(surface.lastFrame!, styles);
  root.destroy();
  return svg;
}

async function solidSvg(): Promise<string> {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: SIZE });
  root.render(() => {
    const [sel] = createSignal(1);
    return (
      <SolidTable columns={columns} rows={rows} selectedIndex={sel()} onSelect={() => {}} height={3} width={13} rowName={(r) => r.name} />
    );
  });
  await tick();
  const svg = renderSvg(surface.lastFrame!, styles);
  root.destroy();
  return svg;
}

describe("Table React/Solid parity", () => {
  it("renders byte-identical SVG for the same table (selected row 1)", async () => {
    const [a, b] = [await reactSvg(), await solidSvg()];
    expect(a).toBe(b); // byte-for-byte
  });
});
