import { describe, expect, it } from "vitest";
import { createSignal, onCleanup } from "solid-js";
import type { TtyInput, TtyOutput } from "@uniview/tui-core";
import { getRootNode } from "@uniview/solid-renderer";
import {
  AnsiCellSurface,
  FrameClock,
  MemoryCellSurface,
  StyleTable,
  SvgCellSurface,
  TerminalDriver,
  Text,
  createTuiSolidRoot,
  getActiveTuiClock,
  render,
  yogaLayoutEngine,
} from "../src/index";

import { tick } from "./tick";

class FakeInput implements TtyInput {
  isTTY = true;
  readonly rawModes: boolean[] = [];
  readonly listeners = new Set<(chunk: Uint8Array | string) => void>();
  resumeCount = 0;
  pauseCount = 0;
  setRawMode(mode: boolean): void {
    this.rawModes.push(mode);
  }
  resume(): void {
    this.resumeCount += 1;
  }
  pause(): void {
    this.pauseCount += 1;
  }
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
  leaveWriteAttempts = 0;
  successfulLeaveWrites = 0;
  leaveWriteFailuresRemaining = 0;
  failWrite: ((chunk: string) => Error | undefined) | undefined;
  write(chunk: string): void {
    if (chunk.includes("\x1b[?1049l")) {
      this.leaveWriteAttempts += 1;
      if (this.leaveWriteFailuresRemaining > 0) {
        this.leaveWriteFailuresRemaining -= 1;
        throw new Error("leave write failed");
      }
      this.successfulLeaveWrites += 1;
    }
    this.chunks.push(chunk);
    const error = this.failWrite?.(chunk);
    if (error) throw error;
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
    const operations: readonly TerminalOperation[] = [
      "raw-on",
      "resume",
      "data-on",
      "resize-on",
      "enter",
    ];
    return operations.map((operation) => this.counts.get(operation) ?? 0);
  }
}

