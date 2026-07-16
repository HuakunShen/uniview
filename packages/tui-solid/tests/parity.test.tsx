import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { MemoryCellSurface, StyleTable, renderSvg } from "@uniview/tui-core";
import { createTuiReactRoot, Tree as ReactTree, type TreeNode } from "@uniview/tui-react";
import { createTuiSolidRoot } from "../src/index";
import { Tree as SolidTree } from "../src/tree";
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
