import { describe, expect, it } from "vitest";
import { createSignal, onCleanup } from "solid-js";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { getRootNode } from "@uniview/solid-renderer";
import { createTuiSolidRoot, getActiveTuiClock } from "../src/index";

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

  it("disposes the active reactive root before replacing it", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({
      surface,
      styles,
      size: { width: 20, height: 3 },
    });
    const cleanups: string[] = [];

    root.render(() => {
      onCleanup(() => cleanups.push("first"));
      return <text>First</text>;
    });
    root.render(() => {
      onCleanup(() => cleanups.push("second"));
      return <text>Second</text>;
    });

    expect(cleanups).toEqual(["first"]);
    expect(surface.text({ trimRight: true })).toContain("Second");

    root.destroy();
    expect(cleanups).toEqual(["first", "second"]);
  });

  it("clears renderer globals and is idempotent when destroyed", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({
      surface,
      styles,
      size: { width: 20, height: 3 },
    });
    let cleanupCount = 0;

    root.render(() => {
      onCleanup(() => {
        cleanupCount += 1;
      });
      return <text>Mounted</text>;
    });
    expect(getRootNode()).not.toBeNull();

    root.destroy();
    root.destroy();

    expect(cleanupCount).toBe(1);
    expect(getRootNode()).toBeNull();
    expect(() => getActiveTuiClock()).toThrow(/active clock/);
  });

  it("keeps the active owner reactive when another root is constructed and destroyed", async () => {
    const firstStyles = new StyleTable();
    const firstSurface = new MemoryCellSurface({ styles: firstStyles });
    const first = createTuiSolidRoot({
      surface: firstSurface,
      styles: firstStyles,
      size: { width: 20, height: 3 },
    });
    let setCount: ((value: number) => number) | undefined;

    first.render(() => {
      const [count, updateCount] = createSignal(0);
      setCount = updateCount;
      return <text>{`Owner: ${count()}`}</text>;
    });

    const secondStyles = new StyleTable();
    const secondSurface = new MemoryCellSurface({ styles: secondStyles });
    const second = createTuiSolidRoot({
      surface: secondSurface,
      styles: secondStyles,
      size: { width: 20, height: 3 },
    });
    second.destroy();

    setCount?.(1);
    await tick();
    expect(firstSurface.text({ trimRight: true })).toContain("Owner: 1");
    expect(secondSurface.text({ trimRight: true })).not.toContain("Owner: 1");
    expect(getActiveTuiClock()).toBe(first.clock);

    first.destroy();
  });

  it("rejects a competing render without mutation and transfers ownership after destroy", async () => {
    const firstStyles = new StyleTable();
    const firstSurface = new MemoryCellSurface({ styles: firstStyles });
    const first = createTuiSolidRoot({
      surface: firstSurface,
      styles: firstStyles,
      size: { width: 20, height: 3 },
    });
    let setCount: ((value: number) => number) | undefined;
    first.render(() => {
      const [count, updateCount] = createSignal(0);
      setCount = updateCount;
      return <text>{`First: ${count()}`}</text>;
    });

    const secondStyles = new StyleTable();
    const secondSurface = new MemoryCellSurface({ styles: secondStyles });
    const second = createTuiSolidRoot({
      surface: secondSurface,
      styles: secondStyles,
      size: { width: 20, height: 3 },
    });

    expect(() => second.render(() => <text>Second</text>)).toThrow(
      /another TUI Solid root is active/i,
    );
    expect(firstSurface.text({ trimRight: true })).toContain("First: 0");
    expect(secondSurface.text({ trimRight: true })).not.toContain("Second");

    setCount?.(1);
    await tick();
    expect(firstSurface.text({ trimRight: true })).toContain("First: 1");
    expect(secondSurface.text({ trimRight: true })).not.toContain("First: 1");

    first.destroy();
    second.render(() => <text>Second</text>);
    expect(secondSurface.text({ trimRight: true })).toContain("Second");
    second.destroy();
  });
});
