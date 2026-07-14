import { describe, expect, it } from "vitest";
import { createElement as h, useState } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Select } from "../src/select";

const tick = () => new Promise((r) => setTimeout(r, 20));
const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

function App() {
  const [value, setValue] = useState("apple");
  return h(Select, { options: ["apple", "banana", "cherry"], value, onChange: setValue });
}

describe("Select", () => {
  it("navigates options with the keyboard (controlled)", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 14, height: 4 } });
    root.render(h(App));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("› apple");

    root.dispatchInput(key("Tab")); // focus the listbox
    root.dispatchInput(key("ArrowDown"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("› banana");

    root.dispatchInput(key("ArrowDown"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("› cherry");

    root.dispatchInput(key("ArrowDown")); // clamped at the end
    await tick();
    expect(surface.text({ trimRight: true })).toContain("› cherry");

    root.dispatchInput(key("Home"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("› apple");
    root.destroy();
  });
});
