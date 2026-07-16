import { describe, expect, it } from "vitest";
import { TerminalDriver, buildLeaveSequence, DEFAULT_MODE_OPTIONS } from "../src/index";
import type { TtyInput, TtyOutput } from "../src/index";
import { installCrashGuard, withTerminalRestore, type ProcessLike } from "../src/terminal/crash-guard";

function fakeTty() {
  const writes: string[] = [];
  let raw = false;
  const input: TtyInput = {
    isTTY: true,
    setRawMode: (m) => {
      raw = m;
    },
    resume: () => {},
    pause: () => {},
    on: () => {},
    off: () => {},
  };
  const output: TtyOutput = {
    columns: 80,
    rows: 24,
    write: (chunk) => writes.push(chunk),
    on: () => {},
    off: () => {},
  };
  return { input, output, writes, getRaw: () => raw };
}

describe("withTerminalRestore", () => {
  it("restores the terminal when the render fn throws, then rethrows", () => {
    const tty = fakeTty();
    const driver = new TerminalDriver({ input: tty.input, output: tty.output, onEvent: () => {} });
    driver.start();

    expect(() =>
      withTerminalRestore(driver, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(tty.writes.join("")).toContain(buildLeaveSequence(DEFAULT_MODE_OPTIONS));
    expect(tty.getRaw()).toBe(false); // raw mode restored
  });

  it("returns the value and leaves the terminal running on success", () => {
    const tty = fakeTty();
    const driver = new TerminalDriver({ input: tty.input, output: tty.output, onEvent: () => {} });
    driver.start();
    expect(withTerminalRestore(driver, () => 42)).toBe(42);
    expect(tty.getRaw()).toBe(true); // still running
  });
});

describe("installCrashGuard", () => {
  it("tears down on uncaughtException, rethrows, and uninstalls cleanly", () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const proc: ProcessLike = {
      on: (event, listener) => void (listeners[event] ??= []).push(listener),
      off: (event, listener) =>
        void (listeners[event] = (listeners[event] ?? []).filter((l) => l !== listener)),
    };
    let torn = 0;
    const uninstall = installCrashGuard(() => {
      torn += 1;
    }, proc);

    expect(() => listeners.uncaughtException[0]!(new Error("x"))).toThrow("x");
    expect(torn).toBe(1);

    uninstall();
    expect(listeners.uncaughtException).toEqual([]);
    expect(listeners.unhandledRejection).toEqual([]);
  });
});
