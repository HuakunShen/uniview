import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { FrameClock, StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { animate as reactAnimate, createTuiReactRoot } from "@uniview/tui-react";
import { animate as solidAnimate, createTuiSolidRoot } from "../src/index";
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

const OPTS = { from: 8, duration: 400, ease: "quadInOut" as const };

function ReactBar() {
  const w = reactAnimate("w", 40, OPTS);
  return h("box", { width: Math.round(w), height: 1, backgroundColor: "accent" });
}

function SolidBar() {
  const w = solidAnimate("w", 40, OPTS);
  return <box width={Math.round(w())} height={1} backgroundColor="accent" />;
}

describe("animation parity (React vs Solid)", () => {
  it("produces byte-identical SVG at every frame checkpoint", async () => {
    const size = { width: 40, height: 1 };
    const harness = manualFrameClock();

    const rStyles = new StyleTable();
    const rSurface = new SvgCellSurface({ styles: rStyles });
    const rClock = new FrameClock({ now: harness.now, requestFrame: harness.requestFrame });
    const rRoot = createTuiReactRoot({ surface: rSurface, styles: rStyles, size, clock: rClock });

    const sStyles = new StyleTable();
    const sSurface = new SvgCellSurface({ styles: sStyles });
    const sClock = new FrameClock({ now: harness.now, requestFrame: harness.requestFrame });
    const sRoot = createTuiSolidRoot({ surface: sSurface, styles: sStyles, size, clock: sClock });

    rRoot.render(h(ReactBar));
    sRoot.render(SolidBar);
    await tick(); // React commits + effect registers its timeline

    // Checkpoints across the tween: start, quarter, half, three-quarter, end.
    for (const step of [0, 100, 100, 100, 100]) {
      if (step > 0) {
        harness.tick(step);
        await tick();
      }
      expect(sSurface.toSVG()).toBe(rSurface.toSVG());
    }

    rRoot.destroy();
    sRoot.destroy();
  });
});
