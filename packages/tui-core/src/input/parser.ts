import { StringDecoder } from "node:string_decoder";
import { keyEvent, type KeyModifiers, type TuiInputEvent } from "./events";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

type SubResult =
  | { status: "complete"; length: number; event: TuiInputEvent | null }
  | { status: "incomplete" }
  | { status: "none" };

const INCOMPLETE = { status: "incomplete" } as const;
const NONE = { status: "none" } as const;

function isStrictPrefix(candidate: string, full: string): boolean {
  return candidate.length < full.length && full.startsWith(candidate);
}

/** Decode a modifier code (as in `CSI 1;<code> C`) into flags. */
function modsFromCode(code: number | undefined): Partial<KeyModifiers> {
  if (!code || code < 1) return {};
  const m = code - 1;
  return {
    shift: (m & 1) !== 0,
    alt: (m & 2) !== 0,
    ctrl: (m & 4) !== 0,
    meta: (m & 8) !== 0,
  };
}

const FINAL_KEYS: Record<string, string> = {
  A: "ArrowUp",
  B: "ArrowDown",
  C: "ArrowRight",
  D: "ArrowLeft",
  H: "Home",
  F: "End",
  P: "F1",
  Q: "F2",
  R: "F3",
  S: "F4",
};

const TILDE_KEYS: Record<number, string> = {
  1: "Home",
  2: "Insert",
  3: "Delete",
  4: "End",
  5: "PageUp",
  6: "PageDown",
  7: "Home",
  8: "End",
  11: "F1",
  12: "F2",
  13: "F3",
  14: "F4",
  15: "F5",
  17: "F6",
  18: "F7",
  19: "F8",
  20: "F9",
  21: "F10",
  23: "F11",
  24: "F12",
};

function decodeMouse(
  b: number,
  x: number,
  y: number,
  final: string,
): TuiInputEvent {
  const mods = { ctrl: (b & 16) !== 0, alt: (b & 8) !== 0, shift: (b & 4) !== 0 };

  if (b & 64) {
    return {
      type: "mouse",
      action: "wheel",
      button: "none",
      x,
      y,
      deltaY: b & 1 ? 1 : -1,
      ...mods,
    };
  }

  const base = b & 3;
  const button = base === 0 ? "left" : base === 1 ? "middle" : base === 2 ? "right" : "none";

  if (b & 32) {
    return base === 3
      ? { type: "mouse", action: "move", button: "none", x, y, ...mods }
      : { type: "mouse", action: "drag", button, x, y, ...mods };
  }

  return {
    type: "mouse",
    action: final === "M" ? "down" : "up",
    button,
    x,
    y,
    ...mods,
  };
}

function parseMouse(p: string): SubResult {
  if (!p.startsWith("\x1b[<")) return NONE;
  const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(p);
  if (!match) return INCOMPLETE;
  const event = decodeMouse(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) - 1,
    match[4]!,
  );
  return { status: "complete", length: match[0].length, event };
}

/** Find the length of a complete CSI sequence starting at index 0, if any. */
function frameCsi(p: string): number | null {
  for (let i = 2; i < p.length; i += 1) {
    const c = p.charCodeAt(i);
    if (c >= 0x40 && c <= 0x7e) return i + 1; // CSI final byte
  }
  return null;
}

function csiKey(final: string, params: string): TuiInputEvent | null {
  const parts = params.split(";");
  const modCode = parts[1] ? Number(parts[1]) : undefined;
  const mods = modsFromCode(modCode);

  if (final === "I") return { type: "terminal-focus", focused: true };
  if (final === "O") return { type: "terminal-focus", focused: false };
  if (final === "Z") return keyEvent("Tab", { shift: true });

  if (final === "~") {
    const name = TILDE_KEYS[Number(parts[0])];
    return name ? keyEvent(name, mods) : null;
  }

  const name = FINAL_KEYS[final];
  return name ? keyEvent(name, mods) : null;
}

