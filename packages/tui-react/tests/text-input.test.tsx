import { describe, expect, it, vi } from "vitest";
import { createElement as h, useState } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiReactRoot } from "../src/index";
import { TextInput } from "../src/text-input";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });
const typeText = (t: string): TuiInputEvent => ({ type: "text", text: t });

function App({ onSubmit }: { onSubmit?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return h(TextInput, { value, onChange: setValue, onSubmit, placeholder: "name" });
}

describe("TextInput", () => {
  it("edits through the router and renders value + caret", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 10, height: 1 } });
    const session = new AutomationSession(root.host);
    root.render(h(App, {}));
    await tick();

    root.dispatchInput(key("Tab")); // focus the textbox
    // A keystroke fires onChange → React re-renders the controlled value; the
    // next keystroke must see it, so drain between keys (as real typing does).
    root.dispatchInput(typeText("h"));
    await tick();
    root.dispatchInput(typeText("i"));
    await tick();

    expect(session.query({ role: "textbox" })?.value).toBe("hi");
    expect(surface.text({ trimRight: true })).toContain("hi");

    // caret cell is the inverse-styled cell just past "hi" (column 2, row 0)
    const frame = surface.cells()!;
    const cell = frame.cells[0]![2]!;
    expect(styles.get(cell.styleId).inverse).toBe(true);
    root.destroy();
  });

  it("fires onSubmit on Enter", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const onSubmit = vi.fn();
    const root = createTuiReactRoot({ surface, styles, size: { width: 10, height: 1 } });
    root.render(h(App, { onSubmit }));
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(typeText("x"));
    await tick();
    root.dispatchInput(key("Enter"));
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("x");
    root.destroy();
  });

  it("masks the display but reports the real value", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 10, height: 1 } });
    const session = new AutomationSession(root.host);
    function Pwd() {
      const [value, setValue] = useState("");
      return h(TextInput, { value, onChange: setValue, mask: true });
    }
    root.render(h(Pwd));
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(typeText("a"));
    await tick();
    root.dispatchInput(typeText("b"));
    await tick();
    expect(session.query({ role: "textbox" })?.value).toBe("ab");
    expect(surface.text({ trimRight: true })).toContain("••");
    expect(surface.text({ trimRight: true })).not.toContain("ab");
    root.destroy();
  });
});
