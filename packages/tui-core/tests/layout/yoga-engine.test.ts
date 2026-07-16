import { describe, expect, it } from "vitest";
import { customLayoutEngine, yogaLayoutEngine, type LayoutInput, type LayoutResult } from "../../src/index";

function boxes(r: LayoutResult): unknown {
  return { box: r.box, children: r.children.map(boxes) };
}

/** Assert the Yoga engine lays a tree out byte-identically to the custom engine. */
function agree(tree: LayoutInput, size: { width: number; height: number }): void {
  expect(boxes(yogaLayoutEngine.computeLayout(tree, size))).toEqual(boxes(customLayoutEngine.computeLayout(tree, size)));
}

describe("yogaLayoutEngine — flex", () => {
  it("grows the flex child into the row's free space beside a fixed sibling", () => {
    const root: LayoutInput = {
      style: { flexDirection: "row" },
      children: [{ style: { width: 4, height: 1 } }, { style: { flexGrow: 1, height: 1 } }],
    };
    const r = yogaLayoutEngine.computeLayout(root, { width: 20, height: 3 });
    expect(r.children[0]!.box).toEqual({ x: 0, y: 0, width: 4, height: 1 });
    expect(r.children[1]!.box.x).toBe(4);
    expect(r.children[1]!.box.width).toBe(16);
  });
});

describe("yogaLayoutEngine — per-property mapping matches the custom engine", () => {
  it("percentage width sizing (Yoga respects the explicit cross-size)", () => {
    const r = yogaLayoutEngine.computeLayout(
      { style: { flexDirection: "row" }, children: [{ style: { width: "50%", height: 1 } }] },
      { width: 20, height: 4 },
    );
    expect(r.children[0]!.box.width).toBe(10); // 50% of 20
    expect(r.children[0]!.box.height).toBe(1); // explicit height honored (custom stretches to 4)
  });

  it("padding offsets and shrinks the child box", () => {
    agree(
      { style: { padding: 2 }, children: [{ style: { flexGrow: 1 } }] },
      { width: 12, height: 8 },
    );
  });

  it("a single border insets one cell per side", () => {
    agree(
      { style: { border: "single" }, children: [{ style: { flexGrow: 1 } }] },
      { width: 12, height: 6 },
    );
  });

  it("column gap spaces stacked children", () => {
    agree(
      {
        style: { flexDirection: "column", gap: 1 },
        children: [{ style: { height: 1 } }, { style: { height: 1 } }, { style: { height: 1 } }],
      },
      { width: 8, height: 8 },
    );
  });

  it("row columnGap spaces side-by-side children by width + gap", () => {
    const r = yogaLayoutEngine.computeLayout(
      {
        style: { flexDirection: "row", columnGap: 3 },
        children: [{ style: { width: 2, height: 1 } }, { style: { width: 2, height: 1 } }],
      },
      { width: 20, height: 3 },
    );
    expect(r.children[0]!.box.x).toBe(0);
    expect(r.children[1]!.box.x).toBe(5); // width 2 + gap 3
  });

  it("minWidth clamps up, maxWidth clamps down", () => {
    const min = yogaLayoutEngine.computeLayout(
      { style: { flexDirection: "row" }, children: [{ style: { width: 4, minWidth: 8, height: 1 } }] },
      { width: 20, height: 3 },
    );
    expect(min.children[0]!.box.width).toBe(8);
    const max = yogaLayoutEngine.computeLayout(
      { style: { flexDirection: "row" }, children: [{ style: { width: 40, maxWidth: 10, height: 1 } }] },
      { width: 20, height: 3 },
    );
    expect(max.children[0]!.box.width).toBe(10);
  });

  it("row-reverse places the first child at the trailing (right) edge", () => {
    const r = yogaLayoutEngine.computeLayout(
      {
        style: { flexDirection: "row-reverse" },
        children: [{ style: { width: 3, height: 1 } }, { style: { width: 3, height: 1 } }],
      },
      { width: 20, height: 3 },
    );
    // Reverse main axis: children[0] sits to the right of children[1].
    expect(r.children[0]!.box.x).toBeGreaterThan(r.children[1]!.box.x);
  });

  it("justifyContent center centers the children in the free space", () => {
    const r = yogaLayoutEngine.computeLayout(
      {
        style: { flexDirection: "row", justifyContent: "center" },
        children: [{ style: { width: 3, height: 1 } }, { style: { width: 3, height: 1 } }],
      },
      { width: 20, height: 3 },
    );
    // 20 wide, 2×3 content ⇒ free 14, centered ⇒ starts at 7.
    expect(r.children[0]!.box.x).toBe(7);
    expect(r.children[1]!.box.x).toBe(10);
  });

  it("position:absolute with offsets matches the custom engine", () => {
    agree(
      {
        style: { flexDirection: "column" },
        children: [
          { style: { height: 1 } },
          { style: { position: "absolute", top: 2, left: 3, width: 4, height: 2 } },
        ],
      },
      { width: 20, height: 8 },
    );
  });
});
