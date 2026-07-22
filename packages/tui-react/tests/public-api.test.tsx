import { createElement as h, useEffect } from "react";
import { describe, expect, it } from "vitest";
import type { TtyInput, TtyOutput } from "@uniview/tui-core";
import {
  AnsiCellSurface,
  FrameClock,
  MemoryCellSurface,
  render,
  StyleTable,
  SvgCellSurface,
  TerminalDriver,
  Text,
  type TuiReactApp,
  yogaLayoutEngine,
} from "../src/index";

import { tick } from "./tick";

class FakeInput implements TtyInput {
  isTTY = true;
  readonly rawModes: boolean[] = [];
  readonly listeners = new Set<(chunk: Uint8Array | string) => void>();

  setRawMode(mode: boolean): void {
    this.rawModes.push(mode);
  }

  resume(): void {}
  pause(): void {}

  on(_event: "data", listener: (chunk: Uint8Array | string) => void): void {
    this.listeners.add(listener);
  }

  off(_event: "data", listener: (chunk: Uint8Array | string) => void): void {
    this.listeners.delete(listener);
  }
}

class FakeOutput implements TtyOutput {
  columns = 20;
  rows = 3;
  readonly chunks: string[] = [];
  readonly listeners = new Set<() => void>();
  failWrite: ((chunk: string) => Error | undefined) | undefined;

  write(chunk: string): void {
    const error = this.failWrite?.(chunk);
    if (error) throw error;
    this.chunks.push(chunk);
  }

  on(_event: "resize", listener: () => void): void {
    this.listeners.add(listener);
  }

  off(_event: "resize", listener: () => void): void {
    this.listeners.delete(listener);
  }
}

type TerminalOperation =
  | "raw-on"
  | "resume"
  | "data-on"
  | "resize-on"
  | "enter"
  | "leave"
  | "data-off"
  | "resize-off"
  | "raw-off"
  | "pause";

class FaultyTerminal {
  readonly counts = new Map<TerminalOperation, number>();
  readonly dataListeners = new Set<(chunk: Uint8Array | string) => void>();
  readonly resizeListeners = new Set<() => void>();
  raw = false;
  resumed = false;
  entered = false;
  fault: ((operation: TerminalOperation) => Error | undefined) | undefined;

  private perform(operation: TerminalOperation): void {
    this.counts.set(operation, (this.counts.get(operation) ?? 0) + 1);
    const error = this.fault?.(operation);
    if (error) throw error;
  }

  readonly input: TtyInput = {
    isTTY: true,
    setRawMode: (mode) => {
      this.raw = mode;
      this.perform(mode ? "raw-on" : "raw-off");
    },
    resume: () => {
      this.resumed = true;
      this.perform("resume");
    },
    pause: () => {
      this.resumed = false;
      this.perform("pause");
    },
    on: (_event, listener) => {
      this.dataListeners.add(listener);
      this.perform("data-on");
    },
    off: (_event, listener) => {
      this.dataListeners.delete(listener);
      this.perform("data-off");
    },
  };

  readonly output: TtyOutput = {
    columns: 20,
    rows: 3,
    write: (chunk) => {
      if (chunk.includes("\x1b[?1049h")) {
        this.entered = true;
        this.perform("enter");
      }
      if (chunk.includes("\x1b[?1049l")) {
        this.entered = false;
        this.perform("leave");
      }
    },
    on: (_event, listener) => {
      this.resizeListeners.add(listener);
      this.perform("resize-on");
    },
    off: (_event, listener) => {
      this.resizeListeners.delete(listener);
      this.perform("resize-off");
    },
  };

  acquisitionCounts(): number[] {
    return ["raw-on", "resume", "data-on", "resize-on", "enter"].map(
      (operation) => this.counts.get(operation as TerminalOperation) ?? 0,
    );
  }
}

