import { describe, expect, it } from "vitest";
import { createElement as h, useState } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";

const tick = () => new Promise((r) => setTimeout(r, 20));

function mouseUp(x: number, y: number): TuiInputEvent {
  return { type: "mouse", action: "up", button: "left", x, y, ctrl: false, alt: false, shift: false };
}

function Counter() {
  const [n, setN] = useState(0);
  return h(
    "box",
    { flexDirection: "column" },
    h("text", null, `Count: ${n}`),
    h(
      "box",
      { onClick: () => setN((v) => v + 1), backgroundColor: "blue", width: 9, height: 1 },
      h("text", null, "Increment"),
    ),
  );
}

describe("createTuiReactRoot", () => {
  it("renders a React component to the surface", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 20, height: 3 } });
    root.render(h(Counter));
    await tick(); // ConcurrentRoot commits asynchronously

    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 0");
    root.destroy();
  });

  it("updates the terminal when React state changes via a click", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 20, height: 3 } });
    root.render(h(Counter));
    await tick();
    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 0");

    // The button is on row 1; clicking bubbles to its onClick.
    root.dispatchInput(mouseUp(0, 1));
    await tick();
    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 1");

    root.dispatchInput(mouseUp(0, 1));
    await tick();
    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 2");
    root.destroy();
  });

  it("activates the focused control with the keyboard", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 20, height: 3 } });
    root.render(h(Counter));
    await tick(); // wait for the first commit so focus targets exist

    root.dispatchInput({ type: "key", key: "Tab", ctrl: false, alt: false, shift: false, meta: false });
    root.dispatchInput({ type: "key", key: "Enter", ctrl: false, alt: false, shift: false, meta: false });
    await tick();
    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 1");
    root.destroy();
  });
});

function Form() {
  const [value, setValue] = useState("");
  return h(
    "box",
    { flexDirection: "column" },
    h("input", { value, onChange: (v: string) => setValue(v) }),
    h("text", null, `Value: ${value}`),
  );
}

describe("createTuiReactRoot — text input", () => {
  it("edits a controlled React text field via typed keys", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 20, height: 3 } });
    root.render(h(Form));
    await tick();

    root.dispatchInput({ type: "key", key: "Tab", ctrl: false, alt: false, shift: false, meta: false });
    root.dispatchInput({ type: "text", text: "h" });
    await tick();
    root.dispatchInput({ type: "text", text: "i" });
    await tick();

    expect(surface.text({ trimRight: true })).toContain("Value: hi");
    root.destroy();
  });
});
