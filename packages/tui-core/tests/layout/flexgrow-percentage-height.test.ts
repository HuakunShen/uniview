import { describe, expect, it } from "vitest";
import { computeLayout, type LayoutInput } from "../../src/layout/layout";

/**
 * CHARACTERIZATION TEST — not desired behavior.
 *
 * This pins the KNOWN LIMITATION documented above `intrinsicSize` in
 * `../../src/layout/layout.ts`: a `height:"100%"` (main-axis) child under a
 * `flexGrow` ancestor resolves its percentage against the ancestor's
 * *available* height rather than the space left after its siblings, so
 * pairing it with a fixed-height sibling double-counts and overflows the
 * grandparent's box. The numbers below are what the engine actually
 * produces TODAY, recorded so any future change to this behavior (e.g.
 * swapping in a real flexbox/Yoga engine behind the `LayoutEngine` seam) is
 * a conscious, visible change to this test rather than a silent regression.
 */
describe("KNOWN LIMITATION — flexGrow parent with height:100% + fixed-height sibling", () => {
  it("double-counts the 100% child and overflows the root's box", () => {
    const root: LayoutInput = {
      style: { flexDirection: "column", width: 10, height: 20 },
      children: [
        {
          // The flexGrow ancestor: no explicit height, so its own intrinsic
          // size comes from summing its children's main-axis sizes.
          style: { flexGrow: 1 },
          children: [
            // height:"100%" resolves against the ancestor-available height
            // (20) at measure time, not "20 minus the fixed sibling below".
            { style: { height: "100%" }, measure: () => ({ width: 0, height: 0 }) },
            // A fixed-height sibling, summed on top of the 100% child.
            { style: { height: 5 }, measure: () => ({ width: 0, height: 0 }) },
          ],
        },
      ],
    };

    const result = computeLayout(root, { width: 10, height: 20 });

    // Root is sized to the container, as usual.
    expect(result.box).toEqual({ x: 0, y: 0, width: 10, height: 20 });

    // BUG: the flexGrow parent's resolved height is 25 (100% child's 20 +
    // fixed sibling's 5), not clamped to the root's 20 — it overflows the
    // root by 5 rows instead of shrinking the 100% child to fit alongside
    // its sibling.
    const parent = result.children[0]!;
    expect(parent.box).toEqual({ x: 0, y: 0, width: 10, height: 25 });

    // BUG (compounding): during `arrange`, the 100% child is re-measured
    // against the parent's own (already-inflated) final height of 25, so it
    // grows again to 25 instead of settling at the originally-measured 20.
    const childA = parent.children[0]!;
    expect(childA.box).toEqual({ x: 0, y: 0, width: 10, height: 25 });

    // BUG: the fixed-height sibling is pushed to y=25 — flush with the
    // bottom edge of the parent's own (overflowed) box, i.e. entirely
    // outside the parent's visible area rather than sharing space with the
    // 100% child.
    const childB = parent.children[1]!;
    expect(childB.box).toEqual({ x: 0, y: 25, width: 10, height: 5 });
  });
});
