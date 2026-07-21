import { createElement as h } from "react";
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
  private readonly listeners = new Set<(chunk: Buffer) => void>();

  setRawMode(mode: boolean): void {
    this.rawModes.push(mode);
  }

  resume(): void {}
  pause(): void {}

  on(_event: "data", listener: (chunk: Buffer) => void): void {
    this.listeners.add(listener);
  }

  off(_event: "data", listener: (chunk: Buffer) => void): void {
    this.listeners.delete(listener);
  }
}

class FakeOutput implements TtyOutput {
  columns = 20;
  rows = 3;
  readonly chunks: string[] = [];
  private readonly listeners = new Set<() => void>();

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
});
