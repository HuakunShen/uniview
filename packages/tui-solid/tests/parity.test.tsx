import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { MemoryCellSurface, StyleTable, renderSvg, type YearMonthDay } from "@uniview/tui-core";
import { createTuiReactRoot, Tree as ReactTree, Calendar as ReactCalendar, type TreeNode } from "@uniview/tui-react";
import { createTuiSolidRoot } from "../src/index";
import { Tree as SolidTree } from "../src/tree";
import { Calendar as SolidCalendar } from "../src/calendar";
import { tick } from "./tick";

const nodes: TreeNode[] = [
  { id: "src", label: "src", children: [{ id: "a.ts", label: "a.ts" }, { id: "b.ts", label: "b.ts" }] },
  { id: "readme", label: "readme" },
];
const fixed = {
  selectedId: "a.ts",
  expandedIds: ["src"],
  onSelect: () => {},
  onExpandedChange: () => {},
  width: 20,
} as const;

async function reactSvg(): Promise<string> {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width: 20, height: 6 } });
  root.render(h(ReactTree, { nodes, ...fixed }));
  await tick();
  const svg = renderSvg(surface.lastFrame!, styles);
  root.destroy();
  return svg;
}

async function solidSvg(): Promise<string> {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width: 20, height: 6 } });
  root.render(() => <SolidTree nodes={nodes} {...fixed} />);
  await tick();
  const svg = renderSvg(surface.lastFrame!, styles);
  root.destroy();
  return svg;
}

describe("Tree parity", () => {
  it("renders byte-identical SVG in React and Solid", async () => {
    expect(await reactSvg()).toBe(await solidSvg());
  });
});

const REF: YearMonthDay = { year: 2026, month: 7, day: 16 };

describe("Calendar parity", () => {
  it("renders byte-identical SVG in React and Solid", async () => {
    const react = await (async () => {
      const styles = new StyleTable();
      const surface = new MemoryCellSurface({ styles });
      const root = createTuiReactRoot({ surface, styles, size: { width: 24, height: 10 } });
      root.render(h(ReactCalendar, { referenceDate: REF, value: REF, onChange: () => {} }));
      await tick();
      const svg = renderSvg(surface.lastFrame!, styles);
      root.destroy();
      return svg;
    })();
    const solid = await (async () => {
      const styles = new StyleTable();
      const surface = new MemoryCellSurface({ styles });
      const root = createTuiSolidRoot({ surface, styles, size: { width: 24, height: 10 } });
      root.render(() => <SolidCalendar referenceDate={REF} value={REF} onChange={() => {}} />);
      await tick();
      const svg = renderSvg(surface.lastFrame!, styles);
      root.destroy();
      return svg;
    })();
    expect(react).toBe(solid);
  });
});
