import { describe, expect, it, vi } from "vitest";
import { Timeline } from "../../src/scheduler/timeline";

describe("Timeline", () => {
  it("interpolates linearly from start to end", () => {
    const tl = new Timeline({ from: 0, to: 100, duration: 400, ease: "linear" });
    expect(tl.value).toBe(0); // t = 0
    tl.tick(200);
    expect(tl.value).toBeCloseTo(50, 10); // t = 0.5
    tl.tick(200);
    expect(tl.value).toBeCloseTo(100, 10); // t = 1
    expect(tl.done).toBe(true);
    expect(tl.running).toBe(false);
  });

  it("applies the named easing to the value", () => {
    const tl = new Timeline({ from: 0, to: 100, duration: 100, ease: "quadOut" });
    tl.tick(50); // quadOut(0.5) = 0.75
    expect(tl.value).toBeCloseTo(75, 10);
  });

  it("fires onComplete exactly once", () => {
    const onComplete = vi.fn();
    const tl = new Timeline({ from: 0, to: 1, duration: 100, onComplete });
    tl.tick(60);
    expect(onComplete).not.toHaveBeenCalled();
    tl.tick(60); // crosses the end
    tl.tick(60); // already done — must not fire again
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("loops forever, wrapping past the duration", () => {
    const tl = new Timeline({ from: 0, to: 100, duration: 100, ease: "linear", loop: true });
    tl.tick(150); // wraps: 150 % 100 = 50
    expect(tl.value).toBeCloseTo(50, 10);
    expect(tl.done).toBe(false);
  });

  it("alternates direction on odd iterations", () => {
    const tl = new Timeline({ from: 0, to: 100, duration: 100, ease: "linear", loop: true, alternate: true });
    tl.tick(100); // end of iteration 0 -> 100
    expect(tl.value).toBeCloseTo(100, 10);
    tl.tick(50); // iteration 1 is reversed: 100 -> 0, half way = 50
    expect(tl.value).toBeCloseTo(50, 10);
  });

  it("sequences segments added with .add()", () => {
    const tl = new Timeline({ from: 0, to: 100, duration: 100, ease: "linear" }).add({
      to: 0,
      duration: 100,
      ease: "linear",
    });
    expect(tl.duration).toBe(200);
    tl.tick(100); // end of segment 1
    expect(tl.value).toBeCloseTo(100, 10);
    tl.tick(50); // half through segment 2 (100 -> 0)
    expect(tl.value).toBeCloseTo(50, 10);
  });

  it("reset returns to the start and re-arms", () => {
    const tl = new Timeline({ from: 0, to: 100, duration: 100, ease: "linear" });
    tl.tick(100);
    expect(tl.done).toBe(true);
    tl.reset();
    expect(tl.value).toBe(0);
    expect(tl.done).toBe(false);
    expect(tl.running).toBe(true);
  });

  it("rejects a non-positive duration", () => {
    expect(() => new Timeline({ duration: 0 })).toThrow(/duration/i);
  });
});