describe("public React TUI facade", () => {
  it("re-exports the common core facilities", () => {
    expect([
      AnsiCellSurface,
      MemoryCellSurface,
      SvgCellSurface,
      StyleTable,
      TerminalDriver,
      FrameClock,
      yogaLayoutEngine,
    ]).not.toContain(undefined);
  });

  it("renders through the standard terminal lifecycle", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const app = render(h(Text, null, "Hello"), { input, output });

    await tick();

    expect(output.chunks.join("")).toContain("Hello");
    expect(input.rawModes).toEqual([true]);
    app.destroy();
    expect(input.rawModes).toEqual([true, false]);
  });

  it("finishes passive-effect cleanup before destroy returns", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    let mounted = false;
    let cleanupCount = 0;

    function EffectfulApp() {
      useEffect(() => {
        mounted = true;
        return () => {
          cleanupCount += 1;
        };
      }, []);
      return h(Text, null, "Effectful");
    }

    const app = render(h(EffectfulApp), { input, output });
    await tick();
    expect(mounted).toBe(true);

    app.destroy();
    expect(cleanupCount).toBe(1);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);

    app.destroy();
    expect(cleanupCount).toBe(1);
    expect(input.rawModes).toEqual([true, false]);
  });

  it("rejects destroy from a passive effect without stopping the active app", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const errors: unknown[] = [];
    let cleanupCount = 0;
    let app: TuiReactApp;

    function ReentrantApp() {
      useEffect(() => {
        try {
          app.destroy();
        } catch (error) {
          errors.push(error);
        }
        return () => {
          cleanupCount += 1;
        };
      }, []);
      return h(Text, null, "Still active");
    }

    app = render(h(Text, null, "Initially active"), { input, output });
    await tick();
    app.render(h(ReentrantApp));
    await tick();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: expect.stringMatching(/queueMicrotask/),
    });
    expect(cleanupCount).toBe(0);
    expect(input.rawModes).toEqual([true]);
    expect(input.listeners.size).toBe(1);
    expect(output.listeners.size).toBe(1);
    expect(output.chunks.length).toBeGreaterThan(0);

    app.destroy();
    expect(cleanupCount).toBe(1);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);
  });

  it("stops the driver after host teardown fails, preserves that error, and permits retry", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    // Deliberately reuse the guard message: classification must use the stable
    // renderer error identity, never text matching.
    const hostError = new Error(
      "Cannot destroy a React renderer during React work; schedule destroy outside render, commit, or effects (for example with queueMicrotask)",
    );
    const driverError = new Error("terminal leave failed");
    let hostFailed = false;
    let driverFailed = false;

    const app = render(h(Text, null, "Cleanup"), { input, output });
    await tick();

    output.failWrite = (chunk) => {
      if (!hostFailed && chunk === "\x1b[0m\x1b[?25h") {
        hostFailed = true;
        return hostError;
      }
      if (hostFailed && !driverFailed) {
        driverFailed = true;
        return driverError;
      }
      return undefined;
    };

    let caught: unknown;
    try {
      app.destroy();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(hostError);
    expect(hostFailed).toBe(true);
    expect(driverFailed).toBe(true);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);
    expect(() => app.render(h(Text, null, "Too late"))).toThrow(
      /teardown has started/,
    );

    expect(() => app.destroy()).not.toThrow();
  });

  it("keeps the terminal reserved until failed host cleanup is retried by the next app", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const cleanupError = new Error("React surface reset failed");
    let blockCleanup = true;
    let cleanupAttempts = 0;
    output.failWrite = (chunk) => {
      if (chunk === "\x1b[0m\x1b[?25h") {
        cleanupAttempts += 1;
        if (blockCleanup) return cleanupError;
      }
      return undefined;
    };

    const app = render(h(Text, null, "Old React app"), { input, output });
    await tick();
    expect(() => app.destroy()).toThrow(cleanupError);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);

    let unexpectedReplacement: TuiReactApp | undefined;
    try {
      const beforeBlocked = {
        rawModes: [...input.rawModes],
        chunks: [...output.chunks],
        inputListeners: input.listeners.size,
        outputListeners: output.listeners.size,
      };
      let blockedError: unknown;
      try {
        unexpectedReplacement = render(h(Text, null, "Must not mount"), {
          input,
          output,
        });
      } catch (error) {
        blockedError = error;
      }
      expect(blockedError).toBe(cleanupError);
      expect({
        rawModes: input.rawModes,
        chunks: output.chunks,
        inputListeners: input.listeners.size,
        outputListeners: output.listeners.size,
      }).toEqual(beforeBlocked);

      blockCleanup = false;
      const replacement = render(h(Text, null, "Replacement"), {
        input,
        output,
      });
      await tick();
      expect(cleanupAttempts).toBe(3);
      const beforeStaleUse = {
        rawModes: [...input.rawModes],
        chunks: [...output.chunks],
        inputListeners: input.listeners.size,
        outputListeners: output.listeners.size,
      };
      app.destroy();
      expect(() => app.render(h(Text, null, "Stale render"))).toThrow(
        /teardown|destroyed/i,
      );
      expect(() => app.dispatchInput({ type: "text", text: "x" })).toThrow(
        /teardown|destroyed/i,
      );
      expect(() =>
        app.host.renderer.setRoot({ type: "text", text: "Stale renderer" }),
      ).toThrow(/teardown|destroy/i);
      expect(() => app.host.renderer.flush()).toThrow(/teardown|destroy/i);
      expect({
        rawModes: input.rawModes,
        chunks: output.chunks,
        inputListeners: input.listeners.size,
        outputListeners: output.listeners.size,
      }).toEqual(beforeStaleUse);

      replacement.destroy();
      expect(input.rawModes).toEqual([true, false, true, false]);
      expect(input.listeners.size).toBe(0);
      expect(output.listeners.size).toBe(0);
    } finally {
      blockCleanup = false;
      unexpectedReplacement?.destroy();
      app.destroy();
    }
  });

  it.each([
    ["raw-on", "raw-off"],
    ["resume", "pause"],
    ["data-on", "data-off"],
    ["resize-on", "resize-off"],
    ["enter", "leave"],
  ] as const)(
    "recovers a lost construction handle after %s acquisition and %s cleanup fail",
    async (acquireOperation, releaseOperation) => {
      const terminal = new FaultyTerminal();
      const acquisitionError = new Error(`${acquireOperation} failed`);
      const cleanupError = new Error(`${releaseOperation} failed`);
      let acquisitionFailed = false;
      let blockCleanup = true;
      terminal.fault = (operation) => {
        if (operation === acquireOperation && !acquisitionFailed) {
          acquisitionFailed = true;
          return acquisitionError;
        }
        if (operation === releaseOperation && blockCleanup) {
          return cleanupError;
        }
        return undefined;
      };

      let firstError: unknown;
      try {
        render(h(Text, null, "Never returned"), {
          input: terminal.input,
          output: terminal.output,
        });
      } catch (error) {
        firstError = error;
      }
      expect(firstError).toBe(acquisitionError);
      expect(terminal.raw).toBe(false);
      expect(terminal.resumed).toBe(false);
      expect(terminal.dataListeners.size).toBe(0);
      expect(terminal.resizeListeners.size).toBe(0);
      expect(terminal.entered).toBe(false);

      const acquisitionsBeforeBlockedRetry = terminal.acquisitionCounts();
      let retryError: unknown;
      try {
        render(h(Text, null, "Still blocked"), {
          input: terminal.input,
          output: terminal.output,
        });
      } catch (error) {
        retryError = error;
      }
      expect(retryError).toBe(cleanupError);
      expect(terminal.acquisitionCounts()).toEqual(
        acquisitionsBeforeBlockedRetry,
      );

      blockCleanup = false;
      const app = render(h(Text, null, "Recovered"), {
        input: terminal.input,
        output: terminal.output,
      });
      await tick();
      expect(terminal.raw).toBe(true);
      expect(terminal.resumed).toBe(true);
      expect(terminal.dataListeners.size).toBe(1);
      expect(terminal.resizeListeners.size).toBe(1);
      expect(terminal.entered).toBe(true);

      app.destroy();
      expect(terminal.raw).toBe(false);
      expect(terminal.resumed).toBe(false);
      expect(terminal.dataListeners.size).toBe(0);
      expect(terminal.resizeListeners.size).toBe(0);
      expect(terminal.entered).toBe(false);
    },
  );
});
