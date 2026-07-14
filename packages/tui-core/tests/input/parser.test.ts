import { describe, expect, it } from "vitest";
import { InputParser } from "../../src/input/parser";
import type { TuiInputEvent } from "../../src/input/events";

function parse(...chunks: string[]): TuiInputEvent[] {
  const parser = new InputParser();
  for (const chunk of chunks) parser.push(Buffer.from(chunk, "utf8"));
  return parser.takeEvents();
}

describe("InputParser — text", () => {
  it("emits a text event for a printable character", () => {
    expect(parse("a")).toEqual([{ type: "text", text: "a" }]);
  });

  it("reassembles a UTF-8 character split across chunks", () => {
    const buf = Buffer.from("中", "utf8");
    const parser = new InputParser();
    parser.push(buf.subarray(0, 1));
    parser.push(buf.subarray(1));
    expect(parser.takeEvents()).toEqual([{ type: "text", text: "中" }]);
  });
});

describe("InputParser — keys", () => {
  it("parses CSI arrow keys", () => {
    expect(parse("\x1b[A")).toEqual([key("ArrowUp")]);
    expect(parse("\x1b[B")).toEqual([key("ArrowDown")]);
    expect(parse("\x1b[C")).toEqual([key("ArrowRight")]);
    expect(parse("\x1b[D")).toEqual([key("ArrowLeft")]);
  });

  it("parses SS3 arrow keys", () => {
    expect(parse("\x1bOA")).toEqual([key("ArrowUp")]);
  });

  it("parses Home/End/Delete via CSI tilde", () => {
    expect(parse("\x1b[3~")).toEqual([key("Delete")]);
    expect(parse("\x1b[H")).toEqual([key("Home")]);
    expect(parse("\x1b[F")).toEqual([key("End")]);
  });

  it("parses Enter, Tab, Backspace and Escape", () => {
    expect(parse("\r")).toEqual([key("Enter")]);
    expect(parse("\t")).toEqual([key("Tab")]);
    expect(parse("\x7f")).toEqual([key("Backspace")]);
  });

  it("parses shift-Tab as Tab with shift", () => {
    expect(parse("\x1b[Z")).toEqual([key("Tab", { shift: true })]);
  });

  it("parses Ctrl-C as key 'c' with ctrl", () => {
    expect(parse("\x03")).toEqual([key("c", { ctrl: true })]);
  });

  it("parses a modified arrow key (Ctrl+Right)", () => {
    expect(parse("\x1b[1;5C")).toEqual([key("ArrowRight", { ctrl: true })]);
  });

  it("emits multiple keys batched in one chunk", () => {
    expect(parse("\x1b[A\x1b[B")).toEqual([key("ArrowUp"), key("ArrowDown")]);
  });
});

describe("InputParser — Escape disambiguation", () => {
  it("emits Escape when ESC is immediately followed by a mouse sequence", () => {
    // Pressing Esc then any mouse motion (motion-tracking mode) arrives as \x1b\x1b[<...
    const events = parse("\x1b\x1b[<0;5;5M");
    expect(events[0]).toEqual(key("Escape"));
    expect(events[1]).toMatchObject({ type: "mouse", action: "down", button: "left", x: 4, y: 4 });
    expect(events).toHaveLength(2);
  });

  it("emits Escape when ESC precedes another escape sequence (arrow)", () => {
    expect(parse("\x1b\x1b[A")).toEqual([key("Escape"), key("ArrowUp")]);
  });

  it("does not leak a mouse sequence body as text after an Esc", () => {
    const events = parse("\x1b\x1b[<35;45;4M");
    expect(events.some((e) => e.type === "text")).toBe(false);
    expect(events[0]).toEqual(key("Escape"));
    expect(events[1]).toMatchObject({ type: "mouse", action: "move" });
  });

  it("holds a lone ESC and flushes it as Escape on idle", () => {
    const parser = new InputParser();
    parser.push("\x1b");
    expect(parser.takeEvents()).toEqual([]); // ambiguous — held
    expect(parser.awaitingEscape).toBe(true);
    parser.flush();
    expect(parser.takeEvents()).toEqual([key("Escape")]);
    expect(parser.awaitingEscape).toBe(false);
  });

  it("still treats ESC + a printable char as Alt+char", () => {
    expect(parse("\x1ba")).toEqual([key("a", { alt: true })]);
  });
});