function parseEscape(p: string): SubResult {
  if (p[0] !== "\x1b") return NONE;
  if (p === "\x1b") return INCOMPLETE; // ambiguous lone ESC — held until flush() or more bytes

  // ESC directly followed by another ESC: the first ESC is a standalone Escape
  // keypress; the rest (e.g. a mouse report after Esc in motion-tracking mode)
  // starts a fresh sequence on the next pass. Without this, "\x1b\x1b[<..." was
  // eaten as Alt+ESC and the mouse body leaked out as text.
  if (p[1] === "\x1b") {
    return { status: "complete", length: 1, event: keyEvent("Escape") };
  }

  if (p.startsWith("\x1bO")) {
    if (p.length < 3) return INCOMPLETE;
    const name = FINAL_KEYS[p[2]!];
    return { status: "complete", length: 3, event: name ? keyEvent(name) : null };
  }

  if (p.startsWith("\x1b[")) {
    const end = frameCsi(p);
    if (end === null) return INCOMPLETE;
    const seq = p.slice(0, end);
    const final = seq[seq.length - 1]!;
    const params = seq.slice(2, seq.length - 1);
    return { status: "complete", length: end, event: csiKey(final, params) };
  }

  // ESC + a printable is Alt+<char>.
  if (p.length >= 2) {
    return { status: "complete", length: 2, event: keyEvent(p[1]!, { alt: true }) };
  }
  return INCOMPLETE;
}

function parseSingle(p: string): SubResult {
  const code = p.charCodeAt(0);

  if (code === 0x0d || code === 0x0a) return complete(1, keyEvent("Enter"));
  if (code === 0x09) return complete(1, keyEvent("Tab"));
  if (code === 0x7f || code === 0x08) return complete(1, keyEvent("Backspace"));

  // Ctrl-A .. Ctrl-Z (excluding the named ones handled above).
  if (code >= 0x01 && code <= 0x1a) {
    const letter = String.fromCharCode(code + 0x60);
    return complete(1, keyEvent(letter, { ctrl: true }));
  }

  // Other C0 controls: consume without emitting.
  if (code < 0x20) return complete(1, null);

  const cp = p.codePointAt(0)!;
  const text = String.fromCodePoint(cp);
  return complete(text.length, { type: "text", text });
}

function complete(length: number, event: TuiInputEvent | null): SubResult {
  return { status: "complete", length, event };
}

/**
 * Incremental terminal input parser. `push` accepts arbitrary byte chunks —
 * escape sequences, UTF-8 code points and pastes may be split across chunks —
 * and buffers partial input until it can emit whole normalized events.
 */
export class InputParser {
  private readonly decoder = new StringDecoder("utf8");
  private pending = "";
  private paste: string | null = null;
  private readonly events: TuiInputEvent[] = [];

  /** Feed a chunk of input; emitted events accumulate for {@link takeEvents}. */
  push(chunk: Uint8Array | string): void {
    this.pending += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    this.drain();
  }

  /** Drain and clear the events produced so far. */
  takeEvents(): TuiInputEvent[] {
    return this.events.splice(0);
  }

  /** True when the buffer holds only a lone ESC awaiting disambiguation. */
  get awaitingEscape(): boolean {
    return this.paste === null && this.pending === "\x1b";
  }

  /**
   * Resolve a held lone ESC as an Escape keypress. The driver calls this after
   * a short input-idle timeout so a bare Esc isn't stuck waiting for a byte that
   * (unlike an escape sequence) never comes.
   */
  flush(): void {
    if (this.awaitingEscape) {
      this.events.push(keyEvent("Escape"));
      this.pending = "";
    }
  }

  private drain(): void {
    while (this.pending.length > 0) {
      if (this.paste !== null) {
        const end = this.pending.indexOf(PASTE_END);
        if (end < 0) {
          this.paste += this.pending;
          this.pending = "";
          return;
        }
        this.paste += this.pending.slice(0, end);
        this.events.push({ type: "paste", text: this.paste });
        this.paste = null;
        this.pending = this.pending.slice(end + PASTE_END.length);
        continue;
      }

      if (this.pending.startsWith(PASTE_START)) {
        this.paste = "";
        this.pending = this.pending.slice(PASTE_START.length);
        continue;
      }
      // Might be the start of a paste marker (or another escape) — wait for more.
      if (isStrictPrefix(this.pending, PASTE_START)) return;

      const mouse = parseMouse(this.pending);
      if (mouse.status === "incomplete") return;
      if (mouse.status === "complete") {
        if (mouse.event) this.events.push(mouse.event);
        this.pending = this.pending.slice(mouse.length);
        continue;
      }

      const escape = parseEscape(this.pending);
      if (escape.status === "incomplete") return;
      if (escape.status === "complete") {
        if (escape.event) this.events.push(escape.event);
        this.pending = this.pending.slice(escape.length);
        continue;
      }

      const single = parseSingle(this.pending);
      if (single.status !== "complete") return;
      if (single.event) this.events.push(single.event);
      this.pending = this.pending.slice(single.length);
    }
  }
}
