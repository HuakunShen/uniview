import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { FrameClock, MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App } from "../src/app";

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

async function tick(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("animation demo", () => {
  it("renders the label and grows the bar as frames advance", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const harness = manualFrameClock();
    const clock = new FrameClock({ now: harness.now, requestFrame: harness.requestFrame });
    const root = createTuiReactRoot({ surface, styles, size: { width: 40, height: 3 }, clock });
    root.render(createElement(App));
    await tick();
    expect(surface.text()).toContain("bouncing bar");

    // The bar is a run of "█" whose length is the animated width.
    const barWidth = (): number => (surface.text().split("\n")[1] ?? "").replace(/[^█]/g, "").length;
    const start = barWidth();
    expect(start).toBe(2); // from: 2

    // Advance ~mid-tween: the bar widens beyond its 2-cell start.
    harness.tick(450);
    await tick();
    expect(barWidth()).toBeGreaterThan(start);
    root.destroy();
  });
});
