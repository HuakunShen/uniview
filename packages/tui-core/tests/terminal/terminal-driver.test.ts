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
    emitData: (s: string) =>
      dataListeners.forEach((l) => l(Buffer.from(s, "utf8"))),
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

function captureError(callback: () => void): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error("Expected callback to throw");
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
    const driver = new TerminalDriver({
      input: tty.input,
      output: tty.output,
      onEvent: () => {},
    });
    driver.start();
    driver.stop();
    expect(() => driver.stop()).not.toThrow();
    expect(tty.input.setRawMode).toHaveBeenLastCalledWith(false);
  });

  it("throws if started twice", () => {
    const tty = fakeTty();
    const driver = new TerminalDriver({
      input: tty.input,
      output: tty.output,
      onEvent: () => {},
    });
    driver.start();
    expect(() => driver.start()).toThrow();
  });

  it("rolls back every terminal setup step that may have started before failure", () => {
    const rawModes: boolean[] = [];
    let resumeCount = 0;
    let pauseCount = 0;
    let inputOffCount = 0;
    let outputOffCount = 0;
    const writes: string[] = [];
    const startError = new Error("input listener failed");
    const driver = new TerminalDriver({
      input: {
        isTTY: true,
        setRawMode: (mode) => rawModes.push(mode),
        resume: () => {
          resumeCount += 1;
        },
        pause: () => {
          pauseCount += 1;
        },
        on: () => {
          throw startError;
        },
        off: () => {
          inputOffCount += 1;
        },
      },
      output: {
        write: (chunk) => writes.push(chunk),
        on: () => {},
        off: () => {
          outputOffCount += 1;
        },
      },
      onEvent: () => {},
    });

    expect(captureError(() => driver.start())).toBe(startError);
    expect(rawModes).toEqual([true, false]);
    expect(resumeCount).toBe(1);
    expect(pauseCount).toBe(1);
    // The listener acquisition may have attached before throwing, so rollback
    // must attempt the inverse even when this fake throws before side effects.
    expect(inputOffCount).toBe(1);
    expect(outputOffCount).toBe(0);
    expect(writes).toEqual([]);

    driver.stop();
    expect(rawModes).toEqual([true, false]);
    expect(pauseCount).toBe(1);
    expect(writes).toEqual([]);
  });

  const startSteps = [
    "raw mode",
    "input resume",
    "data listener",
    "resize listener",
    "enter sequence",
  ] as const;

  it.each(startSteps)(
    "rolls back a partially applied %s failure and can start again",
    (failedStep) => {
      const startError = new Error(`${failedStep} failed`);
      const dataListeners = new Set<(chunk: Uint8Array | string) => void>();
      const resizeListeners = new Set<() => void>();
      let raw = false;
      let resumed = false;
      let enteredAlternateScreen = false;
      let injected = false;

      const failAfterSideEffect = (step: (typeof startSteps)[number]): void => {
        if (failedStep === step && !injected) {
          injected = true;
          throw startError;
        }
      };

      const input = {
        isTTY: true,
        setRawMode: (mode: boolean) => {
          raw = mode;
          if (mode) failAfterSideEffect("raw mode");
        },
        resume: () => {
          resumed = true;
          failAfterSideEffect("input resume");
        },
        pause: () => {
          resumed = false;
        },
        on: (
          _event: "data",
          listener: (chunk: Uint8Array | string) => void,
        ) => {
          dataListeners.add(listener);
          failAfterSideEffect("data listener");
        },
        off: (
          _event: "data",
          listener: (chunk: Uint8Array | string) => void,
        ) => {
          dataListeners.delete(listener);
        },
      };
      const output = {
        write: (chunk: string) => {
          if (chunk.includes("\x1b[?1049h")) {
            enteredAlternateScreen = true;
            failAfterSideEffect("enter sequence");
          }
          if (chunk.includes("\x1b[?1049l")) enteredAlternateScreen = false;
        },
        on: (_event: "resize", listener: () => void) => {
          resizeListeners.add(listener);
          failAfterSideEffect("resize listener");
        },
        off: (_event: "resize", listener: () => void) => {
          resizeListeners.delete(listener);
        },
      };
      const driver = new TerminalDriver({ input, output, onEvent: () => {} });

      expect(captureError(() => driver.start())).toBe(startError);
      expect({
        raw,
        resumed,
        dataListeners: dataListeners.size,
        resizeListeners: resizeListeners.size,
        enteredAlternateScreen,
      }).toEqual({
        raw: false,
        resumed: false,
        dataListeners: 0,
        resizeListeners: 0,
        enteredAlternateScreen: false,
      });

      expect(() => driver.start()).not.toThrow();
      expect({
        raw,
        resumed,
        dataListeners: dataListeners.size,
        resizeListeners: resizeListeners.size,
        enteredAlternateScreen,
      }).toEqual({
        raw: true,
        resumed: true,
        dataListeners: 1,
        resizeListeners: 1,
        enteredAlternateScreen: true,
      });
      driver.stop();
    },
  );

  const stopSteps = [
    "leave sequence",
    "data listener",
    "resize listener",
    "raw mode",
    "input pause",
  ] as const;

  it.each(stopSteps)(
    "isolates and retries a failed %s release without repeating successful releases",
    (failedStep) => {
      const stopError = new Error(`${failedStep} failed`);
      const dataListeners = new Set<(chunk: Uint8Array | string) => void>();
      const resizeListeners = new Set<() => void>();
      const releaseCalls = new Map<(typeof stopSteps)[number], number>();
      let raw = false;
      let resumed = false;
      let enteredAlternateScreen = false;
      let injectStopFailure = false;
      let injected = false;

      const release = (step: (typeof stopSteps)[number]): void => {
        releaseCalls.set(step, (releaseCalls.get(step) ?? 0) + 1);
        if (injectStopFailure && failedStep === step && !injected) {
          injected = true;
          throw stopError;
        }
      };

      const input = {
        isTTY: true,
        setRawMode: (mode: boolean) => {
          raw = mode;
          if (!mode) release("raw mode");
        },
        resume: () => {
          resumed = true;
        },
        pause: () => {
          resumed = false;
          release("input pause");
        },
        on: (
          _event: "data",
          listener: (chunk: Uint8Array | string) => void,
        ) => {
          dataListeners.add(listener);
        },
        off: (
          _event: "data",
          listener: (chunk: Uint8Array | string) => void,
        ) => {
          dataListeners.delete(listener);
          release("data listener");
        },
      };
      const output = {
        write: (chunk: string) => {
          if (chunk.includes("\x1b[?1049h")) enteredAlternateScreen = true;
          if (chunk.includes("\x1b[?1049l")) {
            enteredAlternateScreen = false;
            release("leave sequence");
          }
        },
        on: (_event: "resize", listener: () => void) => {
          resizeListeners.add(listener);
        },
        off: (_event: "resize", listener: () => void) => {
          resizeListeners.delete(listener);
          release("resize listener");
        },
      };
      const driver = new TerminalDriver({ input, output, onEvent: () => {} });
      driver.start();
      injectStopFailure = true;

      expect(captureError(() => driver.stop())).toBe(stopError);
      expect({
        raw,
        resumed,
        dataListeners: dataListeners.size,
        resizeListeners: resizeListeners.size,
        enteredAlternateScreen,
      }).toEqual({
        raw: false,
        resumed: false,
        dataListeners: 0,
        resizeListeners: 0,
        enteredAlternateScreen: false,
      });
      for (const step of stopSteps) {
        expect(releaseCalls.get(step)).toBe(1);
      }

      expect(() => driver.start()).toThrow(/started|cleanup/i);
      expect(() => driver.stop()).not.toThrow();
      for (const step of stopSteps) {
        expect(releaseCalls.get(step)).toBe(step === failedStep ? 2 : 1);
      }

      driver.stop();
      for (const step of stopSteps) {
        expect(releaseCalls.get(step)).toBe(step === failedStep ? 2 : 1);
      }
    },
  );

  it("preserves the startup error while isolating rollback failures", () => {
    const startError = new Error("enter failed");
    const cleanupErrors = stopSteps.map(
      (step) => new Error(`${step} rollback failed`),
    );
    const cleanupAttempts = new Map<(typeof stopSteps)[number], number>();
    let raw = false;
    let resumed = false;
    let dataAttached = false;
    let resizeAttached = false;
    let enteredAlternateScreen = false;
    let failCleanup = true;

    const cleanup = (step: (typeof stopSteps)[number]): void => {
      cleanupAttempts.set(step, (cleanupAttempts.get(step) ?? 0) + 1);
      if (failCleanup) throw cleanupErrors[stopSteps.indexOf(step)];
    };

    const driver = new TerminalDriver({
      input: {
        isTTY: true,
        setRawMode: (mode) => {
          raw = mode;
          if (!mode) cleanup("raw mode");
        },
        resume: () => {
          resumed = true;
        },
        pause: () => {
          resumed = false;
          cleanup("input pause");
        },
        on: () => {
          dataAttached = true;
        },
        off: () => {
          dataAttached = false;
          cleanup("data listener");
        },
      },
      output: {
        write: (chunk) => {
          if (chunk.includes("\x1b[?1049h")) {
            enteredAlternateScreen = true;
            throw startError;
          }
          if (chunk.includes("\x1b[?1049l")) {
            enteredAlternateScreen = false;
            cleanup("leave sequence");
          }
        },
        on: () => {
          resizeAttached = true;
        },
        off: () => {
          resizeAttached = false;
          cleanup("resize listener");
        },
      },
      onEvent: () => {},
    });

    expect(captureError(() => driver.start())).toBe(startError);
    expect({
      raw,
      resumed,
      dataAttached,
      resizeAttached,
      enteredAlternateScreen,
    }).toEqual({
      raw: false,
      resumed: false,
      dataAttached: false,
      resizeAttached: false,
      enteredAlternateScreen: false,
    });
    for (const step of stopSteps) expect(cleanupAttempts.get(step)).toBe(1);
    expect(() => driver.start()).toThrow(/started|cleanup/i);

    failCleanup = false;
    expect(() => driver.stop()).not.toThrow();
    for (const step of stopSteps) expect(cleanupAttempts.get(step)).toBe(2);
    expect(() => driver.stop()).not.toThrow();
    for (const step of stopSteps) expect(cleanupAttempts.get(step)).toBe(2);
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
      {
        type: "key",
        key: "ArrowUp",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      },
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
      {
        type: "mouse",
        action: "down",
        button: "left",
        x: 11,
        y: 3,
        ctrl: false,
        alt: false,
        shift: false,
      },
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
        {
          type: "key",
          key: "Escape",
          ctrl: false,
          alt: false,
          shift: false,
          meta: false,
        },
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
      const escapes = events.filter(
        (e) => e.type === "key" && e.key === "Escape",
      );
      expect(escapes).toHaveLength(1); // the armed flush was cancelled, not fired
      driver.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