describe("public Solid TUI facade", () => {
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

  it("renders through the standard terminal lifecycle", () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const app = render(() => <Text>Hello</Text>, { input, output });
    expect(output.chunks.join("")).toContain("Hello");
    expect(output.chunks[0]).not.toContain("Hello");
    expect(output.chunks[1]).toContain("Hello");
    expect(input.rawModes).toEqual([true]);
    app.destroy();
    expect(input.rawModes).toEqual([true, false]);
  });

  it("stops the driver when the initial app mount throws", () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const error = new Error("initial mount failed");
    let cleanupCount = 0;

    expect(() =>
      render(
        () => {
          onCleanup(() => {
            cleanupCount += 1;
          });
          throw error;
        },
        { input, output },
      ),
    ).toThrow(error);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);
    expect(cleanupCount).toBe(1);
    expect(getRootNode()).toBeNull();
  });

  it("stops the driver when a replacement app mount throws", () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const error = new Error("replacement mount failed");
    const app = render(() => <Text>First</Text>, { input, output });
    let replacement: ReturnType<typeof render> | null = null;

    try {
      let caught: unknown;
      try {
        app.render(() => {
          throw error;
        });
      } catch (renderError) {
        caught = renderError;
      }

      expect(caught).toBe(error);
      expect(input.rawModes).toEqual([true, false]);
      expect(input.resumeCount).toBe(1);
      expect(input.pauseCount).toBe(1);
      expect(input.listeners.size).toBe(0);
      expect(output.listeners.size).toBe(0);
      expect(getRootNode()).toBeNull();

      replacement = render(() => <Text>Replacement</Text>, { input, output });
      expect(input.rawModes).toEqual([true, false, true]);
      expect(input.listeners.size).toBe(1);
      expect(output.listeners.size).toBe(1);
      expect(output.chunks.join("")).toContain("Replacement");
    } finally {
      replacement?.destroy();
      app.destroy();
    }

    expect(input.rawModes).toEqual([true, false, true, false]);
    expect(input.resumeCount).toBe(2);
    expect(input.pauseCount).toBe(2);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);
  });

  it("preserves a replacement mount error and retries failed driver cleanup", () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const error = new Error("replacement mount failed");
    const app = render(() => <Text>First</Text>, { input, output });
    output.leaveWriteFailuresRemaining = 2;

    let caught: unknown;
    try {
      app.render(() => {
        throw error;
      });
    } catch (renderError) {
      caught = renderError;
    }

    expect(caught).toBe(error);
    expect(output.leaveWriteAttempts).toBe(1);
    expect(output.successfulLeaveWrites).toBe(0);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.resumeCount).toBe(1);
    expect(input.pauseCount).toBe(1);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);

    const enterWritesBeforeRejectedOwner = output.chunks.filter((chunk) =>
      chunk.includes("\x1b[?1049h"),
    ).length;
    expect(() =>
      render(() => <Text>Still blocked</Text>, { input, output }),
    ).toThrow(/leave write failed/);
    expect(output.leaveWriteAttempts).toBe(2);
    expect(output.successfulLeaveWrites).toBe(0);
    expect(
      output.chunks.filter((chunk) => chunk.includes("\x1b[?1049h")),
    ).toHaveLength(enterWritesBeforeRejectedOwner);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.resumeCount).toBe(1);
    expect(input.pauseCount).toBe(1);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);

    const replacement = render(() => <Text>Replacement</Text>, {
      input,
      output,
    });
    expect(input.rawModes).toEqual([true, false, true]);
    expect(input.listeners.size).toBe(1);
    expect(output.listeners.size).toBe(1);
    expect(output.chunks.join("")).toContain("Replacement");

    const leaveAttemptsBeforeLostHandleDestroy = output.leaveWriteAttempts;
    app.destroy();
    app.destroy();
    expect(output.leaveWriteAttempts).toBe(
      leaveAttemptsBeforeLostHandleDestroy,
    );
    expect(input.rawModes).toEqual([true, false, true]);
    expect(input.listeners.size).toBe(1);
    expect(output.listeners.size).toBe(1);

    replacement.destroy();

    expect(output.leaveWriteAttempts).toBe(4);
    expect(output.successfulLeaveWrites).toBe(2);
    expect(input.rawModes).toEqual([true, false, true, false]);
    expect(input.resumeCount).toBe(2);
    expect(input.pauseCount).toBe(2);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);
  });

  it("preserves the root cleanup error while also retrying terminal cleanup", () => {
    const terminal = new FaultyTerminal();
    const rootError = new Error("Solid disposer failed");
    const driverError = new Error("terminal leave failed");
    let blockRootCleanup = true;
    let blockDriverCleanup = true;
    let rootCleanupAttempts = 0;
    terminal.fault = (operation) => {
      if (operation === "leave" && blockDriverCleanup) return driverError;
      return undefined;
    };

    const app = render(
      () => {
        onCleanup(() => {
          rootCleanupAttempts += 1;
          if (blockRootCleanup) throw rootError;
        });
        return <Text>Double cleanup failure</Text>;
      },
      { input: terminal.input, output: terminal.output },
    );

    let firstError: unknown;
    try {
      app.destroy();
    } catch (error) {
      firstError = error;
    }
    const firstAttempt = {
      rootCleanupAttempts,
      leaveAttempts: terminal.counts.get("leave") ?? 0,
      raw: terminal.raw,
      resumed: terminal.resumed,
      dataListeners: terminal.dataListeners.size,
      resizeListeners: terminal.resizeListeners.size,
    };

    blockRootCleanup = false;
    blockDriverCleanup = false;
    app.destroy();
    const recoveredCleanup = {
      rootCleanupAttempts,
      leaveAttempts: terminal.counts.get("leave") ?? 0,
      raw: terminal.raw,
      resumed: terminal.resumed,
      dataListeners: terminal.dataListeners.size,
      resizeListeners: terminal.resizeListeners.size,
    };

    const replacement = render(() => <Text>Replacement</Text>, {
      input: terminal.input,
      output: terminal.output,
    });
    const beforeStaleDestroy = {
      raw: terminal.raw,
      resumed: terminal.resumed,
      dataListeners: terminal.dataListeners.size,
      resizeListeners: terminal.resizeListeners.size,
      leaveAttempts: terminal.counts.get("leave") ?? 0,
    };
    app.destroy();
    const afterStaleDestroy = {
      raw: terminal.raw,
      resumed: terminal.resumed,
      dataListeners: terminal.dataListeners.size,
      resizeListeners: terminal.resizeListeners.size,
      leaveAttempts: terminal.counts.get("leave") ?? 0,
    };
    replacement.destroy();

    expect(firstError).toBe(rootError);
    expect(firstAttempt).toEqual({
      rootCleanupAttempts: 1,
      leaveAttempts: 1,
      raw: false,
      resumed: false,
      dataListeners: 0,
      resizeListeners: 0,
    });
    expect(recoveredCleanup).toEqual({
      rootCleanupAttempts: 2,
      leaveAttempts: 2,
      raw: false,
      resumed: false,
      dataListeners: 0,
      resizeListeners: 0,
    });
    expect(afterStaleDestroy).toEqual(beforeStaleDestroy);
    expect(terminal.raw).toBe(false);
    expect(terminal.resumed).toBe(false);
    expect(terminal.dataListeners.size).toBe(0);
    expect(terminal.resizeListeners.size).toBe(0);
  });

  it("throws a driver-only cleanup error and retries the pending terminal release", () => {
    const terminal = new FaultyTerminal();
    const driverError = new Error("driver-only leave failed");
    let blockDriverCleanup = true;
    let rootCleanupAttempts = 0;
    terminal.fault = (operation) => {
      if (operation === "leave" && blockDriverCleanup) return driverError;
      return undefined;
    };

    const app = render(
      () => {
        onCleanup(() => {
          rootCleanupAttempts += 1;
        });
        return <Text>Driver-only cleanup</Text>;
      },
      { input: terminal.input, output: terminal.output },
    );

    let firstError: unknown;
    try {
      app.destroy();
    } catch (error) {
      firstError = error;
    }
    expect(firstError).toBe(driverError);
    expect(rootCleanupAttempts).toBe(1);
    expect(terminal.counts.get("leave")).toBe(1);
    expect(terminal.raw).toBe(false);
    expect(terminal.resumed).toBe(false);
    expect(terminal.dataListeners.size).toBe(0);
    expect(terminal.resizeListeners.size).toBe(0);

    blockDriverCleanup = false;
    app.destroy();
    expect(rootCleanupAttempts).toBe(1);
    expect(terminal.counts.get("leave")).toBe(2);

    const replacement = render(() => <Text>Replacement</Text>, {
      input: terminal.input,
      output: terminal.output,
    });
    const beforeStaleDestroy = {
      raw: terminal.raw,
      resumed: terminal.resumed,
      dataListeners: terminal.dataListeners.size,
      resizeListeners: terminal.resizeListeners.size,
      leaveAttempts: terminal.counts.get("leave") ?? 0,
    };
    app.destroy();
    expect({
      raw: terminal.raw,
      resumed: terminal.resumed,
      dataListeners: terminal.dataListeners.size,
      resizeListeners: terminal.resizeListeners.size,
      leaveAttempts: terminal.counts.get("leave") ?? 0,
    }).toEqual(beforeStaleDestroy);

    replacement.destroy();
    expect(terminal.raw).toBe(false);
    expect(terminal.resumed).toBe(false);
    expect(terminal.dataListeners.size).toBe(0);
    expect(terminal.resizeListeners.size).toBe(0);
  });

  it("rejects a second terminal app before starting its driver", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const first = createTuiSolidRoot({
      surface,
      styles,
      size: { width: 20, height: 3 },
    });
    let setCount: ((value: number) => number) | undefined;
    first.render(() => {
      const [count, updateCount] = createSignal(0);
      setCount = updateCount;
      return <text>{`First: ${count()}`}</text>;
    });

    try {
      const input = new FakeInput();
      const output = new FakeOutput();
      expect(() =>
        render(() => <Text>Second</Text>, { input, output }),
      ).toThrow(/another TUI Solid root is active/i);
      expect(input.rawModes).toEqual([]);
      expect(input.resumeCount).toBe(0);
      expect(input.pauseCount).toBe(0);
      expect(input.listeners.size).toBe(0);
      expect(output.listeners.size).toBe(0);
      expect(output.chunks).toEqual([]);

      setCount?.(1);
      await tick();
      expect(surface.text({ trimRight: true })).toContain("First: 1");
      expect(getRootNode()).not.toBeNull();
      expect(getActiveTuiClock()).toBe(first.clock);
    } finally {
      first.destroy();
    }
  });

  it("rejects a competing terminal app before touching its active owner's streams", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    let setCount: ((value: number) => number) | undefined;
    const first = render(
      () => {
        const [count, updateCount] = createSignal(0);
        setCount = updateCount;
        return <Text>{`First: ${count()}`}</Text>;
      },
      { input, output },
    );

    try {
      const beforeCompetition = {
        rawModes: [...input.rawModes],
        resumeCount: input.resumeCount,
        pauseCount: input.pauseCount,
        inputListeners: input.listeners.size,
        outputListeners: output.listeners.size,
        chunks: [...output.chunks],
      };

      expect(() =>
        render(() => <Text>Second</Text>, { input, output }),
      ).toThrow(/another TUI Solid root is active/i);
      expect({
        rawModes: input.rawModes,
        resumeCount: input.resumeCount,
        pauseCount: input.pauseCount,
        inputListeners: input.listeners.size,
        outputListeners: output.listeners.size,
        chunks: output.chunks,
      }).toEqual(beforeCompetition);

      setCount?.(1);
      await tick();
      expect(output.chunks.length).toBeGreaterThan(
        beforeCompetition.chunks.length,
      );
      expect(output.chunks.at(-1)).toContain("1");
      expect(input.rawModes).toEqual([true]);
      expect(input.resumeCount).toBe(1);
      expect(input.pauseCount).toBe(0);
      expect(input.listeners.size).toBe(1);
      expect(output.listeners.size).toBe(1);

      first.destroy();
      first.destroy();
      expect(input.rawModes).toEqual([true, false]);
      expect(input.resumeCount).toBe(1);
      expect(input.pauseCount).toBe(1);
      expect(input.listeners.size).toBe(0);
      expect(output.listeners.size).toBe(0);
    } finally {
      first.destroy();
    }
  });

  it("releases its ownership reservation when terminal startup fails", () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const startError = new Error("input listener failed");
    input.on = () => {
      throw startError;
    };

    expect(() =>
      render(() => <Text>Never mounted</Text>, { input, output }),
    ).toThrow(startError);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.resumeCount).toBe(1);
    expect(input.pauseCount).toBe(1);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);
    expect(output.chunks).toEqual([]);

    const replacementInput = new FakeInput();
    const replacementOutput = new FakeOutput();
    const replacement = render(() => <Text>Replacement</Text>, {
      input: replacementInput,
      output: replacementOutput,
    });
    expect(replacementOutput.chunks.join("")).toContain("Replacement");
    replacement.destroy();
  });

  it.each([
    ["raw-on", "raw-off"],
    ["resume", "pause"],
    ["data-on", "data-off"],
    ["resize-on", "resize-off"],
    ["enter", "leave"],
  ] as const)(
    "recovers a lost construction handle after %s acquisition and %s cleanup fail",
    (acquireOperation, releaseOperation) => {
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
        render(() => <Text>Never returned</Text>, {
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
        render(() => <Text>Still blocked</Text>, {
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
      const app = render(() => <Text>Recovered</Text>, {
        input: terminal.input,
        output: terminal.output,
      });
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

  it("recovers a lost root when initial output and its disposer both fail", () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const syncError = new Error("initial sync output failed");
    const cleanupError = new Error("initial disposer failed");
    let failInitialSync = true;
    let blockCleanup = true;
    let cleanupAttempts = 0;
    output.failWrite = (chunk) => {
      if (failInitialSync && chunk.includes("Lost root")) {
        failInitialSync = false;
        return syncError;
      }
      return undefined;
    };

    let initialError: unknown;
    try {
      render(
        () => {
          onCleanup(() => {
            cleanupAttempts += 1;
            if (blockCleanup) throw cleanupError;
          });
          return <Text>Lost root</Text>;
        },
        { input, output },
      );
    } catch (error) {
      initialError = error;
    }
    expect(initialError).toBe(syncError);
    expect(cleanupAttempts).toBe(1);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);

    const blockedInput = new FakeInput();
    const blockedOutput = new FakeOutput();
    let retryError: unknown;
    try {
      render(() => <Text>Still blocked</Text>, {
        input: blockedInput,
        output: blockedOutput,
      });
    } catch (error) {
      retryError = error;
    }
    expect(retryError).toBe(cleanupError);
    expect(cleanupAttempts).toBe(2);
    expect(blockedInput.rawModes).toEqual([]);
    expect(blockedInput.resumeCount).toBe(0);
    expect(blockedInput.pauseCount).toBe(0);
    expect(blockedInput.listeners.size).toBe(0);
    expect(blockedOutput.listeners.size).toBe(0);
    expect(blockedOutput.chunks).toEqual([]);

    blockCleanup = false;
    const replacementInput = new FakeInput();
    const replacementOutput = new FakeOutput();
    const replacement = render(() => <Text>Recovered root</Text>, {
      input: replacementInput,
      output: replacementOutput,
    });
    expect(cleanupAttempts).toBe(3);
    expect(replacementOutput.chunks.join("")).toContain("Recovered root");
    expect(replacementInput.rawModes).toEqual([true]);
    expect(replacementInput.listeners.size).toBe(1);
    expect(replacementOutput.listeners.size).toBe(1);

    replacement.destroy();
    expect(replacementInput.rawModes).toEqual([true, false]);
    expect(replacementInput.listeners.size).toBe(0);
    expect(replacementOutput.listeners.size).toBe(0);
  });
});
