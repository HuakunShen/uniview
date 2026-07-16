import { describe, expect, it } from "vitest";
import { keyEvent } from "../../src/input/events";
import { TreeMachine, type TreeSourceNode } from "../../src/components/tree-machine";

const roots: TreeSourceNode[] = [
  { id: "src", children: [{ id: "a.ts" }, { id: "b.ts" }] },
  { id: "readme" },
];

describe("TreeMachine", () => {
  it("flattens only expanded subtrees", () => {
    const m = new TreeMachine({ roots });
    expect(m.rows().map((r) => r.id)).toEqual(["src", "readme"]); // collapsed by default
    m.setExpanded("src", true);
    expect(m.rows().map((r) => r.id)).toEqual(["src", "a.ts", "b.ts", "readme"]);
  });

  it("defaults selection to the first visible row", () => {
    expect(new TreeMachine({ roots }).selectedId).toBe("src");
  });

  it("ArrowDown/ArrowUp move the cursor over visible rows", () => {
    const m = new TreeMachine({ roots, expanded: ["src"] });
    expect(m.handle(keyEvent("ArrowDown"))).toEqual([{ type: "select", id: "a.ts", index: 1 }]);
    expect(m.handle(keyEvent("ArrowUp"))).toEqual([{ type: "select", id: "src", index: 0 }]);
  });

  it("ArrowRight expands a collapsed node; ArrowLeft collapses an expanded one", () => {
    const m = new TreeMachine({ roots, selectedId: "src" });
    expect(m.handle(keyEvent("ArrowRight"))).toEqual([{ type: "expand", id: "src" }]);
    expect(m.isExpanded("src")).toBe(true);
    expect(m.handle(keyEvent("ArrowLeft"))).toEqual([{ type: "collapse", id: "src" }]);
    expect(m.isExpanded("src")).toBe(false);
  });

  it("ArrowLeft on a leaf jumps to its parent", () => {
    const m = new TreeMachine({ roots, expanded: ["src"], selectedId: "b.ts" });
    expect(m.handle(keyEvent("ArrowLeft"))).toEqual([{ type: "select", id: "src", index: 0 }]);
  });

  it("emits indent-guide metadata: a guide per ancestor with a later sibling", () => {
    const m = new TreeMachine({ roots, expanded: ["src"] });
    const rows = m.rows();
    // "src" has a later sibling ("readme"), so its expanded children draw a vertical guide.
    expect(rows.find((r) => r.id === "a.ts")!.guides).toEqual([true]);
    expect(rows.find((r) => r.id === "a.ts")!.last).toBe(false); // "a.ts" is followed by "b.ts"
    expect(rows.find((r) => r.id === "b.ts")!.last).toBe(true); // last child of "src"
  });

  it("Home/End jump to the first and last visible rows", () => {
    const m = new TreeMachine({ roots, expanded: ["src"], selectedId: "a.ts" });
    expect(m.handle(keyEvent("End"))).toEqual([{ type: "select", id: "readme", index: 3 }]);
    expect(m.handle(keyEvent("Home"))).toEqual([{ type: "select", id: "src", index: 0 }]);
  });
});
