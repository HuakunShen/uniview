import { describe, expect, it, vi } from "vitest";
import type { CellBuffer } from "../../src/buffer/cell-buffer";
import { StyleTable } from "../../src/style/style-table";
import { MemoryCellSurface } from "../../src/surface/memory-surface";
import { AnsiCellSurface } from "../../src/surface/ansi-surface";
import type {
  CellSurface,
  FrameUpdate,
  PresentStats,
  Size,
} from "../../src/surface/types";
import { isIdle, waitForIdle } from "../../src/scheduler/diagnostics";
import { TuiRenderer, type RenderNode } from "../../src/renderer/tui-renderer";

function manualScheduler() {
  const queue: Array<() => void> = [];
  return {
    schedule: (flush: () => void) => queue.push(flush),
    drain: () => queue.splice(0).forEach((f) => f()),
    get length() {
      return queue.length;
    },
  };
}

const counter = (n: number): RenderNode => ({
  type: "box",
  style: { flexDirection: "column" },
  children: [
    { type: "text", text: `Count: ${n}` },
    { type: "text", text: "Increment" },
  ],
});

type SurfaceOperation = "mount" | "resize" | "present" | "destroy";

function surfaceReturningThenable(operation: SurfaceOperation): {
  surface: CellSurface;
  readonly destroyCalls: number;
} {
  let destroyCalls = 0;
  const stats: PresentStats = { rowsPainted: 0, runsPainted: 0 };
  const surface = {
    kind: "memory" as const,
    mount(_size: Size) {
      if (operation === "mount") return Promise.resolve();
    },
    resize(_size: Size) {
      if (operation === "resize") return { then() {} };
    },
    present(_frame: CellBuffer, _update: FrameUpdate) {
      if (operation === "present") return Promise.resolve(stats);
      return stats;
    },
    destroy() {
      destroyCalls += 1;
      if (operation === "destroy" && destroyCalls === 1) {
        return { then() {} };
      }
    },
  } as unknown as CellSurface;
  return {
    surface,
    get destroyCalls() {
      return destroyCalls;
    },
  };
}

