import { describe, expect, it, vi } from "vitest";
import { createTuiApp, type RenderNode } from "../../src/app/create-tui-app";
import type { TuiInputEvent } from "../../src/input/events";

function fakeTty(columns = 20, rows = 5) {
  const dataListeners = new Set<(chunk: Buffer) => void>();
  const resizeListeners = new Set<() => void>();
  const writes: string[] = [];
  const input = {
    isTTY: true as const,
    setRawMode: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    on: (e: string, l: (chunk: Buffer) => void) =>
      e === "data" && dataListeners.add(l),
    off: (e: string, l: (chunk: Buffer) => void) =>
      e === "data" && dataListeners.delete(l),
  };
  const output = {
    columns,
    rows,
    write: (c: string) => writes.push(c),
    on: (e: string, l: () => void) => e === "resize" && resizeListeners.add(l),
    off: (e: string, l: () => void) =>
      e === "resize" && resizeListeners.delete(l),
  };
  return {
    input,
    output,
    emitData: (s: string) =>
      dataListeners.forEach((l) => l(Buffer.from(s, "utf8"))),
    emitResize: (c: number, r: number) => {
      output.columns = c;
      output.rows = r;
      resizeListeners.forEach((l) => l());
    },
    out: () => writes.join(""),
    reset: () => (writes.length = 0),
    dataListenerCount: () => dataListeners.size,
    resizeListenerCount: () => resizeListeners.size,
  };
}

const label = (text: string): RenderNode => ({ type: "text", text });

function captureError(callback: () => void): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error("Expected callback to throw");
}

