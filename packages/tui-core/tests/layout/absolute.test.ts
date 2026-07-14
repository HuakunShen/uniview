import { describe, expect, it } from "vitest";
import { computeLayout, type LayoutInput } from "../../src/layout/layout";

const leaf = (id: string, w: number, h: number): LayoutInput => ({
  id,
  measure: () => ({ width: w, height: h }),
});

describe("computeLayout — absolute positioning", () => {
  it("removes absolute children from flow and positions them by top/left", () => {
    const layout = computeLayout(
      {
        style: { flexDirection: "column" },
        children: [
          leaf("a", 5, 1),
          { id: "overlay", style: { position: "absolute", top: 2, left: 3, width: 4, height: 2 } },
          leaf("b", 5, 1),
        ],
      },
      { width: 20, height: 10 },
    );
    expect(layout.children[0]!.box).toMatchObject({ x: 0, y: 0 });
    // b stacks right after a — the overlay does NOT consume a row
    expect(layout.children[2]!.box).toMatchObject({ x: 0, y: 1 });
    expect(layout.children[1]!.box).toMatchObject({ x: 3, y: 2, width: 4, height: 2 });
  });

  it("positions by right/bottom", () => {
    const layout = computeLayout(
      {
        children: [
          { id: "o", style: { position: "absolute", right: 1, bottom: 1, width: 3, height: 2 } },
        ],
      },
      { width: 10, height: 10 },
    );
    // right:1 → x = 10 - 3 - 1 = 6 ; bottom:1 → y = 10 - 2 - 1 = 7
    expect(layout.children[0]!.box).toMatchObject({ x: 6, y: 7, width: 3, height: 2 });
  });

  it("stretches width when both left and right are set", () => {
    const layout = computeLayout(
      {
        children: [
          { id: "o", style: { position: "absolute", left: 2, right: 2, top: 0, height: 1 } },
        ],
      },
      { width: 10, height: 5 },
    );
    expect(layout.children[0]!.box).toMatchObject({ x: 2, width: 6 });
  });

  it("centers with percentage insets", () => {
    const layout = computeLayout(
      {
        children: [
          { id: "o", style: { position: "absolute", left: "25%", top: "10%", width: 4, height: 2 } },
        ],
      },
      { width: 20, height: 10 },
    );
    expect(layout.children[0]!.box).toMatchObject({ x: 5, y: 1 });
  });
});
