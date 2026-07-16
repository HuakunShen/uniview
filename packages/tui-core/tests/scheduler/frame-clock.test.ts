import { describe, expect, it, vi } from "vitest";
import { DiagnosticsTracker } from "../../src/scheduler/diagnostics";
import { FrameClock } from "../../src/scheduler/frame-clock";
import { Timeline } from "../../src/scheduler/timeline";

/**
 * A manual clock + frame queue so tests step animation frames deterministically.
 * `now()` is the injected time source; `tick(ms)` advances it and runs exactly
 * one queued frame. No real timers, no Date.now.
 */
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
      const pending = queue.splice(0);
      for (const frame of pending) frame();
    },
    get pending(): number {
      return queue.length;
    },
  };
}

describe("FrameClock", () => {
  it("drives a timeline to completion, then stops", () => {
    const harness = manualFrameClock();
    const clock = new FrameClock({ now: harness.now, requestFrame: harness.requestFrame });
    const tl = new Timeline({ from: 0, to: 100, duration: 400, ease: "linear" });
    clock.add(tl);

    harness.tick(100); // delta 100 -> t 0.25
    expect(tl.value).toBeCloseTo(25, 10);
    harness.tick(100); // delta 100 -> t 0.5
    expect(tl.value).toBeCloseTo(50, 10);
    harness.tick(200); // delta 200 -> t 1
    expect(tl.value).toBeCloseTo(100, 10);
    expect(tl.done).toBe(true);
    expect(clock.running).toBe(false);
    expect(harness.pending).toBe(0); // it stopped re-arming
  });

  it("reports frame, time and delta to subscribers", () => {
    const harness = manualFrameClock();
    const clock = new FrameClock({ now: harness.now, requestFrame: harness.requestFrame });
    const frames: Array<{ frame: number; time: number; delta: number }> = [];
    clock.subscribe((info) => frames.push({ ...info }));

    harness.tick(16);
    harness.tick(20);
    expect(frames).toEqual([
      { frame: 1, time: 16, delta: 16 },
      { frame: 2, time: 36, delta: 20 },
    ]);
  });

  it("keeps active-animation diagnostics honest", () => {
    const harness = manualFrameClock();
    const diagnostics = new DiagnosticsTracker();
    const clock = new FrameClock({ now: harness.now, requestFrame: harness.requestFrame, diagnostics });
    clock.add(new Timeline({ from: 0, to: 1, duration: 100, ease: "linear" }));
    expect(diagnostics.activeAnimations).toBe(1);
    harness.tick(100); // completes
    expect(diagnostics.activeAnimations).toBe(0);
  });

  it("calls onFrame each frame (the repaint seam)", () => {
    const harness = manualFrameClock();
    const onFrame = vi.fn();
    const clock = new FrameClock({ now: harness.now, requestFrame: harness.requestFrame, onFrame });
    clock.add(new Timeline({ from: 0, to: 1, duration: 100, ease: "linear" }));
    harness.tick(50);
    harness.tick(50);
    expect(onFrame).toHaveBeenCalledTimes(2);
  });

  it("reset zeros the counters", () => {
    const harness = manualFrameClock();
    const clock = new FrameClock({ now: harness.now, requestFrame: harness.requestFrame });
    clock.subscribe(() => {});
    harness.tick(16);
    expect(clock.frame).toBe(1);
    clock.reset();
    expect(clock.frame).toBe(0);
    expect(clock.time).toBe(0);
  });
});
