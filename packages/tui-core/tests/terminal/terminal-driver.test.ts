import { describe, expect, it, vi } from "vitest";
import { TerminalDriver } from "../../src/terminal/terminal-driver";
import type { TuiInputEvent } from "../../src/input/events";

/** A minimal fake TTY pair for driving the terminal driver in tests. */
function fakeTty(columns = 80, rows = 24) {
  const dataListeners = new Set<(chunk: Buffer) => void>();
  const resizeListeners = new Set<() => void>();
  const writes: string[] = [];
  let raw = false;

  const input = {
    isTTY: true as const,
    setRawMode: vi.fn((mode: boolean) => {
      raw = mode;
    }),
    resume: vi.fn(),
    pause: vi.fn(),
    on: (event: string, listener: (chunk: Buffer) => void) => {
      if (event === "data") dataListeners.add(listener);
    },
    off: (event: string, listener: (chunk: Buffer) => void) => {
      if (event === "data") dataListeners.delete(listener);
    },
  };

  const output = {
    columns,
    rows,
    write: (chunk: string) => writes.push(chunk),
    on: (event: string, listener: () => void) => {
      if (event === "resize") resizeListeners.add(listener);
    },
    off: (event: string, listener: () => void) => {
      if (event === "resize") resizeListeners.delete(listener);
    },
  };

  return {
    input,
    output,
    emitData: (s: string) => dataListeners.forEach((l) => l(Buffer.from(s, "utf8"))),
    emitResize: (c: number, r: number) => {
      output.columns = c;
      output.rows = r;
      resizeListeners.forEach((l) => l());
    },
    output_writes: () => writes.join(""),
    dataListenerCount: () => dataListeners.size,
    resizeListenerCount: () => resizeListeners.size,
    isRaw: () => raw,
  };
}

describe("TerminalDriver — lifecycle", () => {
  it("enters raw mode and emits the enter sequence on start", () => {
    const tty = fakeTty();
    const driver = new TerminalDriver({
      input: tty.input,
      output: tty.output,
      screen: "alternate",
      mouse: "click",
      onEvent: () => {},
    });
    driver.start();

    expect(tty.input.setRawMode).toHaveBeenCalledWith(true);
    expect(tty.isRaw()).toBe(true);
    const out = tty.output_writes();
    expect(out).toContain("\x1b[?1049h"); // enter alternate screen
    expect(out).toContain("\x1b[?1006h"); // SGR mouse
    expect(tty.dataListenerCount()).toBe(1);
    expect(tty.resizeListenerCount()).toBe(1);
  });

  it("restores the terminal and detaches on stop", () => {
    const tty = fakeTty();
    const driver = new TerminalDriver({
      input: tty.input,
      output: tty.output,
      screen: "alternate",
      mouse: "click",
      onEvent: () => {},
    });
    driver.start();
    driver.stop();

    const out = tty.output_writes();
    expect(out).toContain("\x1b[?1049l"); // leave alternate screen
    expect(out).toContain("\x1b[?1006l"); // disable SGR mouse
    expect(out).toContain("\x1b[?25h"); // show cursor
    expect(tty.isRaw()).toBe(false);
    expect(tty.dataListenerCount()).toBe(0);
    expect(tty.resizeListenerCount()).toBe(0);
  });

  it("is idempotent on stop", () => {
    const tty = fakeTty();
    const driver = new TerminalDriver({ input: tty.input, output: tty.output, onEvent: () => {} });
    driver.start();
    driver.stop();
    expect(() => driver.stop()).not.toThrow();
    expect(tty.input.setRawMode).toHaveBeenLastCalledWith(false);
  });

  it("throws if started twice", () => {
    const tty = fakeTty();
    const driver = new TerminalDriver({ input: tty.input, output: tty.output, onEvent: () => {} });
    driver.start();
    expect(() => driver.start()).toThrow();
  });
});

describe("TerminalDriver — input", () => {
  it("parses stdin data into normalized events", () => {
    const tty = fakeTty();
    const events: TuiInputEvent[] = [];
    const driver = new TerminalDriver({
      input: tty.input,
      output: tty.output,
      onEvent: (e) => events.push(e),
    });
    driver.start();

    tty.emitData("a");
    tty.emitData("\x1b[A");
    expect(events).toEqual([
      { type: "text", text: "a" },
      { type: "key", key: "ArrowUp", ctrl: false, alt: false, shift: false, meta: false },
    ]);
  });

  it("reassembles input split across chunks", () => {
    const tty = fakeTty();
    const events: TuiInputEvent[] = [];
    const driver = new TerminalDriver({
      input: tty.input,
      output: tty.output,
      onEvent: (e) => events.push(e),
    });
    driver.start();

    tty.emitData("\x1b[<0;12;4"); // partial mouse
    expect(events).toHaveLength(0);
    tty.emitData("M");
    expect(events).toEqual([
      { type: "mouse", action: "down", button: "left", x: 11, y: 3, ctrl: false, alt: false, shift: false },
    ]);
  });

  it("emits a resize event with the new size", () => {
    const tty = fakeTty(80, 24);
    const events: TuiInputEvent[] = [];
    const driver = new TerminalDriver({
      input: tty.input,
      output: tty.output,
      onEvent: (e) => events.push(e),
    });
    driver.start();

    tty.emitResize(100, 30);
    expect(events).toContainEqual({ type: "resize", width: 100, height: 30 });
    expect(driver.size).toEqual({ width: 100, height: 30 });
  });

  it("flushes a held lone Esc as an Escape key after the idle timeout", () => {
    vi.useFakeTimers();
    try {
      const tty = fakeTty();
      const events: TuiInputEvent[] = [];
      const driver = new TerminalDriver({
        input: tty.input,
        output: tty.output,
        escapeFlushMs: 20,
        onEvent: (e) => events.push(e),
      });
      driver.start();

      tty.emitData("\x1b");
      expect(events).toHaveLength(0); // held — ambiguous
      vi.advanceTimersByTime(25);
      expect(events).toEqual([
        { type: "key", key: "Escape", ctrl: false, alt: false, shift: false, meta: false },
      ]);
      driver.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves Esc immediately (no double-flush) when a sequence follows it", () => {
    vi.useFakeTimers();
    try {
      const tty = fakeTty();
      const events: TuiInputEvent[] = [];
      const driver = new TerminalDriver({
        input: tty.input,
        output: tty.output,
        escapeFlushMs: 20,
        onEvent: (e) => events.push(e),
      });
      driver.start();

      tty.emitData("\x1b"); // held, timer armed
      tty.emitData("\x1b[<0;3;3M"); // Esc keypress + a mouse report
      expect(events[0]).toMatchObject({ type: "key", key: "Escape" });
      expect(events[1]).toMatchObject({ type: "mouse" });
      vi.advanceTimersByTime(30);
      const escapes = events.filter((e) => e.type === "key" && e.key === "Escape");
      expect(escapes).toHaveLength(1); // the armed flush was cancelled, not fired
      driver.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
