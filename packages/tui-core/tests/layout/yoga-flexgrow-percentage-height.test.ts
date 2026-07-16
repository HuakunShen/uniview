import { describe, expect, it } from "vitest";
import { customLayoutEngine, yogaLayoutEngine, type LayoutInput, type LayoutResult } from "../../src/index";

/**
 * The tree from `./flexgrow-percentage-height.test.ts` — a `height:"100%"` child
 * under a `flexGrow` ancestor with a fixed-height sibling. This was documented in
 * `../../src/layout/layout.ts` as a "known limitation" of the custom engine, on
 * the assumption that the parent's overflow to 25 was a bug.
 *
 * Bringing up a real WASM flexbox engine (`yogaLayoutEngine`) settles it: with
 * `flex-basis: auto`, the `flexGrow` parent is content-sized to include the
 * `height:"100%"` child (which resolves against the nearest definite ancestor),
 * so the parent is 25 — and **Yoga produces byte-identical geometry to the custom
 * engine**. The custom engine was correct; there is no divergence to fix. This
 * test pins that agreement so a future engine change can't silently diverge.
 */
function scene(): LayoutInput {
  return {
    style: { flexDirection: "column", width: 10, height: 20 },
    children: [
      {
        style: { flexGrow: 1 },
        children: [
          { style: { height: "100%" }, measure: () => ({ width: 0, height: 0 }) },
          { style: { height: 5 }, measure: () => ({ width: 0, height: 0 }) },
        ],
      },
    ],
  };
}

const CONTAINER = { width: 10, height: 20 };

function boxes(r: LayoutResult): unknown {
  return { box: r.box, children: r.children.map(boxes) };
}

describe("yogaLayoutEngine — flexGrow parent with height:100% + fixed-height sibling", () => {
  it("produces geometry byte-identical to the custom engine (both flexbox-correct)", () => {
    const custom = customLayoutEngine.computeLayout(scene(), CONTAINER);
    const yoga = yogaLayoutEngine.computeLayout(scene(), CONTAINER);
    expect(boxes(yoga)).toEqual(boxes(custom));
  });

  it("both size the root to the container and content-size the flexGrow parent to 25", () => {
    const yoga = yogaLayoutEngine.computeLayout(scene(), CONTAINER);
    expect(yoga.box).toEqual({ x: 0, y: 0, width: 10, height: 20 });
    const parent = yoga.children[0]!;
    // flex-basis: auto ⇒ the parent is content-sized (childA 100% + childB 5 = 25),
    // the same as the custom engine — this is correct flexbox, not a divergence.
    expect(parent.box.height).toBe(25);
    expect(parent.children[0]!.box.height).toBe(25);
    expect(parent.children[1]!.box.y).toBe(25);
  });
});
