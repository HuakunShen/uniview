import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { Panel } from "../src/panel";
import { Text } from "../src/primitives";

const tick = () => new Promise((r) => setTimeout(r, 0));

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

describe("Panel", () => {
  it("renders a titled border and a right-aligned footer", async () => {
    const { surface } = mount(
      () => (
        <Panel title="Status" footer="1 of 8" footerAlign="right" width={14} height={3} />
      ),
      14,
      3,
    );
    await tick();
    const lines = surface.text({ trimRight: false }).split("\n");
    expect(lines[0]).toContain("Status");
    expect(lines[2]!.slice(7, 13)).toBe("1 of 8");
  });

  it("colors the border green when focused", async () => {
    const { surface, styles } = mount(
      () => <Panel title="Branches" focused width={12} height={3} />,
      12,
      3,
    );
    await tick();
    const frame = surface.cells()!;
    const topLeft = frame.cells[0]![0]!; // the ╭ corner glyph
    expect(styles.get(topLeft.styleId).fg).toBe("green");
  });

  it("leaves the border unstyled when not focused", async () => {
    const { surface, styles } = mount(
      () => <Panel title="Branches" width={12} height={3} />,
      12,
      3,
    );
    await tick();
    const frame = surface.cells()!;
    const topLeft = frame.cells[0]![0]!;
    expect(styles.get(topLeft.styleId).fg ?? null).toBe(null);
  });

  it("renders children inside the border", async () => {
    const { surface } = mount(
      () => (
        <Panel title="Files" width={12} height={3}>
          <Text>ok</Text>
        </Panel>
      ),
      12,
      3,
    );
    await tick();
    const lines = surface.text({ trimRight: false }).split("\n");
    expect(lines[1]!.slice(1, 3)).toBe("ok");
  });

  it("tracks a focused signal without destructuring props", async () => {
    const [focused, setFocused] = createSignal(false);
    const { surface, styles } = mount(
      () => <Panel title="Log" focused={focused()} width={12} height={3} />,
      12,
      3,
    );
    await tick();
    const fgAt00 = () => styles.get(surface.cells()!.cells[0]![0]!.styleId).fg ?? null;
    expect(fgAt00()).toBe(null);

    setFocused(true);
    await tick();
    expect(fgAt00()).toBe("green");
  });
});
