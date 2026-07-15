import { describe, expect, it } from "vitest";
import { renderToBuffer } from "../../src/paint/paint";
import { hitTest } from "../../src/focus/hit-test";

describe("hitTest", () => {
  it("maps a pointer cell to the topmost owning node", () => {
    const { buffer, owners } = renderToBuffer(
      {
        type: "box",
        id: "panel",
        background: "blue",
        style: { width: 4, height: 1 },
        children: [{ type: "text", id: "label", text: "hi" }],
      },
      { width: 4, height: 1 },
    );

    expect(hitTest(buffer, owners, 0, 0)).toBe("label"); // child wins
    expect(hitTest(buffer, owners, 3, 0)).toBe("panel"); // uncovered by child
  });

  it("returns null for an unowned cell", () => {
    const { buffer, owners } = renderToBuffer(
      { type: "text", id: "t", text: "hi", style: { width: 2, height: 1 } },
      { width: 5, height: 1 },
    );
    expect(hitTest(buffer, owners, 4, 0)).toBeNull();
  });

  it("returns null for an out-of-bounds coordinate", () => {
    const { buffer, owners } = renderToBuffer(
      { type: "text", id: "t", text: "hi" },
      { width: 5, height: 1 },
    );
    expect(hitTest(buffer, owners, 10, 10)).toBeNull();
    expect(hitTest(buffer, owners, -1, 0)).toBeNull();
  });
});
