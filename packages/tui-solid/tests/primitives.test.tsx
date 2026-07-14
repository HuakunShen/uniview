import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { Box, Text } from "../src/primitives";

const tick = () => new Promise((r) => setTimeout(r, 0));

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

describe("Box", () => {
  it("fills its region with backgroundColor across width/height", async () => {
    const { surface, styles } = mount(
      () => <Box backgroundColor="blue" width={4} height={2} />,
      6,
      3,
    );
    await tick();
    const frame = surface.cells()!;
    const bgAt = (x: number, y: number) =>
      styles.get(frame.cells[y]![x]!.styleId).bg ?? null;

    // Filled region: (0,0)-(3,1)
    expect(bgAt(0, 0)).toBe("blue");
    expect(bgAt(3, 0)).toBe("blue");
    expect(bgAt(0, 1)).toBe("blue");
    expect(bgAt(3, 1)).toBe("blue");
    // Outside the box's region: untouched
    expect(bgAt(4, 0)).toBe(null);
    expect(bgAt(0, 2)).toBe(null);
  });
});

describe("Text", () => {
  it("renders the string styled with color + bold", async () => {
    const { surface, styles } = mount(
      () => <Text color="cyan" bold>Hello</Text>,
      10,
      1,
    );
    await tick();
    expect(surface.text({ trimRight: true })).toBe("Hello");
    const frame = surface.cells()!;
    const style = styles.get(frame.cells[0]![0]!.styleId);
    expect(style.fg).toBe("cyan");
    expect(style.bold).toBe(true);
  });
});

describe("Text reactivity through the wrapper", () => {
  it("updates the surface when a driving signal changes (props not destructured)", async () => {
    const [label, setLabel] = createSignal("one");
    const { surface } = mount(() => <Text>{label()}</Text>, 10, 1);
    await tick();
    expect(surface.text({ trimRight: true })).toBe("one");

    setLabel("two");
    await tick();
    expect(surface.text({ trimRight: true })).toBe("two");
  });
});
