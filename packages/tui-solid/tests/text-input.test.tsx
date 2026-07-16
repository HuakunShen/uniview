import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiSolidRoot } from "../src/index";
import { TextInput } from "../src/text-input";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });
const typeText = (t: string): TuiInputEvent => ({ type: "text", text: t });

describe("TextInput (Solid)", () => {
  it("edits through the router and renders value + caret", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 10, height: 1 } });
    const session = new AutomationSession(root.host);
    const [value, setValue] = createSignal("");
    root.render(() => <TextInput value={value()} onChange={setValue} placeholder="name" />);
    await tick();

    root.dispatchInput(key("Tab"));
    root.dispatchInput(typeText("h"));
    await tick();
    root.dispatchInput(typeText("i"));
    await tick();

    expect(session.query({ role: "textbox" })?.value).toBe("hi");
    expect(surface.text({ trimRight: true })).toContain("hi");

    const frame = surface.cells()!;
    const cell = frame.cells[0]![2]!;
    expect(styles.get(cell.styleId).inverse).toBe(true);
    root.destroy();
  });

  it("blinks a single caret — on the focused field only", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 20, height: 2 } });
    const [a, setA] = createSignal("aa");
    const [b, setB] = createSignal("bb");
    root.render(() => (
      <box flexDirection="column">
        <TextInput value={a()} onChange={setA} />
        <TextInput value={b()} onChange={setB} />
      </box>
    ));
    await tick();

    const caret = (row: number) => {
      const frame = surface.cells()!;
      return styles.get(frame.cells[row]![2]!.styleId);
    };

    // Nothing focused: no caret drawn on either field.
    expect(caret(0).inverse).toBeFalsy();
    expect(caret(1).inverse).toBeFalsy();

    root.dispatchInput(key("Tab"));
    await tick();
    expect(caret(0).inverse).toBe(true);
    expect(caret(0).blink).toBe(true);
    expect(caret(1).inverse).toBeFalsy();

    root.dispatchInput(key("Tab"));
    await tick();
    expect(caret(0).inverse).toBeFalsy();
    expect(caret(1).inverse).toBe(true);
    expect(caret(1).blink).toBe(true);
    root.destroy();
  });

  it("fires onSubmit on Enter", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const onSubmit = vi.fn();
    const root = createTuiSolidRoot({ surface, styles, size: { width: 10, height: 1 } });
    const [value, setValue] = createSignal("");
    root.render(() => <TextInput value={value()} onChange={setValue} onSubmit={onSubmit} />);
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
    const root = createTuiSolidRoot({ surface, styles, size: { width: 10, height: 1 } });
    const session = new AutomationSession(root.host);
    const [value, setValue] = createSignal("");
    root.render(() => <TextInput value={value()} onChange={setValue} mask={true} />);
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