describe("InputParser — bracketed paste", () => {
  it("emits a single paste event for pasted text", () => {
    expect(parse("\x1b[200~hello\x1b[201~")).toEqual([{ type: "paste", text: "hello" }]);
  });

  it("does not interpret escape sequences inside a paste", () => {
    expect(parse("\x1b[200~a\x1b[Ab\x1b[201~")).toEqual([
      { type: "paste", text: "a\x1b[Ab" },
    ]);
  });

  it("handles a paste split across chunks", () => {
    expect(parse("\x1b[200~he", "llo\x1b[201~")).toEqual([
      { type: "paste", text: "hello" },
    ]);
  });
});

describe("InputParser — SGR mouse", () => {
  it("parses a left button press to a down event (0-based coords)", () => {
    expect(parse("\x1b[<0;12;4M")).toEqual([
      mouse({ action: "down", button: "left", x: 11, y: 3 }),
    ]);
  });

  it("parses a release to an up event", () => {
    expect(parse("\x1b[<0;12;4m")).toEqual([
      mouse({ action: "up", button: "left", x: 11, y: 3 }),
    ]);
  });

  it("parses wheel up and down", () => {
    expect(parse("\x1b[<64;5;5M")).toEqual([
      mouse({ action: "wheel", button: "none", x: 4, y: 4, deltaY: -1 }),
    ]);
    expect(parse("\x1b[<65;5;5M")).toEqual([
      mouse({ action: "wheel", button: "none", x: 4, y: 4, deltaY: 1 }),
    ]);
  });

  it("parses a drag (motion with a button held)", () => {
    expect(parse("\x1b[<32;5;5M")).toEqual([
      mouse({ action: "drag", button: "left", x: 4, y: 4 }),
    ]);
  });

  it("is invariant to how the sequence is split into chunks", () => {
    const seq = "\x1b[<0;12;4M";
    for (let split = 0; split <= seq.length; split += 1) {
      const parser = new InputParser();
      parser.push(Buffer.from(seq.slice(0, split), "utf8"));
      parser.push(Buffer.from(seq.slice(split), "utf8"));
      expect(parser.takeEvents()).toEqual([
        mouse({ action: "down", button: "left", x: 11, y: 3 }),
      ]);
    }
  });
});

describe("InputParser — focus", () => {
  it("parses terminal focus in and out", () => {
    expect(parse("\x1b[I")).toEqual([{ type: "terminal-focus", focused: true }]);
    expect(parse("\x1b[O")).toEqual([{ type: "terminal-focus", focused: false }]);
  });
});

// --- helpers ----------------------------------------------------------------

function key(
  name: string,
  mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {},
): TuiInputEvent {
  return {
    type: "key",
    key: name,
    ctrl: mods.ctrl ?? false,
    alt: mods.alt ?? false,
    shift: mods.shift ?? false,
    meta: mods.meta ?? false,
  };
}

function mouse(e: {
  action: "down" | "up" | "move" | "drag" | "wheel";
  button: "left" | "middle" | "right" | "none";
  x: number;
  y: number;
  deltaY?: -1 | 1;
}): TuiInputEvent {
  return {
    type: "mouse",
    action: e.action,
    button: e.button,
    x: e.x,
    y: e.y,
    ...(e.deltaY !== undefined ? { deltaY: e.deltaY } : {}),
    ctrl: false,
    alt: false,
    shift: false,
  };
}
