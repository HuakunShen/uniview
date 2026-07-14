import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable, type RenderNode, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { CommandPalette, Hoverable, ScrollView } from "../src/interactive";
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
const move = (x: number, y: number): TuiInputEvent => ({
  type: "mouse",
  action: "move",
  button: "none",
  x,
  y,
  ctrl: false,
  alt: false,
  shift: false,
});
const wheel = (x: number, y: number, deltaY: -1 | 1): TuiInputEvent => ({
  type: "mouse",
  action: "wheel",
  button: "none",
  x,
  y,
  deltaY,
  ctrl: false,
  alt: false,
  shift: false,
});
const click = (x: number, y: number): TuiInputEvent => ({
  type: "mouse",
  action: "up",
  button: "left",
  x,
  y,
  ctrl: false,
  alt: false,
  shift: false,
});

const rowsContent = (n: number): RenderNode => ({
  type: "box",
  style: { flexDirection: "column" },
  children: Array.from({ length: n }, (_, i) => ({
    type: "richtext",
    spans: [{ text: `line ${i}` }],
  })),
});

describe("ScrollView", () => {
  it("shows a window of rows and scrolls with the mouse wheel", async () => {
    const { root, surface } = mount(
      () => <ScrollView content={rowsContent(20)} height={5} width={16} />,
      16,
      5,
    );
    await tick();
    expect(surface.text({ trimRight: true })).toContain("line 0");
    expect(surface.text({ trimRight: true })).not.toContain("line 9");

    root.dispatchInput(wheel(1, 1, 1)); // 3 rows per notch
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("line 3");
    expect(text).not.toContain("line 0");
    root.destroy();
  });

  it("supports controlled scroll (parent owns scrollTop)", async () => {
    const changes: number[] = [];
    const { root, surface } = mount(
      () => (
        <ScrollView
          content={rowsContent(20)}
          height={5}
          width={16}
          scrollTop={8}
          onScrollChange={(t) => changes.push(t)}
        />
      ),
      16,
      5,
    );
    await tick();
    expect(surface.text({ trimRight: true })).toContain("line 8");

    root.dispatchInput(wheel(1, 1, 1));
    await tick();
    expect(changes).toEqual([11]); // reports the requested offset…
    expect(surface.text({ trimRight: true })).toContain("line 8"); // …but does not self-scroll
    root.destroy();
  });

  it("scrolls with the keyboard when focused", async () => {
    const { root, surface } = mount(
      () => <ScrollView content={rowsContent(20)} height={4} width={16} />,
      16,
      4,
    );
    await tick();
    root.dispatchInput(key("Tab")); // keys only reach a focused node
    root.dispatchInput(key("ArrowDown"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("line 1");

    root.dispatchInput(key("End"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("line 19");
    root.destroy();
  });
});

describe("Hoverable", () => {
  it("exposes hover state to its render-prop child", async () => {
    const { root, surface, styles } = mount(
      () => (
        <Hoverable>{(hovered) => <Text color={hovered() ? "yellow" : undefined}>item</Text>}</Hoverable>
      ),
      10,
      1,
    );
    await tick();
    const fg = () => styles.get(surface.cells()!.cells[0]![0]!.styleId).fg ?? null;
    expect(fg()).toBe(null);

    root.dispatchInput(move(1, 0)); // pointer enters
    await tick();
    expect(fg()).toBe("yellow");

    root.dispatchInput(move(9, 0)); // still inside the box — stays hovered
    await tick();
    expect(fg()).toBe("yellow");
    root.destroy();
  });
});

describe("CommandPalette", () => {
  const items = [
    { id: "open", label: "Open File", hint: "⌘O" },
    { id: "save", label: "Save", hint: "⌘S" },
    { id: "quit", label: "Quit" },
  ];

  it("filters by query and highlights the selection", async () => {
    const { root, surface, styles } = mount(
      () => <CommandPalette items={items} query="sa" selectedIndex={0} onSelect={() => {}} top={0} left={0} width={20} />,
      24,
      8,
    );
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("Save");
    expect(text).not.toContain("Open File"); // filtered out
    expect(text).not.toContain("Quit");

    // The selected row carries the highlight background.
    const frame = surface.cells()!;
    const rowHasBlue = frame.cells.some((row) =>
      row.some((cell) => styles.get(cell.styleId).bg === "blue"),
    );
    expect(rowHasBlue).toBe(true);
    root.destroy();
  });

  it("fires onSelect with the clicked command id", async () => {
    const selected: string[] = [];
    const { root, surface } = mount(
      () => (
        <CommandPalette
          items={items}
          query=""
          selectedIndex={0}
          onSelect={(id) => selected.push(id)}
          top={0}
          left={0}
          width={20}
        />
      ),
      24,
      8,
    );
    await tick();
    // Row order: border(0), header(1), then the three commands on rows 2..4.
    const lines = surface.text({ trimRight: true }).split("\n");
    const saveRow = lines.findIndex((l) => l.includes("Save"));
    expect(saveRow).toBeGreaterThan(0);

    root.dispatchInput(click(3, saveRow));
    await tick();
    expect(selected).toEqual(["save"]);
    root.destroy();
  });
});
