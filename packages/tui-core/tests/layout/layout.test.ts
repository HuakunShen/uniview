import { describe, expect, it } from "vitest";
import { computeLayout, type LayoutInput } from "../../src/layout/layout";

const box = (
  style: LayoutInput["style"],
  children: LayoutInput[] = [],
): LayoutInput => ({ style, children });

/** A fixed-size leaf standing in for measured text. */
const leaf = (width: number, height: number): LayoutInput => ({
  measure: () => ({ width, height }),
});

describe("computeLayout — sizing", () => {
  it("fills the container by default", () => {
    const result = computeLayout(box({}), { width: 20, height: 10 });
    expect(result.box).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  });

  it("honors an explicit width and height", () => {
    const result = computeLayout(box({ width: 8, height: 3 }), {
      width: 20,
      height: 10,
    });
    expect(result.box).toMatchObject({ width: 8, height: 3 });
  });

  it("resolves a percentage width against the container", () => {
    const result = computeLayout(box({ width: "50%", height: "20%" }), {
      width: 20,
      height: 10,
    });
    expect(result.box).toMatchObject({ width: 10, height: 2 });
  });

  it("shrinks an auto-sized box to its content", () => {
    const result = computeLayout(
      box({ width: "auto", height: "auto", flexDirection: "column" }, [
        leaf(4, 1),
        leaf(6, 1),
      ]),
      { width: 40, height: 20 },
    );
    // column: width = max child width, height = sum child heights
    expect(result.box).toMatchObject({ width: 6, height: 2 });
  });
});

describe("computeLayout — column stacking", () => {
  it("stacks children top to bottom", () => {
    const result = computeLayout(
      box({ flexDirection: "column", width: 10, height: 10 }, [
        leaf(3, 1),
        leaf(3, 2),
      ]),
      { width: 10, height: 10 },
    );
    expect(result.children[0]!.box).toMatchObject({ x: 0, y: 0, height: 1 });
    expect(result.children[1]!.box).toMatchObject({ x: 0, y: 1, height: 2 });
  });

  it("inserts gap between children", () => {
    const result = computeLayout(
      box({ flexDirection: "column", gap: 1, width: 10, height: 10 }, [
        leaf(3, 1),
        leaf(3, 1),
      ]),
      { width: 10, height: 10 },
    );
    expect(result.children[0]!.box.y).toBe(0);
    expect(result.children[1]!.box.y).toBe(2); // 1 (first) + 1 (gap)
  });
});

describe("computeLayout — row layout", () => {
  it("places children left to right with gap", () => {
    const result = computeLayout(
      box({ flexDirection: "row", gap: 2, width: 20, height: 3 }, [
        leaf(4, 1),
        leaf(3, 1),
      ]),
      { width: 20, height: 3 },
    );
    expect(result.children[0]!.box).toMatchObject({ x: 0, width: 4 });
    expect(result.children[1]!.box).toMatchObject({ x: 6, width: 3 });
  });
});

describe("computeLayout — padding and border", () => {
  it("offsets children by padding", () => {
    const result = computeLayout(
      box({ padding: 2, width: 20, height: 20 }, [leaf(3, 1)]),
      { width: 20, height: 20 },
    );
    expect(result.children[0]!.box).toMatchObject({ x: 2, y: 2 });
  });

  it("offsets children by a one-cell border and grows an auto box", () => {
    const result = computeLayout(
      box({ border: true, width: "auto", height: "auto" }, [leaf(4, 1)]),
      { width: 20, height: 20 },
    );
    expect(result.children[0]!.box).toMatchObject({ x: 1, y: 1 });
    expect(result.box).toMatchObject({ width: 6, height: 3 }); // 4+2, 1+2
  });
});

describe("computeLayout — flex grow", () => {
  it("distributes free main-axis space by flexGrow", () => {
    const result = computeLayout(
      box({ flexDirection: "row", width: 20, height: 1 }, [
        { style: { flexGrow: 1 }, measure: () => ({ width: 0, height: 1 }) },
        { style: { flexGrow: 3 }, measure: () => ({ width: 0, height: 1 }) },
      ]),
      { width: 20, height: 1 },
    );
    // 20 units of free space split 1:3 -> 5 and 15
    expect(result.children[0]!.box.width).toBe(5);
    expect(result.children[1]!.box.width).toBe(15);
    expect(result.children[1]!.box.x).toBe(5);
  });
});

describe("computeLayout — alignment", () => {
  it("centers children on the cross axis with alignItems", () => {
    const result = computeLayout(
      box({ flexDirection: "row", alignItems: "center", width: 20, height: 5 }, [
        leaf(4, 1),
      ]),
      { width: 20, height: 5 },
    );
    expect(result.children[0]!.box.y).toBe(2); // (5 - 1) / 2
  });

  it("stretches children on the cross axis when alignItems is stretch", () => {
    const result = computeLayout(
      box({ flexDirection: "row", alignItems: "stretch", width: 20, height: 5 }, [
        { style: {}, measure: () => ({ width: 4, height: 1 }) },
      ]),
      { width: 20, height: 5 },
    );
    expect(result.children[0]!.box.height).toBe(5);
  });

  it("centers children on the main axis with justifyContent", () => {
    const result = computeLayout(
      box({ flexDirection: "row", justifyContent: "center", width: 20, height: 1 }, [
        leaf(4, 1),
      ]),
      { width: 20, height: 1 },
    );
    expect(result.children[0]!.box.x).toBe(8); // (20 - 4) / 2
  });

  it("spreads children with justifyContent space-between", () => {
    const result = computeLayout(
      box({ flexDirection: "row", justifyContent: "space-between", width: 20, height: 1 }, [
        leaf(4, 1),
        leaf(4, 1),
      ]),
      { width: 20, height: 1 },
    );
    expect(result.children[0]!.box.x).toBe(0);
    expect(result.children[1]!.box.x).toBe(16); // pushed to the far edge
  });
});
