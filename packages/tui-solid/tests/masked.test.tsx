import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { Masked } from "../src/masked";
import { tick } from "./tick";

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface };
}

describe("Masked (Solid)", () => {
  it("renders one bullet per grapheme, never the plaintext", async () => {
    const { root, surface } = mount(
      () => <Masked value="hunter2" selectable />,
      10,
      1,
    );
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toBe("•••••••");
    expect(text).not.toContain("hunter2");
    expect([...surface.lastFrame!.selectable]).toEqual(new Array(10).fill(0));
    root.destroy();
  });
});
