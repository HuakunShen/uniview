import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { List, listCounter } from "../src/list";
import { Text } from "../src/primitives";

const tick = () => new Promise((r) => setTimeout(r, 20));
const key = (k: string): TuiInputEvent => ({
  type: "key",
  key: k,
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
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

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

/** A controlled harness that owns `selectedIndex` (Solid signal → live prop getter). */
function Harness(props: { items: string[]; height?: number }) {
  const [sel, setSel] = createSignal(0);
  return (
    <List
      items={props.items}
      selectedIndex={sel()}
      onSelect={(i) => setSel(i)}
      height={props.height}
      width={16}
    />
  );
}

describe("listCounter", () => {
  it("formats 1-based position", () => {
    expect(listCounter(0, 8)).toBe("1 of 8");
    expect(listCounter(7, 8)).toBe("8 of 8");
    expect(listCounter(0, 0)).toBe("0 of 0");
  });
});

describe("List", () => {
  it("highlights the whole selected row (bg spans full width)", async () => {
    const { surface, styles } = mount(() => <Harness items={["alpha", "beta", "gamma"]} />, 16, 3);
    await tick();
    const frame = surface.cells()!;
    const bgAt = (x: number) => JSON.stringify(styles.get(frame.cells[0]![x]!.styleId).bg ?? null);
    const cols = [0, 3, 8, 12, 15].map(bgAt);
    expect(new Set(cols).size).toBe(1); // uniform across the row
    expect(cols[0]).not.toBe(JSON.stringify(null)); // and it IS a color
  });

  it("moves selection with arrow keys", async () => {
    const { root, surface, styles } = mount(
      () => <Harness items={["alpha", "beta", "gamma"]} />,
      16,
      3,
    );
    await tick();
    root.dispatchInput(key("Tab")); // focus the List (its root box has onKeyDown)
    root.dispatchInput(key("ArrowDown"));
    root.dispatchInput(key("ArrowDown"));
    await tick();
    const frame = surface.cells()!;
    const bg = (y: number, x: number) => styles.get(frame.cells[y]![x]!.styleId).bg;
    expect(bg(2, 0)).toBe("blue"); // "gamma" row now selected
    expect(bg(0, 0)).toBeUndefined(); // "alpha" no longer selected
  });

  /**
   * THE "last requested wins" test. `selectedIndex` is parent-controlled and may
   * only land a render (or, as here, an async round-trip) later — exactly what a
   * host-owned selection echoed back over RPC looks like. Two ArrowDowns
   * dispatched synchronously must therefore compose into TWO steps: the second
   * key handler reads the last *requested* index, never the still-stale prop.
   */
  it("two synchronous ArrowDowns move two rows even when the prop lags", async () => {
    const seen: number[] = [];
    function AsyncHarness() {
      const [sel, setSel] = createSignal(0);
      const onSelect = (i: number): void => {
        seen.push(i);
        // The parent commits the selection asynchronously (RPC-style round-trip),
        // so `selectedIndex` is still 0 when the second ArrowDown is handled.
        void Promise.resolve().then(() => setSel(i));
      };
      return (
        <List items={["alpha", "beta", "gamma"]} selectedIndex={sel()} onSelect={onSelect} width={16} />
      );
    }
    const { root, surface, styles } = mount(() => <AsyncHarness />, 16, 3);
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowDown"));
    root.dispatchInput(key("ArrowDown")); // no await in between — same synchronous turn
    await tick();
    expect(seen).toEqual([1, 2]); // composed, not collapsed into [1, 1]
    const frame = surface.cells()!;
    const bg = (y: number, x: number) => styles.get(frame.cells[y]![x]!.styleId).bg;
    expect(bg(2, 0)).toBe("blue"); // "gamma" selected — moved TWO rows
    expect(bg(1, 0)).toBeUndefined();
  });

  it("selects a row by clicking its empty part", async () => {
    const seen: number[] = [];
    function Clickable() {
      const [sel, setSel] = createSignal(0);
      return (
        <List
          items={["alpha", "beta", "gamma"]}
          selectedIndex={sel()}
          width={16}
          onSelect={(i) => {
            seen.push(i);
            setSel(i);
          }}
        />
      );
    }
    const { root } = mount(() => <Clickable />, 16, 3);
    await tick();
    root.dispatchInput(click(13, 1)); // empty part of row 1 ("beta")
    await tick();
    expect(seen).toContain(1);
  });

  it("a click re-syncs the requested index (a later ArrowDown steps from the clicked row)", async () => {
    const seen: number[] = [];
    function Clickable() {
      const [sel, setSel] = createSignal(0);
      return (
        <List
          items={["alpha", "beta", "gamma"]}
          selectedIndex={sel()}
          width={16}
          onSelect={(i) => {
            seen.push(i);
            // Parent commits asynchronously, so the prop still reads 0 below.
            void Promise.resolve().then(() => setSel(i));
          }}
        />
      );
    }
    const { root } = mount(() => <Clickable />, 16, 3);
    await tick();
    root.dispatchInput(click(13, 1)); // click row 1 ("beta") — focuses that row
    // No Tab needed: the key bubbles from the focused row up to the list, which
    // is what a user pressing ↓ right after clicking an item expects.
    root.dispatchInput(key("ArrowDown")); // same turn: prop is still 0, requested is 1
    await tick();
    expect(seen).toEqual([1, 2]); // stepped from the clicked row, not from the stale prop
  });

  it("Home / End / PageDown / PageUp move the selection", async () => {
    const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const { root, surface } = mount(() => <Harness items={items} height={4} />, 16, 4);
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("End"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("item-19");
    root.dispatchInput(key("PageUp"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("item-15");
    root.dispatchInput(key("Home"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("item-0");
  });

  it("scrolls to keep the selection visible", async () => {
    const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const { root, surface } = mount(() => <Harness items={items} height={4} />, 16, 4);
    await tick();
    root.dispatchInput(key("Tab")); // focus the List
    for (let i = 0; i < 10; i += 1) root.dispatchInput(key("ArrowDown"));
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("item-10"); // selected row is in view
    expect(text).not.toContain("item-0"); // window scrolled past the top
  });

  it("renders custom rows via renderItem", async () => {
    const { surface } = mount(
      () => (
        <List
          items={["a", "b"]}
          selectedIndex={0}
          onSelect={() => {}}
          width={16}
          renderItem={(item, index, selected) => (
            <Text>{`${selected ? ">" : " "} ${index}:${item}`}</Text>
          )}
        />
      ),
      16,
      2,
    );
    await tick();
    const lines = surface.text({ trimRight: true }).split("\n");
    expect(lines[0]).toBe("> 0:a");
    expect(lines[1]).toBe("  1:b");
  });
});
