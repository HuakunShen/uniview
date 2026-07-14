import { describe, expect, it } from "vitest";
import { computeLayout, customLayoutEngine, type LayoutInput } from "../../src/index";

describe("customLayoutEngine", () => {
  it("delegates to computeLayout identically", () => {
    const root: LayoutInput = {
      style: { flexDirection: "row" },
      children: [{ style: { width: 4, height: 1 } }, { style: { flexGrow: 1, height: 1 } }],
    };
    const size = { width: 20, height: 3 };
    const viaEngine = customLayoutEngine.computeLayout(root, size);
    const direct = computeLayout(root, size);
    expect(viaEngine.box).toEqual(direct.box);
    expect(viaEngine.children[1]!.box.width).toBe(direct.children[1]!.box.width);
  });
});
