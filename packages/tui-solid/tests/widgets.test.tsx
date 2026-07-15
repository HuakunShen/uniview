import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { Select } from "../src/select";
import { VirtualList } from "../src/virtual-list";
import { Text } from "../src/primitives";

import { tick } from "./tick";

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

const key = (k: string): TuiInputEvent => ({
  type: "key",
  key: k,
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
});

describe("Select", () => {
  it("marks the current option with a caret", async () => {
    const { root, surface } = mount(
      () => <Select options={["red", "green", "blue"]} value="green" onChange={() => {}} />,
      12,
      3,
    );
    await tick();
    const lines = surface.text({ trimRight: true }).split("\n");
    expect(lines[0]).toBe("  red");
    expect(lines[1]).toBe("› green");
    expect(lines[2]).toBe("  blue");
    root.destroy();
  });

  it("moves the selection with the arrow keys when focused", async () => {
    const [value, setValue] = createSignal("red");
    const { root, surface } = mount(
      () => <Select options={["red", "green", "blue"]} value={value()} onChange={setValue} />,
      12,
      3,
    );
    await tick();
    root.dispatchInput(key("Tab")); // keys only reach a focused node
    root.dispatchInput(key("ArrowDown"));
    await tick();
    expect(value()).toBe("green");
    expect(surface.text({ trimRight: true }).split("\n")[1]).toBe("› green");

    root.dispatchInput(key("End"));
    await tick();
    expect(value()).toBe("blue");

    root.dispatchInput(key("Home"));
    await tick();
    expect(value()).toBe("red");
    root.destroy();
  });

  it("clamps at both ends", async () => {
    const [value, setValue] = createSignal("red");
    const { root } = mount(
      () => <Select options={["red", "green"]} value={value()} onChange={setValue} />,
      12,
      2,
    );
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowUp")); // already at the top
    await tick();
    expect(value()).toBe("red");
    root.destroy();
  });
});

describe("VirtualList", () => {
  const items = Array.from({ length: 1000 }, (_, i) => `item ${i}`);

  /**
   * Counts renderItem calls rather than inspecting the surface: the viewport is
   * only 4 rows, so a list that rendered all 1000 items and let them clip would
   * look identical on screen. The call count is what actually proves the window
   * is virtualized.
   */
  it("renders only the visible window, not all 1000 items", async () => {
    let rendered = 0;
    const { root, surface } = mount(
      () => (
        <VirtualList
          items={items}
          height={4}
          renderItem={(item) => {
            rendered += 1;
            return <Text>{item}</Text>;
          }}
        />
      ),
      14,
      4,
    );
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("item 0");
    expect(text).toContain("item 3");
    expect(rendered).toBeLessThanOrEqual(8); // the window (+overscan), not 1000
    root.destroy();
  });

  it("scrolls the window with the keyboard when focused", async () => {
    const { root, surface } = mount(
      () => (
        <VirtualList items={items} height={4} renderItem={(item) => <Text>{item}</Text>} />
      ),
      14,
      4,
    );
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowDown"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("item 1");
    expect(surface.text({ trimRight: true })).not.toContain("item 0");

    root.dispatchInput(key("PageDown"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("item 5");
    root.destroy();
  });

  it("does not scroll above the top", async () => {
    const { root, surface } = mount(
      () => (
        <VirtualList items={items} height={4} renderItem={(item) => <Text>{item}</Text>} />
      ),
      14,
      4,
    );
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowUp"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("item 0");
    root.destroy();
  });
});
