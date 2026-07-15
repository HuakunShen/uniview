import { describe, expect, it } from "vitest";
import { StyleTable } from "../../src/style/style-table";
import { renderToBuffer, type RenderNode } from "../../src/paint/paint";

function render(root: RenderNode, width: number, height: number) {
  const styles = new StyleTable();
  const { buffer, owners } = renderToBuffer(root, { width, height }, styles);
  const ownerAt = (x: number, y: number) => owners.idOf(buffer.cellAt(x, y).ownerId) ?? null;
  return { buffer, owners, ownerAt };
}

describe("renderToBuffer — geometric hit-test ownership", () => {
  it("a container box owns its whole region, even the empty part past the label", () => {
    const { ownerAt } = render(
      {
        type: "box",
        id: "row",
        style: { width: 10, height: 1 },
        children: [{ type: "text", id: "label", text: "hi" }],
      },
      10,
      1,
    );
    // the glyphs belong to the text…
    expect(ownerAt(0, 0)).toBe("label");
    // …but the empty cells to the right belong to the row, so a click there
    // still hits the row (and bubbles to its onClick).
    expect(ownerAt(5, 0)).toBe("row");
    expect(ownerAt(9, 0)).toBe("row");
  });

  it("a transparent box (no background) is still hit-testable across its region", () => {
    const { ownerAt } = render(
      {
        type: "box",
        style: { flexDirection: "column" },
        children: [
          { type: "box", id: "item", style: { width: 8, height: 1 }, children: [{ type: "text", text: "x" }] },
        ],
      },
      8,
      2,
    );
    expect(ownerAt(4, 0)).toBe("item"); // empty part of the row
  });

  it("does not make a text leaf own space beyond its glyphs", () => {
    // A stretched text node still only owns the cells it painted.
    const { ownerAt } = render({ type: "text", id: "t", text: "hi" }, 10, 1);
    expect(ownerAt(0, 0)).toBe("t");
    expect(ownerAt(9, 0)).toBe(null);
  });

  it("children win over their container (deepest owner)", () => {
    const { ownerAt } = render(
      {
        type: "box",
        id: "outer",
        style: { width: 6, height: 1, flexDirection: "row" },
        children: [{ type: "box", id: "inner", style: { width: 3, height: 1 } }],
      },
      6,
      1,
    );
    expect(ownerAt(0, 0)).toBe("inner"); // covered by inner
    expect(ownerAt(4, 0)).toBe("outer"); // past inner, still the outer box
  });
});
