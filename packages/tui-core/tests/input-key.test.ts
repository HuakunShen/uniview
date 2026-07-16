import { describe, expect, it } from "vitest";
import { keyEvent, toInputKey, type TuiInputEvent } from "../src/index";

/** keyEvent returns the full event union; narrow to the key variant toInputKey wants. */
const key = (name: string, mods?: { ctrl?: boolean }): Extract<TuiInputEvent, { type: "key" }> =>
  keyEvent(name, mods) as Extract<TuiInputEvent, { type: "key" }>;

describe("toInputKey", () => {
  it("maps a printable text event to `input`, all key flags false", () => {
    const { input, key: k } = toInputKey({ type: "text", text: "q" });
    expect(input).toBe("q");
    expect(k.escape).toBe(false);
    expect(k.ctrl).toBe(false);
  });

  it("maps named keys to ink-style flags with empty input", () => {
    expect(toInputKey(key("Escape")).key.escape).toBe(true);
    expect(toInputKey(key("ArrowUp")).key.upArrow).toBe(true);
    expect(toInputKey(key("Enter")).key.return).toBe(true);
    expect(toInputKey(key("Backspace")).key.backspace).toBe(true);
    expect(toInputKey(key("Enter")).input).toBe("");
  });

  it("passes modifiers through for key events", () => {
    const { key: k } = toInputKey(key("c", { ctrl: true }));
    expect(k.ctrl).toBe(true);
    expect(k.shift).toBe(false);
  });
});
