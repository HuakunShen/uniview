import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";

import { tick } from "./tick";

function mouseUp(x: number, y: number): TuiInputEvent {
  return { type: "mouse", action: "up", button: "left", x, y, ctrl: false, alt: false, shift: false };
}

function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <box flexDirection="column">
      <text>{`Count: ${count()}`}</text>
      <box
        onClick={() => setCount(count() + 1)}
        backgroundColor="blue"
        width={9}
        height={1}
      >
        <text>Increment</text>
      </box>
    </box>
  );
}

describe("createTuiSolidRoot", () => {
  it("renders a Solid component to the surface", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 20, height: 3 } });
    root.render(Counter);

    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 0");
    root.destroy();
  });

  it("updates the terminal when a signal changes via a click", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 20, height: 3 } });
    root.render(Counter);

    // Handler dispatch goes through the async registry, then Solid updates
    // synchronously and the update callback repaints.
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
    const root = createTuiSolidRoot({ surface, styles, size: { width: 20, height: 3 } });
    root.render(Counter);

    root.dispatchInput({ type: "key", key: "Tab", ctrl: false, alt: false, shift: false, meta: false });
    root.dispatchInput({ type: "key", key: "Enter", ctrl: false, alt: false, shift: false, meta: false });
    await tick();
    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 1");
    root.destroy();
  });
});
