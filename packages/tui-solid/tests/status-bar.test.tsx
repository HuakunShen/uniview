import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { StatusBar, type StatusItem } from "../src/status-bar";

const tick = () => new Promise((r) => setTimeout(r, 0));

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

describe("StatusBar", () => {
  it("renders label: key pairs joined by a separator", async () => {
    const { surface } = mount(
      () => (
        <StatusBar
          items={[
            { label: "Checkout", keyHint: "<space>" },
            { label: "Delete", keyHint: "d" },
          ]}
        />
      ),
      40,
      1,
    );
    await tick();
    expect(surface.text({ trimRight: true })).toContain("Checkout: <space> | Delete: d");
  });

  it("honors a custom separator", async () => {
    const { surface } = mount(
      () => (
        <StatusBar
          separator=" • "
          items={[
            { label: "Push", keyHint: "P" },
            { label: "Pull", keyHint: "p" },
          ]}
        />
      ),
      40,
      1,
    );
    await tick();
    expect(surface.text({ trimRight: true })).toContain("Push: P • Pull: p");
  });

  it("re-renders when the items signal changes (props not destructured)", async () => {
    const [items, setItems] = createSignal<readonly StatusItem[]>([
      { label: "Commit", keyHint: "c" },
    ]);
    const { surface } = mount(() => <StatusBar items={items()} />, 40, 1);
    await tick();
    expect(surface.text({ trimRight: true })).toBe("Commit: c");

    setItems([{ label: "Amend", keyHint: "A" }]);
    await tick();
    expect(surface.text({ trimRight: true })).toBe("Amend: A");
  });
});
