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

  it("blinks a single caret — on the focused field only", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 20, height: 2 } });
    function Two() {
      const [a, setA] = useState("aa");
      const [b, setB] = useState("bb");
      return h(
        "box",
        { flexDirection: "column" },
        h(TextInput, { key: "a", value: a, onChange: setA }),
        h(TextInput, { key: "b", value: b, onChange: setB }),
      );
    }
    root.render(h(Two));
    await tick();

    // The caret sits just past each 2-char value → column 2 on each row.
    const caret = (row: number) => {
      const frame = surface.cells()!;
      return styles.get(frame.cells[row]![2]!.styleId);
    };

    // Nothing focused yet: neither caret is drawn (no inverse block, no blink).
    expect(caret(0).inverse).toBeFalsy();
    expect(caret(1).inverse).toBeFalsy();

    // Focus the first field: exactly one blinking caret, on row 0.
    root.dispatchInput(key("Tab"));
    await tick();
    expect(caret(0).inverse).toBe(true);
    expect(caret(0).blink).toBe(true);
    expect(caret(1).inverse).toBeFalsy();
    expect(caret(1).blink).toBeFalsy();

    // Move focus to the second field: the caret follows, still just one.
    root.dispatchInput(key("Tab"));
    await tick();
    expect(caret(0).inverse).toBeFalsy();
    expect(caret(0).blink).toBeFalsy();
    expect(caret(1).inverse).toBe(true);
    expect(caret(1).blink).toBe(true);
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
