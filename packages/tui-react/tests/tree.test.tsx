import { describe, expect, it } from "vitest";
import { createElement as h, useState, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiReactRoot } from "../src/index";
import { Tree, type TreeNode } from "../src/tree";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

const nodes: TreeNode[] = [
  { id: "src", label: "src", children: [{ id: "a.ts", label: "a.ts" }, { id: "b.ts", label: "b.ts" }] },
  { id: "readme", label: "readme" },
];

function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

function Harness() {
  const [selectedId, setSelectedId] = useState("src");
  const [expandedIds, setExpandedIds] = useState<readonly string[]>([]);
  return h(Tree, {
    nodes,
    selectedId,
    onSelect: setSelectedId,
    expandedIds,
    onExpandedChange: setExpandedIds,
    width: 16,
  });
}

describe("Tree", () => {
  it("shows only roots until a node is expanded", async () => {
    const { surface } = mount(h(Harness), 16, 6);
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("src");
    expect(text).toContain("readme");
    expect(text).not.toContain("a.ts"); // collapsed
  });

  it("ArrowRight expands the selected node and reveals its children", async () => {
    const { root, surface } = mount(h(Harness), 16, 6);
    await tick();
    root.dispatchInput(key("Tab")); // focus the tree (its root box carries onKeyDown)
    root.dispatchInput(key("ArrowRight"));
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("a.ts");
    expect(text).toContain("b.ts");
  });

  it("marks the selected row via the treeitem role for automation", async () => {
    const { root } = mount(h(Harness), 16, 6);
    await tick();
    const session = new AutomationSession(root.host);
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowRight")); // expand "src"
    await tick();
    root.dispatchInput(key("ArrowDown")); // select "a.ts"
    await tick();
    session.expect.node({ role: "treeitem", name: "a.ts" }, { selected: true });
    session.expect.node({ role: "treeitem", name: "src" }, { selected: false });
  });

  it("draws indent guides for descendant rows", async () => {
    const { root, surface } = mount(h(Harness), 16, 6);
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowRight")); // expand "src"
    await tick();
    const lines = surface.text({ trimRight: true }).split("\n");
    // "src" has a later sibling ("readme"), so its children carry a vertical guide + branch.
    expect(lines.some((l) => l.includes("├─a.ts"))).toBe(true);
    expect(lines.some((l) => l.includes("└─b.ts"))).toBe(true);
  });
});
