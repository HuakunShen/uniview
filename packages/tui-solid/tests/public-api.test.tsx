import { describe, expect, it } from "vitest";
import { onCleanup } from "solid-js";
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
  render,
  yogaLayoutEngine,
} from "../src/index";

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
});
