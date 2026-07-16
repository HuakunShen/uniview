import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiSolidRoot } from "../src/index";
import { Tabs } from "../src/tabs";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

describe("Tabs (Solid)", () => {
  it("shows the active panel and moves the selection with arrows", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 30, height: 3 } });
    const session = new AutomationSession(root.host);
    const [value, setValue] = createSignal(0);
    root.render(() => (
      <Tabs
        value={value()}
        onChange={setValue}
        tabs={[
          { label: "One", content: <text>panel-one</text> },
          { label: "Two", content: <text>panel-two</text> },
          { label: "Three", content: <text>panel-three</text> },
        ]}
      />
    ));
    await tick();
    expect(surface.text()).toContain("panel-one");
    session.expect.node({ role: "tab", name: "One" }, { selected: true });

    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowRight"));
    await tick();
    expect(surface.text()).toContain("panel-two");
    expect(surface.text()).not.toContain("panel-one");
    session.expect.node({ role: "tab", name: "Two" }, { selected: true });
    root.destroy();
  });

  it("skips a disabled tab", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 30, height: 3 } });
    const [value, setValue] = createSignal(0);
    root.render(() => (
      <Tabs
        value={value()}
        onChange={setValue}
        tabs={[
          { label: "One", content: <text>p1</text> },
          { label: "Two", content: <text>p2</text>, disabled: true },
          { label: "Three", content: <text>p3</text> },
        ]}
      />
    ));
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowRight")); // 0 → skip 1 → 2
    await tick();
    expect(surface.text()).toContain("p3");
    root.destroy();
  });
});
