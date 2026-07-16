import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Masked } from "../src/masked";
import { tick } from "./tick";

function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface };
}

describe("Masked (React)", () => {
  it("renders one bullet per grapheme, never the plaintext", async () => {
    const { root, surface } = mount(h(Masked, { value: "hunter2" }), 10, 1);
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toBe("•••••••");
    expect(text).not.toContain("hunter2");
    root.destroy();
  });
});
