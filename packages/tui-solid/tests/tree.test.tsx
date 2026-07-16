import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiSolidRoot } from "../src/index";
import { Tree, type TreeNode } from "../src/tree";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

const nodes: TreeNode[] = [
  { id: "src", label: "src", children: [{ id: "a.ts", label: "a.ts" }, { id: "b.ts", label: "b.ts" }] },
  { id: "readme", label: "readme" },
];

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

describe("Tree (solid)", () => {
  it("expands with ArrowRight and marks the treeitem selected", async () => {
    const [selectedId, setSelectedId] = createSignal("src");
    const [expandedIds, setExpandedIds] = createSignal<readonly string[]>([]);
    const { root, surface } = mount(
      () => (
        <Tree
          nodes={nodes}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          expandedIds={expandedIds()}
          onExpandedChange={setExpandedIds}
          width={16}
        />
      ),
      16,
      6,
    );
    await tick();
    const session = new AutomationSession(root.host);
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowRight")); // expand "src"
    await tick();
    root.dispatchInput(key("ArrowDown")); // select "a.ts"
    await tick();
    expect(surface.text({ trimRight: true })).toContain("├─a.ts");
    session.expect.node({ role: "treeitem", name: "a.ts" }, { selected: true });
    root.destroy();
  });
});
