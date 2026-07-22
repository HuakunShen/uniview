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
  }
  on(_event: "resize", listener: () => void): void {
    this.listeners.add(listener);
  }
  off(_event: "resize", listener: () => void): void {
    this.listeners.delete(listener);
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
    output.leaveWriteFailuresRemaining = 1;

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

    app.destroy();
    app.destroy();
    expect(output.leaveWriteAttempts).toBe(2);
    expect(output.successfulLeaveWrites).toBe(1);
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
    replacement.destroy();

    expect(output.leaveWriteAttempts).toBe(3);
    expect(output.successfulLeaveWrites).toBe(2);
    expect(input.rawModes).toEqual([true, false, true, false]);
    expect(input.resumeCount).toBe(2);
    expect(input.pauseCount).toBe(2);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);
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
});
