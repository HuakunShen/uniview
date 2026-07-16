import { describe, expect, it } from "vitest";
import { FrameClock, MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { animate, createTuiSolidRoot, useAnimation } from "../src/index";
import { tick } from "./tick";

function manualFrameClock() {
  let nowMs = 0;
  const queue: Array<() => void> = [];
  return {
    now: () => nowMs,
    requestFrame: (frame: () => void) => {
      queue.push(frame);
    },
    tick(ms: number): void {
      nowMs += ms;
      queue.splice(0).forEach((frame) => frame());
    },
  };
}

function Bar() {
  const w = animate("w", 40, { from: 8, duration: 400, ease: "linear" });
  return <text>{`W:${Math.round(w())}`}</text>;
}

describe("animate (Solid)", () => {
  it("tweens a value into the rendered tree, frame by frame", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const harness = manualFrameClock();
    const clock = new FrameClock({ now: harness.now, requestFrame: harness.requestFrame });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 12, height: 1 }, clock });

    root.render(Bar);
    expect(surface.lines({ trimRight: true })[0]).toBe("W:8");

    harness.tick(200);
    await tick();
    expect(surface.lines({ trimRight: true })[0]).toBe("W:24");

    harness.tick(200);
    await tick();
    expect(surface.lines({ trimRight: true })[0]).toBe("W:40");

    root.destroy();
  });
});

function Counter() {
  const { frame } = useAnimation();
  return <text>{`F:${frame()}`}</text>;
}

describe("useAnimation (Solid)", () => {
  it("re-renders with the frame counter each frame", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const harness = manualFrameClock();
    const clock = new FrameClock({ now: harness.now, requestFrame: harness.requestFrame });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 8, height: 1 }, clock });

    root.render(Counter);
    harness.tick(16);
    await tick();
    harness.tick(16);
    await tick();
    expect(surface.lines({ trimRight: true })[0]).toBe("F:2");

    root.destroy();
  });
});
