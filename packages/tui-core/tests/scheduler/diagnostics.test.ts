import { describe, expect, it } from "vitest";
import {
  DiagnosticsTracker,
  isIdle,
  waitForIdle,
} from "../../src/scheduler/diagnostics";

describe("isIdle", () => {
  it("is idle when render matches mutation and nothing is in flight", () => {
    const d = new DiagnosticsTracker();
    expect(isIdle(d)).toBe(true);
  });

  it("is not idle while a mutation is unrendered", () => {
    const d = new DiagnosticsTracker();
    d.bumpMutation();
    expect(isIdle(d)).toBe(false);
    d.markRendered();
    expect(isIdle(d)).toBe(true);
  });

  it("is not idle while a handler is pending", () => {
    const d = new DiagnosticsTracker();
    d.handlerStarted();
    expect(isIdle(d)).toBe(false);
    d.handlerSettled();
    expect(isIdle(d)).toBe(true);
  });

  it("is not idle while transport work or animations are outstanding", () => {
    const d = new DiagnosticsTracker();
    d.transportSent();
    expect(isIdle(d)).toBe(false);
    d.transportReceived();
    expect(isIdle(d)).toBe(true);

    d.animationStarted();
    expect(isIdle(d)).toBe(false);
    d.animationStopped();
    expect(isIdle(d)).toBe(true);
  });

  it("is not idle while a frame is scheduled", () => {
    const d = new DiagnosticsTracker();
    d.setSchedulerPending(true);
    expect(isIdle(d)).toBe(false);
    d.setSchedulerPending(false);
    expect(isIdle(d)).toBe(true);
  });
});

describe("waitForIdle", () => {
  it("resolves immediately when already idle", async () => {
    const d = new DiagnosticsTracker();
    await expect(waitForIdle(d)).resolves.toBeUndefined();
  });

  it("resolves once outstanding work settles", async () => {
    const d = new DiagnosticsTracker();
    d.bumpMutation();
    d.handlerStarted();

    const idle = waitForIdle(d);
    d.markRendered();
    d.handlerSettled();

    await expect(idle).resolves.toBeUndefined();
  });

  it("rejects when it does not become idle before the timeout", async () => {
    const d = new DiagnosticsTracker();
    d.bumpMutation(); // never rendered

    const timers: Array<{ cb: () => void; ms: number }> = [];
    const promise = waitForIdle(d, {
      timeoutMs: 100,
      setTimer: (cb, ms) => {
        timers.push({ cb, ms });
        return timers.length - 1;
      },
      clearTimer: () => {},
    });

    // Fire the injected timeout.
    timers[0]!.cb();
    await expect(promise).rejects.toThrow(/timed out/i);
  });
});
