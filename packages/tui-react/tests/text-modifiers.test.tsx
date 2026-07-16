import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Text } from "../src/primitives";
import { tick } from "./tick";

function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

describe("Text — blink & hidden (React)", () => {
  it("paints a cell whose style carries blink and hidden", async () => {
    const { root, surface, styles } = mount(h(Text, { blink: true, hidden: true }, "x"), 4, 1);
    await tick();
    const frame = surface.cells()!;
    const style = styles.get(frame.cells[0]![0]!.styleId);
    expect(style.blink).toBe(true);
    expect(style.hidden).toBe(true);
    root.destroy();
  });
});
