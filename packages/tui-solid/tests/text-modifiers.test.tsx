import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { Text } from "../src/primitives";
import { tick } from "./tick";

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

describe("Text — blink & hidden (Solid)", () => {
  it("paints a cell whose style carries blink and hidden", async () => {
    const { root, surface, styles } = mount(
      () => (
        <Text blink hidden>
          x
        </Text>
      ),
      4,
      1,
    );
    await tick();
    const frame = surface.cells()!;
    const style = styles.get(frame.cells[0]![0]!.styleId);
    expect(style.blink).toBe(true);
    expect(style.hidden).toBe(true);
    root.destroy();
  });
});
