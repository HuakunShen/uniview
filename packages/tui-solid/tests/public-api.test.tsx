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
  write(chunk: string): void {
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
