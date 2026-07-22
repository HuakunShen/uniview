import { describe, expect, it, vi } from "vitest";
import { RenderScheduler } from "../../src/scheduler/scheduler";

/** A manual scheduler queue so tests control exactly when flushes run. */
function manualScheduler() {
  const queue: Array<() => void> = [];
  return {
    schedule: (flush: () => void) => queue.push(flush),
    drain: () => {
      const pending = queue.splice(0);
      for (const flush of pending) flush();
    },
    take: () => queue.splice(0),
    get length() {
      return queue.length;
    },
  };
}

describe("RenderScheduler", () => {
  it("coalesces multiple invalidations into a single render", () => {
    const render = vi.fn();
    const clock = manualScheduler();
    const scheduler = new RenderScheduler({ render, schedule: clock.schedule });

    scheduler.invalidate("paint");
    scheduler.invalidate("paint");
    scheduler.invalidate("paint");
    expect(render).not.toHaveBeenCalled();

    clock.drain();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith("paint");
  });

  it("upgrades a paint invalidation to layout when both are requested", () => {
    const render = vi.fn();
    const clock = manualScheduler();
    const scheduler = new RenderScheduler({ render, schedule: clock.schedule });

    scheduler.invalidate("paint");
    scheduler.invalidate("layout");
    clock.drain();

    expect(render).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith("layout");
  });

  it("keeps layout precedence regardless of request order", () => {
    const render = vi.fn();
    const clock = manualScheduler();
    const scheduler = new RenderScheduler({ render, schedule: clock.schedule });

    scheduler.invalidate("layout");
    scheduler.invalidate("paint");
    clock.drain();

    expect(render).toHaveBeenCalledWith("layout");
  });

  it("does not render when nothing was invalidated", () => {
    const render = vi.fn();
    const clock = manualScheduler();
    new RenderScheduler({ render, schedule: clock.schedule });
    clock.drain();
    expect(render).not.toHaveBeenCalled();
  });

  it("schedules only once per frame, then again after flushing", () => {
    const render = vi.fn();
    const clock = manualScheduler();
    const scheduler = new RenderScheduler({ render, schedule: clock.schedule });

    scheduler.invalidate("paint");
    scheduler.invalidate("paint");
    expect(clock.length).toBe(1);

    clock.drain();
    scheduler.invalidate("layout");
    expect(clock.length).toBe(1);
    clock.drain();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("reports pending state", () => {
    const clock = manualScheduler();
    const scheduler = new RenderScheduler({
      render: () => {},
      schedule: clock.schedule,
    });
    expect(scheduler.pending).toBe(false);
    scheduler.invalidate("paint");
    expect(scheduler.pending).toBe(true);
    clock.drain();
    expect(scheduler.pending).toBe(false);
  });

  it("flushes synchronously on demand", () => {
    const render = vi.fn();
    const clock = manualScheduler();
    const scheduler = new RenderScheduler({ render, schedule: clock.schedule });

    scheduler.invalidate("paint");
    scheduler.flushSync();
    expect(render).toHaveBeenCalledOnce();
    expect(scheduler.pending).toBe(false);

    // A scheduled flush afterwards is a no-op because state was cleared.
    clock.drain();
    expect(render).toHaveBeenCalledOnce();
  });

  it("flushSync does nothing when no invalidation is pending", () => {
    const render = vi.fn();
    const clock = manualScheduler();
    const scheduler = new RenderScheduler({ render, schedule: clock.schedule });
    scheduler.flushSync();
    expect(render).not.toHaveBeenCalled();
  });

  it("cancels an already queued callback without flushing a later generation", () => {
    const render = vi.fn();
    const clock = manualScheduler();
    const scheduler = new RenderScheduler({ render, schedule: clock.schedule });

    scheduler.invalidate("paint");
    scheduler.cancel();
    scheduler.invalidate("layout");
    expect(clock.length).toBe(2);

    const [stale, current] = clock.take();
    stale?.();
    expect(render).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(true);

    current?.();
    expect(render).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith("layout");
  });
});
