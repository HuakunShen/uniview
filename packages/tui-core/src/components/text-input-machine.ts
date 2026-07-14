import { graphemesOf } from "../text/graphemes";
import type { TuiInputEvent } from "../input/events";

/** An effect the host applies after the machine processes an event. */
export type TextInputEffect =
  | { type: "change"; value: string; cursor: number }
  | { type: "submit"; value: string };

export interface TextInputInit {
  value?: string;
  /** Cursor position in grapheme units. */
  cursor?: number;
}

function isWordChar(grapheme: string): boolean {
  return grapheme.trim().length > 0;
}

/**
 * A framework-neutral text field state machine. It operates on grapheme
 * clusters so the cursor never splits a wide char or emoji, and emits
 * serializable effects rather than calling back synchronously — the same
 * behavior for direct, Worker and WebSocket hosts.
 */
export class TextInputMachine {
  private graphemes: string[];
  private caret: number;

  constructor(init: TextInputInit = {}) {
    this.graphemes = [...graphemesOf(init.value ?? "")];
    this.caret = this.clamp(init.cursor ?? this.graphemes.length);
  }

  get value(): string {
    return this.graphemes.join("");
  }

  /** Cursor position in grapheme units. */
  get cursor(): number {
    return this.caret;
  }

  private clamp(index: number): number {
    return Math.max(0, Math.min(index, this.graphemes.length));
  }

  private changed(): TextInputEffect[] {
    return [{ type: "change", value: this.value, cursor: this.caret }];
  }

  /** Apply a controlled value from the host, clamping the cursor. */
  setValue(value: string, cursor?: number): void {
    this.graphemes = [...graphemesOf(value)];
    this.caret = this.clamp(cursor ?? this.caret);
  }

  handle(event: TuiInputEvent): TextInputEffect[] {
    if (event.type === "text" || event.type === "paste") {
      return this.insert(event.text);
    }
    if (event.type !== "key") return [];

    switch (event.key) {
      case "ArrowLeft":
        return event.ctrl ? this.moveWord(-1) : this.moveCursor(-1);
      case "ArrowRight":
        return event.ctrl ? this.moveWord(1) : this.moveCursor(1);
      case "Home":
        return this.moveTo(0);
      case "End":
        return this.moveTo(this.graphemes.length);
      case "Backspace":
        return this.deleteBackward();
      case "Delete":
        return this.deleteForward();
      case "Enter":
        return [{ type: "submit", value: this.value }];
      default:
        return [];
    }
  }

  private insert(text: string): TextInputEffect[] {
    const inserted = [...graphemesOf(text)];
    if (inserted.length === 0) return [];
    this.graphemes.splice(this.caret, 0, ...inserted);
    this.caret += inserted.length;
    return this.changed();
  }

  private moveCursor(delta: number): TextInputEffect[] {
    const next = this.clamp(this.caret + delta);
    if (next === this.caret) return [];
    this.caret = next;
    return this.changed();
  }

  private moveTo(index: number): TextInputEffect[] {
    const next = this.clamp(index);
    if (next === this.caret) return [];
    this.caret = next;
    return this.changed();
  }

  private moveWord(direction: -1 | 1): TextInputEffect[] {
    let next = this.caret;
    const at = (i: number) => this.graphemes[direction < 0 ? i - 1 : i];
    // Skip whitespace, then skip the word.
    while (next + direction >= 0 && next + direction <= this.graphemes.length && at(next) && !isWordChar(at(next)!)) {
      next += direction;
    }
    while (next + direction >= 0 && next + direction <= this.graphemes.length && at(next) && isWordChar(at(next)!)) {
      next += direction;
    }
    return this.moveTo(next);
  }

  private deleteBackward(): TextInputEffect[] {
    if (this.caret === 0) return [];
    this.graphemes.splice(this.caret - 1, 1);
    this.caret -= 1;
    return this.changed();
  }

  private deleteForward(): TextInputEffect[] {
    if (this.caret >= this.graphemes.length) return [];
    this.graphemes.splice(this.caret, 1);
    return this.changed();
  }
}
