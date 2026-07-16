import { describe, expect, it } from "vitest";
import { createElement as h, useState } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiReactRoot } from "../src/index";
import { Tabs } from "../src/tabs";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

function App() {
  const [value, setValue] = useState(0);
  return h(Tabs, {
    value,
    onChange: setValue,
    tabs: [
      { label: "One", content: h("text", null, "panel-one") },
      { label: "Two", content: h("text", null, "panel-two") },
      { label: "Three", content: h("text", null, "panel-three") },
    ],
  });
}

describe("Tabs", () => {
  it("shows the active panel and moves the selection with arrows", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 30, height: 3 } });
    const session = new AutomationSession(root.host);
    root.render(h(App));
    await tick();
    expect(surface.text()).toContain("panel-one");
    session.expect.node({ role: "tab", name: "One" }, { selected: true });

    root.dispatchInput(key("Tab")); // focus the tablist
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
    function DisabledApp() {
      const [value, setValue] = useState(0);
      return h(Tabs, {
        value,
        onChange: setValue,
        tabs: [
          { label: "One", content: h("text", null, "p1") },
          { label: "Two", content: h("text", null, "p2"), disabled: true },
          { label: "Three", content: h("text", null, "p3") },
        ],
      });
    }
    const root = createTuiReactRoot({ surface, styles, size: { width: 30, height: 3 } });
    root.render(h(DisabledApp));
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowRight")); // 0 → skip 1 → 2
    await tick();
    expect(surface.text()).toContain("p3");
    root.destroy();
  });
});
