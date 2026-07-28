import { afterEach, describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot, type TuiSolidRoot } from "../src/index";
import { Box, RichText, Text } from "../src/primitives";

import { tick } from "./tick";

const mountedRoots: TuiSolidRoot[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.destroy();
});

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  mountedRoots.push(root);
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
      () => (
        <Text color="cyan" bold>
          Hello
        </Text>
      ),
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

  it("is selectable by default and honors selectable=false for text and richtext", async () => {
    const { surface } = mount(
      () => (
        <Box flexDirection="column">
          <Text>copy</Text>
          <Text selectable={false}>secret</Text>
          <RichText selectable={false} spans={[{ text: "hidden" }]} />
        </Box>
      ),
      10,
      3,
    );
    await tick();

    const frame = surface.lastFrame!;
    expect([...frame.selectable.slice(0, 4)]).toEqual([1, 1, 1, 1]);
    expect([...frame.selectable.slice(10, 16)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([...frame.selectable.slice(20, 26)]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("passes selection options through the Solid root", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({
      surface,
      styles,
      size: { width: 8, height: 1 },
      selection: {},
    });
    root.render(() => <Text>select</Text>);
    await tick();

    root.dispatchInput({
      type: "mouse",
      action: "down",
      button: "left",
      x: 0,
      y: 0,
      ctrl: false,
      alt: false,
      shift: false,
    });
    root.dispatchInput({
      type: "mouse",
      action: "drag",
      button: "left",
      x: 2,
      y: 0,
      ctrl: false,
      alt: false,
      shift: false,
    });

    expect(root.host.renderer.selectionRange).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 2, y: 0 },
    });
    root.destroy();
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
