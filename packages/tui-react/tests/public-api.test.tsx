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
});
