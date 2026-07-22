import { describe, expect, it } from "vitest";
import { createElement as h, useEffect, useState } from "react";
import { isReactReentrantUnmountError } from "@uniview/react-renderer";
import {
  MemoryCellSurface,
  StyleTable,
  type TuiInputEvent,
  type TtyInput,
  type TtyOutput,
} from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Box, Button, Text, createTuiRoot, type TuiRoot } from "../src/compat";

import { tick } from "./tick";
const key = (k: string): TuiInputEvent => ({
  type: "key",
  key: k,
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
});

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

// A counter written against the OLD @uniview/tui-renderer component API.
function LegacyApp() {
  const [count, setCount] = useState(0);
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { color: "cyan", bold: true }, "Compat Demo"),
    h(Text, null, `Count: ${count}`),
    h(Button, { onPress: () => setCount((c) => c + 1) }, "Increment"),
  );
}

describe("compat facade", () => {
  it("renders legacy Box/Text/Button on the new stack", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({
      surface,
      styles,
      size: { width: 24, height: 4 },
    });
    root.render(h(LegacyApp));
    await tick();

    const text = surface.text({ trimRight: true });
    expect(text).toContain("Compat Demo");
    expect(text).toContain("Count: 0");
    expect(text).toContain("[ Increment ]");
    root.destroy();
  });

  it("activates a legacy Button via keyboard", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({
      surface,
      styles,
      size: { width: 24, height: 4 },
    });
    root.render(h(LegacyApp));
    await tick();

    root.dispatchInput(key("Tab")); // focus the button (only focusable)
    root.dispatchInput(key("Enter"));
    await tick();

    expect(surface.text({ trimRight: true })).toContain("Count: 1");
    root.destroy();
  });

  it("stops the terminal after an ordinary root teardown error and preserves that error", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    // Deliberately reuse the re-entrant guard text. Compatibility teardown must
    // classify by the renderer's stable error type, never by the message.
    const rootError = new Error(
      "Cannot destroy a React renderer during React work; schedule destroy outside render, commit, or effects (for example with queueMicrotask)",
    );
    const driverError = new Error("compat terminal leave failed");
    let rootFailed = false;
    let driverFailed = false;

    const root = createTuiRoot({ input, output });
    root.render(h(Text, null, "Compat cleanup"));
    await tick();
    output.failWrite = (chunk) => {
      if (!rootFailed && chunk === "\x1b[0m\x1b[?25h") {
        rootFailed = true;
        return rootError;
      }
      if (rootFailed && !driverFailed && chunk.includes("\x1b[?1049l")) {
        driverFailed = true;
        return driverError;
      }
      return undefined;
    };

    let firstError: unknown;
    try {
      root.destroy();
    } catch (error) {
      firstError = error;
    }
    const firstAttempt = {
      rootFailed,
      driverFailed,
      rawModes: [...input.rawModes],
      resumeCount: input.resumeCount,
      pauseCount: input.pauseCount,
      inputListeners: input.listeners.size,
      outputListeners: output.listeners.size,
    };

    let retryError: unknown;
    try {
      root.destroy();
    } catch (error) {
      retryError = error;
    }
    // Ensure the RED implementation also releases its delayed driver failure,
    // so a failed assertion cannot contaminate the rest of the file.
    root.destroy();

    const replacement = createTuiRoot({ input, output });
    replacement.render(h(Text, null, "Replacement"));
    await tick();
    const beforeStaleDestroy = {
      rawModes: [...input.rawModes],
      inputListeners: input.listeners.size,
      outputListeners: output.listeners.size,
    };
    root.destroy();
    const afterStaleDestroy = {
      rawModes: [...input.rawModes],
      inputListeners: input.listeners.size,
      outputListeners: output.listeners.size,
    };
    replacement.destroy();

    expect(firstError).toBe(rootError);
    expect(firstAttempt).toEqual({
      rootFailed: true,
      driverFailed: true,
      rawModes: [true, false],
      resumeCount: 1,
      pauseCount: 1,
      inputListeners: 0,
      outputListeners: 0,
    });
    expect(retryError).toBeUndefined();
    expect(afterStaleDestroy).toEqual(beforeStaleDestroy);
    expect(input.rawModes).toEqual([true, false, true, false]);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);
  });

  it("keeps the terminal live after a re-entrant destroy and permits a later retry", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const errors: unknown[] = [];
    let root: TuiRoot;

    function ReentrantDestroy() {
      useEffect(() => {
        try {
          root.destroy();
        } catch (error) {
          errors.push(error);
        }
      }, []);
      return h(Text, null, "Still live");
    }

    root = createTuiRoot({ input, output });
    root.render(h(ReentrantDestroy));
    await tick();

    expect(errors).toHaveLength(1);
    expect(isReactReentrantUnmountError(errors[0])).toBe(true);
    expect(input.rawModes).toEqual([true]);
    expect(input.resumeCount).toBe(1);
    expect(input.pauseCount).toBe(0);
    expect(input.listeners.size).toBe(1);
    expect(output.listeners.size).toBe(1);

    root.destroy();
    expect(input.rawModes).toEqual([true, false]);
    expect(input.pauseCount).toBe(1);
    expect(input.listeners.size).toBe(0);
    expect(output.listeners.size).toBe(0);
  });
});
