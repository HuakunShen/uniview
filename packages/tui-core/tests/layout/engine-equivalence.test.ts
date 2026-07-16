import { describe, expect, it } from "vitest";
import { customLayoutEngine, yogaLayoutEngine, type LayoutInput, type LayoutResult } from "../../src/index";

function boxes(r: LayoutResult): unknown {
  return { box: r.box, children: r.children.map(boxes) };
}

/**
 * The Yoga engine agrees byte-for-byte with the custom engine on standard flex
 * trees. The single known divergence is cross-axis stretch of a flex child that
 * sets an explicit cross-size: the custom engine stretches it to the container's
 * cross-size, while Yoga (correctly) honors the explicit size. These fixtures
 * therefore avoid putting an explicit cross-size on a flexed child so both
 * engines agree — the equivalence safety net for a possible future default flip.
 */
const cases: { name: string; tree: LayoutInput; size: { width: number; height: number } }[] = [
  {
    name: "column stack of measured leaves",
    tree: {
      style: { flexDirection: "column" },
      children: [
        { style: {}, measure: () => ({ width: 3, height: 1 }) },
        { style: {}, measure: () => ({ width: 5, height: 1 }) },
      ],
    },
    size: { width: 12, height: 6 },
  },
  {
    name: "padded parent with a single flexGrow child",
    tree: { style: { padding: 2 }, children: [{ style: { flexGrow: 1 } }] },
    size: { width: 14, height: 8 },
  },
  {
    name: "bordered parent insets one cell per side",
    tree: { style: { border: "single" }, children: [{ style: { flexGrow: 1 } }] },
    size: { width: 10, height: 6 },
  },
  {
    name: "column gap between full-width rows",
    tree: {
      style: { flexDirection: "column", gap: 1 },
      children: [{ style: { height: 1 } }, { style: { height: 1 } }, { style: { height: 1 } }],
    },
    size: { width: 8, height: 8 },
  },
  {
    name: "nested column then row of grow children",
    tree: {
      style: { flexDirection: "column" },
      children: [
        { style: { flexGrow: 1 }, children: [{ style: { flexGrow: 1 } }, { style: { flexGrow: 1 } }] },
        { style: { height: 2 } },
      ],
    },
    size: { width: 16, height: 10 },
  },
];

describe("engine equivalence — custom vs yoga", () => {
  it.each(cases)("agrees on $name", ({ tree, size }) => {
    expect(boxes(yogaLayoutEngine.computeLayout(tree, size))).toEqual(boxes(customLayoutEngine.computeLayout(tree, size)));
  });
});