describe("createTuiApp", () => {
  it("enters the terminal and paints the initial scene", () => {
    const tty = fakeTty();
    const app = createTuiApp({ input: tty.input, output: tty.output });
    app.render(label("Hello"));

    const out = tty.out();
    expect(out).toContain("\x1b[?1049h"); // entered alternate screen
    expect(out).toContain("Hello");
    app.destroy();
  });

  it("routes parsed input to registered handlers", () => {
    const tty = fakeTty();
    const app = createTuiApp({ input: tty.input, output: tty.output });
    const seen: TuiInputEvent[] = [];
    app.onInput((e) => seen.push(e));

    tty.emitData("x");
    expect(seen).toEqual([{ type: "text", text: "x" }]);
    app.destroy();
  });

  it("re-renders at the new size on resize", () => {
    const tty = fakeTty(20, 5);
    const app = createTuiApp({ input: tty.input, output: tty.output });
    app.render(label("Hi"));
    expect(app.size).toEqual({ width: 20, height: 5 });

    tty.reset();
    tty.emitResize(30, 8);
    expect(app.size).toEqual({ width: 30, height: 8 });
    // a full repaint was emitted for the new geometry
    expect(tty.out()).toContain("Hi");
    app.destroy();
  });

  it("restores the terminal on destroy", () => {
    const tty = fakeTty();
    const app = createTuiApp({ input: tty.input, output: tty.output });
    app.render(label("Hi"));
    tty.reset();
    app.destroy();
    expect(tty.out()).toContain("\x1b[?1049l"); // left alternate screen
    expect(tty.out()).toContain("\x1b[?25h"); // cursor restored
  });

  it("supports an interactive update in response to input", () => {
    const tty = fakeTty(20, 3);
    const app = createTuiApp({ input: tty.input, output: tty.output });
    let count = 0;
    const view = () => label(`Count: ${count}`);
    app.render(view());
    app.onInput((e) => {
      if (e.type === "text" && e.text === "+") {
        count += 1;
        app.render(view());
      }
    });

    tty.reset();
    tty.emitData("+");
    const out = tty.out();
    expect(out).not.toContain("\x1b[2J"); // incremental, no clear
    expect(out).toContain("1");
    app.destroy();
  });

  it("isolates renderer and driver teardown faults and retries pending pieces", () => {
    const tty = fakeTty();
    const rendererError = new Error("surface destroy failed");
    const driverError = new Error("terminal leave failed");
    const originalWrite = tty.output.write;
    let failRenderer = false;
    let failDriver = false;
    let rendererDestroyAttempts = 0;
    let driverStopAttempts = 0;
    tty.output.write = (chunk: string) => {
      const writeCount = originalWrite(chunk);
      if (chunk === "\x1b[0m\x1b[?25h") {
        rendererDestroyAttempts += 1;
        if (failRenderer) throw rendererError;
      }
      if (chunk.includes("\x1b[?1049l")) {
        driverStopAttempts += 1;
        if (failDriver) throw driverError;
      }
      return writeCount;
    };

    const app = createTuiApp({ input: tty.input, output: tty.output });
    app.render(label("faults"));
    failRenderer = true;
    failDriver = true;

    expect(captureError(() => app.destroy())).toBe(rendererError);
    expect(rendererDestroyAttempts).toBe(1);
    expect(driverStopAttempts).toBe(1);
    expect(() => app.render(label("too late"))).toThrow(/teardown/i);
    expect(() => app.onInput(() => {})).toThrow(/teardown/i);

    failRenderer = false;
    failDriver = false;
    expect(() => app.destroy()).not.toThrow();
    expect(rendererDestroyAttempts).toBe(2);
    expect(driverStopAttempts).toBe(2);

    app.destroy();
    expect(rendererDestroyAttempts).toBe(2);
    expect(driverStopAttempts).toBe(2);
  });

  it("does not repeat a completed renderer teardown when driver cleanup retries", () => {
    const tty = fakeTty();
    const driverError = new Error("terminal leave failed");
    const originalWrite = tty.output.write;
    let failDriver = true;
    let rendererDestroyAttempts = 0;
    let driverStopAttempts = 0;
    tty.output.write = (chunk: string) => {
      const writeCount = originalWrite(chunk);
      if (chunk === "\x1b[0m\x1b[?25h") rendererDestroyAttempts += 1;
      if (chunk.includes("\x1b[?1049l")) {
        driverStopAttempts += 1;
        if (failDriver) throw driverError;
      }
      return writeCount;
    };

    const app = createTuiApp({ input: tty.input, output: tty.output });
    expect(captureError(() => app.destroy())).toBe(driverError);
    expect(rendererDestroyAttempts).toBe(1);
    expect(driverStopAttempts).toBe(1);

    failDriver = false;
    app.destroy();
    expect(rendererDestroyAttempts).toBe(1);
    expect(driverStopAttempts).toBe(2);
  });

  it("keeps both streams pending until failed renderer cleanup is retried by the next app", () => {
    const tty = fakeTty();
    const cleanupError = new Error("surface reset failed");
    const originalWrite = tty.output.write;
    let blockCleanup = true;
    let cleanupAttempts = 0;
    tty.output.write = (chunk: string) => {
      if (chunk === "\x1b[0m\x1b[?25h") {
        cleanupAttempts += 1;
        if (blockCleanup) throw cleanupError;
      }
      return originalWrite(chunk);
    };

    const app = createTuiApp({ input: tty.input, output: tty.output });
    app.render(label("Old app"));
    expect(captureError(() => app.destroy())).toBe(cleanupError);
    expect(tty.input.setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(tty.dataListenerCount()).toBe(0);
    expect(tty.resizeListenerCount()).toBe(0);

    let unexpectedReplacement: ReturnType<typeof createTuiApp> | undefined;
    try {
      let blockedError: unknown;
      const beforeBlocked = {
        rawCalls: tty.input.setRawMode.mock.calls.length,
        writes: tty.out(),
        dataListeners: tty.dataListenerCount(),
        resizeListeners: tty.resizeListenerCount(),
      };
      try {
        unexpectedReplacement = createTuiApp({
          input: tty.input,
          output: tty.output,
        });
      } catch (error) {
        blockedError = error;
      }
      expect(blockedError).toBe(cleanupError);
      expect({
        rawCalls: tty.input.setRawMode.mock.calls.length,
        writes: tty.out(),
        dataListeners: tty.dataListenerCount(),
        resizeListeners: tty.resizeListenerCount(),
      }).toEqual(beforeBlocked);

      blockCleanup = false;
      const replacement = createTuiApp({
        input: tty.input,
        output: tty.output,
      });
      replacement.render(label("Replacement"));
      expect(cleanupAttempts).toBe(3);

      const beforeStaleUse = {
        rawCalls: tty.input.setRawMode.mock.calls.length,
        writes: tty.out(),
        dataListeners: tty.dataListenerCount(),
        resizeListeners: tty.resizeListenerCount(),
      };
      app.destroy();
      expect(() => app.render(label("Stale render"))).toThrow(/teardown/i);
      expect(() => app.onInput(() => {})).toThrow(/teardown/i);
      expect(() => app.renderer.setRoot(label("Stale renderer root"))).toThrow(
        /teardown|destroy/i,
      );
      expect(() => app.renderer.resize({ width: 40, height: 8 })).toThrow(
        /teardown|destroy/i,
      );
      expect(() =>
        app.renderer.setCursor({ visible: true, x: 1, y: 1 }),
      ).toThrow(/teardown|destroy/i);
      expect(() => app.renderer.flush()).toThrow(/teardown|destroy/i);
      expect({
        rawCalls: tty.input.setRawMode.mock.calls.length,
        writes: tty.out(),
        dataListeners: tty.dataListenerCount(),
        resizeListeners: tty.resizeListenerCount(),
      }).toEqual(beforeStaleUse);

      replacement.destroy();
      expect(tty.input.setRawMode.mock.calls).toEqual([
        [true],
        [false],
        [true],
        [false],
      ]);
      expect(tty.dataListenerCount()).toBe(0);
      expect(tty.resizeListenerCount()).toBe(0);
    } finally {
      blockCleanup = false;
      unexpectedReplacement?.destroy();
      app.destroy();
    }
  });

  it("routes replacement render failures through the shared cleanup barrier", () => {
    const tty = fakeTty();
    const renderError = new Error("replacement frame failed");
    const cleanupError = new Error("replacement cleanup failed");
    const originalWrite = tty.output.write;
    let failRender = false;
    let blockCleanup = true;
    let cleanupAttempts = 0;
    tty.output.write = (chunk: string) => {
      if (failRender && chunk.includes("\x1b[?2026h")) {
        failRender = false;
        throw renderError;
      }
      if (chunk === "\x1b[0m\x1b[?25h") {
        cleanupAttempts += 1;
        if (blockCleanup) throw cleanupError;
      }
      return originalWrite(chunk);
    };

    const app = createTuiApp({ input: tty.input, output: tty.output });
    app.render(label("Stable scene"));
    failRender = true;
    expect(captureError(() => app.render(label("Broken scene")))).toBe(
      renderError,
    );
    expect(tty.input.setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(tty.dataListenerCount()).toBe(0);
    expect(tty.resizeListenerCount()).toBe(0);

    let unexpectedReplacement: ReturnType<typeof createTuiApp> | undefined;
    try {
      const beforeBlocked = {
        rawCalls: tty.input.setRawMode.mock.calls.length,
        writes: tty.out(),
        dataListeners: tty.dataListenerCount(),
        resizeListeners: tty.resizeListenerCount(),
      };
      let blockedError: unknown;
      try {
        unexpectedReplacement = createTuiApp({
          input: tty.input,
          output: tty.output,
        });
      } catch (error) {
        blockedError = error;
      }
      expect(blockedError).toBe(cleanupError);
      expect({
        rawCalls: tty.input.setRawMode.mock.calls.length,
        writes: tty.out(),
        dataListeners: tty.dataListenerCount(),
        resizeListeners: tty.resizeListenerCount(),
      }).toEqual(beforeBlocked);

      blockCleanup = false;
      const replacement = createTuiApp({
        input: tty.input,
        output: tty.output,
      });
      replacement.render(label("Recovered scene"));
      expect(cleanupAttempts).toBe(3);

      const beforeStaleUse = {
        rawCalls: tty.input.setRawMode.mock.calls.length,
        writes: tty.out(),
        dataListeners: tty.dataListenerCount(),
        resizeListeners: tty.resizeListenerCount(),
      };
      app.destroy();
      expect(() => app.render(label("Stale render"))).toThrow(/teardown/i);
      expect(() => app.onInput(() => {})).toThrow(/teardown/i);
      expect(() => app.renderer.setRoot(label("Stale renderer root"))).toThrow(
        /teardown|destroy/i,
      );
      expect(() => app.renderer.flush()).toThrow(/teardown|destroy/i);
      expect({
        rawCalls: tty.input.setRawMode.mock.calls.length,
        writes: tty.out(),
        dataListeners: tty.dataListenerCount(),
        resizeListeners: tty.resizeListenerCount(),
      }).toEqual(beforeStaleUse);

      replacement.destroy();
      expect(tty.dataListenerCount()).toBe(0);
      expect(tty.resizeListenerCount()).toBe(0);
    } finally {
      blockCleanup = false;
      unexpectedReplacement?.destroy();
      app.destroy();
    }
  });

  it("recovers a lost startup handle through the shared stream registry", () => {
    const tty = fakeTty();
    const startError = new Error("enter failed");
    const cleanupError = new Error("leave failed");
    const originalWrite = tty.output.write;
    let failEnter = true;
    let failCleanup = true;
    let enterAttempts = 0;
    let leaveAttempts = 0;
    tty.output.write = (chunk: string) => {
      const writeCount = originalWrite(chunk);
      if (chunk.includes("\x1b[?1049h")) {
        enterAttempts += 1;
        if (failEnter) throw startError;
      }
      if (chunk.includes("\x1b[?1049l")) {
        leaveAttempts += 1;
        if (failCleanup) throw cleanupError;
      }
      return writeCount;
    };

    expect(
      captureError(() =>
        createTuiApp({ input: tty.input, output: tty.output }),
      ),
    ).toBe(startError);
    expect(enterAttempts).toBe(1);
    // TerminalDriver rollback and createTuiApp's local cleanup both tried.
    expect(leaveAttempts).toBe(2);

    expect(
      captureError(() =>
        createTuiApp({ input: tty.input, output: tty.output }),
      ),
    ).toBe(cleanupError);
    expect(enterAttempts).toBe(1);
    expect(leaveAttempts).toBe(3);

    failCleanup = false;
    failEnter = false;
    const replacement = createTuiApp({
      input: tty.input,
      output: tty.output,
    });
    expect(leaveAttempts).toBe(4);
    expect(enterAttempts).toBe(2);
    replacement.destroy();
  });
});