describe("TuiRenderer", () => {
  it("renders a scene to the surface on flush", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const clock = manualScheduler();
    const renderer = new TuiRenderer({
      surface,
      styles,
      size: { width: 20, height: 3 },
      schedule: clock.schedule,
    });

    renderer.setRoot(counter(0));
    expect(surface.presentCount).toBe(0); // nothing painted until flush
    clock.drain();

    expect(surface.lines({ trimRight: true })).toEqual([
      "Count: 0",
      "Increment",
      "",
    ]);
    expect(surface.presentCount).toBe(1);
  });

  it("coalesces multiple setRoot calls into a single frame", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const clock = manualScheduler();
    const renderer = new TuiRenderer({
      surface,
      styles,
      size: { width: 20, height: 3 },
      schedule: clock.schedule,
    });

    renderer.setRoot(counter(0));
    renderer.setRoot(counter(1));
    renderer.setRoot(counter(2));
    clock.drain();

    expect(surface.presentCount).toBe(1);
    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 2");
  });

  it("re-renders only the row that changed", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const clock = manualScheduler();
    const renderer = new TuiRenderer({
      surface,
      styles,
      size: { width: 20, height: 3 },
      schedule: clock.schedule,
    });

    renderer.setRoot(counter(0));
    clock.drain();
    renderer.setRoot(counter(1));
    clock.drain();

    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 1");
    expect(surface.debug.lastUpdatedRows).toEqual([0]);
  });

  it("does not clear the screen for a label update on the ANSI surface", () => {
    const styles = new StyleTable();
    const chunks: string[] = [];
    const surface = new AnsiCellSurface({
      write: (s) => chunks.push(s),
      styles,
    });
    const clock = manualScheduler();
    const renderer = new TuiRenderer({
      surface,
      styles,
      size: { width: 40, height: 3 },
      schedule: clock.schedule,
    });

    renderer.setRoot(counter(0));
    clock.drain();
    chunks.length = 0;
    renderer.setRoot(counter(1));
    clock.drain();

    const out = chunks.join("");
    expect(out).not.toContain("\x1b[2J");
    expect(Buffer.byteLength(out, "utf8")).toBeLessThan(128);
  });

  it("reports idle only once the frame is flushed", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const clock = manualScheduler();
    const renderer = new TuiRenderer({
      surface,
      styles,
      size: { width: 20, height: 3 },
      schedule: clock.schedule,
    });

    renderer.setRoot(counter(0));
    expect(isIdle(renderer.diagnostics)).toBe(false);

    clock.drain();
    expect(isIdle(renderer.diagnostics)).toBe(true);
    await expect(waitForIdle(renderer.diagnostics)).resolves.toBeUndefined();
  });

  it("full-repaints on resize", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const clock = manualScheduler();
    const renderer = new TuiRenderer({
      surface,
      styles,
      size: { width: 10, height: 2 },
      schedule: clock.schedule,
    });

    renderer.setRoot(counter(0));
    clock.drain();
    renderer.resize({ width: 20, height: 4 });
    clock.drain();

    const cells = surface.cells();
    expect(cells?.width).toBe(20);
    expect(cells?.height).toBe(4);
    expect(surface.lastUpdate?.fullRepaint).toBe(true);
  });

  it("restores the surface on destroy", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const destroy = vi.spyOn(surface, "destroy");
    const clock = manualScheduler();
    const renderer = new TuiRenderer({
      surface,
      styles,
      size: { width: 10, height: 2 },
      schedule: clock.schedule,
    });
    renderer.setRoot(counter(0));
    clock.drain();
    renderer.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("rejects an asynchronous mount contract at runtime", () => {
    const fixture = surfaceReturningThenable("mount");
    expect(
      () =>
        new TuiRenderer({
          surface: fixture.surface,
          size: { width: 10, height: 2 },
        }),
    ).toThrow(/CellSurface\.mount\(\) must complete synchronously/i);
  });

  it("rejects a resize thenable and invalidates the renderer", () => {
    const fixture = surfaceReturningThenable("resize");
    const renderer = new TuiRenderer({
      surface: fixture.surface,
      size: { width: 10, height: 2 },
    });

    expect(() => renderer.resize({ width: 20, height: 4 })).toThrow(
      /CellSurface\.resize\(\) must complete synchronously/i,
    );
    expect(() => renderer.setRoot(counter(1))).toThrow(/teardown|destroy/i);
    renderer.destroy();
  });

  it("rejects an asynchronous present and leaves no committed frame", () => {
    const fixture = surfaceReturningThenable("present");
    const clock = manualScheduler();
    const renderer = new TuiRenderer({
      surface: fixture.surface,
      size: { width: 10, height: 2 },
      schedule: clock.schedule,
    });
    renderer.setRoot({ id: "owned", type: "text", text: "Async" });

    expect(() => renderer.flush()).toThrow(
      /CellSurface\.present\(\) must complete synchronously/i,
    );
    expect(renderer.currentFrame).toBeNull();
    expect(renderer.owners.size).toBe(1);
    expect(renderer.diagnostics.renderRevision).toBe(0);
    expect(renderer.diagnostics.schedulerPending).toBe(false);
    expect(() => renderer.flush()).toThrow(/teardown|destroy/i);
    clock.drain();
    expect(renderer.currentFrame).toBeNull();
    renderer.destroy();
  });

  it("rejects an asynchronous destroy and keeps teardown retryable", () => {
    const fixture = surfaceReturningThenable("destroy");
    const renderer = new TuiRenderer({
      surface: fixture.surface,
      size: { width: 10, height: 2 },
    });

    expect(() => renderer.destroy()).toThrow(
      /CellSurface\.destroy\(\) must complete synchronously/i,
    );
    expect(() => renderer.flush()).toThrow(/teardown|destroy/i);
    renderer.destroy();
    renderer.destroy();
    expect(fixture.destroyCalls).toBe(2);
  });

  it("does not recommit frame state when present synchronously destroys the renderer", () => {
    const clock = manualScheduler();
    let renderer: TuiRenderer;
    let destroyCalls = 0;
    const surface: CellSurface = {
      kind: "memory",
      mount() {},
      resize() {},
      present() {
        renderer.destroy();
        return { rowsPainted: 1, runsPainted: 1 };
      },
      destroy() {
        destroyCalls += 1;
      },
    };
    renderer = new TuiRenderer({
      surface,
      size: { width: 10, height: 2 },
      schedule: clock.schedule,
    });
    renderer.setRoot({ id: "owned", type: "text", text: "Reentrant" });

    renderer.flush();

    expect(destroyCalls).toBe(1);
    expect(renderer.currentFrame).toBeNull();
    expect(renderer.owners.size).toBe(1);
    expect(renderer.diagnostics.renderRevision).toBe(0);
    expect(renderer.diagnostics.schedulerPending).toBe(false);
    expect(() => renderer.setRoot(counter(1))).toThrow(/teardown|destroy/i);
    expect(clock.length).toBe(1);
    clock.drain();
    expect(renderer.currentFrame).toBeNull();
    expect(destroyCalls).toBe(1);
  });

  it("invalidates queued work and keeps every render path closed while teardown retries", () => {
    const styles = new StyleTable();
    const chunks: string[] = [];
    const destroyError = new Error("surface destroy failed");
    let blockDestroy = true;
    let destroyAttempts = 0;
    const surface = new AnsiCellSurface({
      styles,
      write: (chunk) => {
        if (chunk === "\x1b[0m\x1b[?25h") {
          destroyAttempts += 1;
          if (blockDestroy) throw destroyError;
        }
        chunks.push(chunk);
      },
    });
    const clock = manualScheduler();
    const renderer = new TuiRenderer({
      surface,
      styles,
      size: { width: 10, height: 2 },
      schedule: clock.schedule,
    });
    renderer.setRoot(counter(0));

    expect(() => renderer.destroy()).toThrow(destroyError);
    const outputAfterFailedDestroy = [...chunks];
    expect(() => renderer.setRoot(counter(1))).toThrow(/teardown|destroy/i);
    expect(() => renderer.resize({ width: 20, height: 4 })).toThrow(
      /teardown|destroy/i,
    );
    expect(() => renderer.setCursor({ visible: false, x: 0, y: 0 })).toThrow(
      /teardown|destroy/i,
    );
    expect(() => renderer.flush()).toThrow(/teardown|destroy/i);
    clock.drain();
    expect(chunks).toEqual(outputAfterFailedDestroy);

    blockDestroy = false;
    renderer.destroy();
    expect(destroyAttempts).toBe(2);
    const outputAfterDestroy = [...chunks];
    renderer.destroy();
    clock.drain();
    expect(destroyAttempts).toBe(2);
    expect(chunks).toEqual(outputAfterDestroy);
  });
});

describe("TuiRenderer.currentFrame", () => {
  it("exposes the last rendered buffer for hit-testing", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const clock = manualScheduler();
    const renderer = new TuiRenderer({
      surface,
      styles,
      size: { width: 6, height: 1 },
      schedule: clock.schedule,
    });
    expect(renderer.currentFrame).toBeNull();
    renderer.setRoot({ type: "text", text: "hi" });
    clock.drain();
    expect(renderer.currentFrame?.width).toBe(6);
  });
});
