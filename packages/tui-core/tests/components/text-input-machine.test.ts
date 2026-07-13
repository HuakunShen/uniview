import { describe, expect, it } from "vitest";
import { keyEvent } from "../../src/input/events";
import {
  TextInputMachine,
  type TextInputEffect,
} from "../../src/components/text-input-machine";

const text = (t: string) => ({ type: "text", text: t }) as const;

describe("TextInputMachine — typing", () => {
  it("starts empty with the cursor at 0", () => {
    const m = new TextInputMachine();
    expect(m.value).toBe("");
    expect(m.cursor).toBe(0);
  });

  it("inserts characters at the cursor and advances it", () => {
    const m = new TextInputMachine();
    const effects = m.handle(text("h"));
    expect(m.value).toBe("h");
    expect(m.cursor).toBe(1);
    expect(effects).toEqual<TextInputEffect[]>([{ type: "change", value: "h", cursor: 1 }]);
    m.handle(text("i"));
    expect(m.value).toBe("hi");
    expect(m.cursor).toBe(2);
  });

  it("inserts in the middle", () => {
    const m = new TextInputMachine({ value: "ac", cursor: 1 });
    m.handle(text("b"));
    expect(m.value).toBe("abc");
    expect(m.cursor).toBe(2);
  });

  it("inserts pasted text as one edit", () => {
    const m = new TextInputMachine();
    m.handle({ type: "paste", text: "xy" });
    expect(m.value).toBe("xy");
    expect(m.cursor).toBe(2);
  });
});

describe("TextInputMachine — cursor movement", () => {
  it("moves left and right, clamped to bounds", () => {
    const m = new TextInputMachine({ value: "hi", cursor: 2 });
    expect(m.handle(keyEvent("ArrowLeft"))).toEqual([{ type: "change", value: "hi", cursor: 1 }]);
    m.handle(keyEvent("ArrowLeft"));
    expect(m.cursor).toBe(0);
    expect(m.handle(keyEvent("ArrowLeft"))).toEqual([]); // clamped, no change
  });

  it("jumps to line start and end", () => {
    const m = new TextInputMachine({ value: "hello", cursor: 2 });
    m.handle(keyEvent("Home"));
    expect(m.cursor).toBe(0);
    m.handle(keyEvent("End"));
    expect(m.cursor).toBe(5);
  });

  it("counts wide graphemes as one cursor step", () => {
    const m = new TextInputMachine({ value: "中x", cursor: 0 });
    m.handle(keyEvent("ArrowRight"));
    expect(m.cursor).toBe(1);
    m.handle(keyEvent("ArrowRight"));
    expect(m.cursor).toBe(2);
  });

  it("moves by word with Ctrl+Arrow", () => {
    const m = new TextInputMachine({ value: "foo bar", cursor: 7 });
    m.handle(keyEvent("ArrowLeft", { ctrl: true }));
    expect(m.cursor).toBe(4); // start of "bar"
    m.handle(keyEvent("ArrowLeft", { ctrl: true }));
    expect(m.cursor).toBe(0); // start of "foo"
  });
});

describe("TextInputMachine — deletion", () => {
  it("backspaces the grapheme before the cursor", () => {
    const m = new TextInputMachine({ value: "abc", cursor: 2 });
    m.handle(keyEvent("Backspace"));
    expect(m.value).toBe("ac");
    expect(m.cursor).toBe(1);
  });

  it("does nothing when backspacing at the start", () => {
    const m = new TextInputMachine({ value: "abc", cursor: 0 });
    expect(m.handle(keyEvent("Backspace"))).toEqual([]);
    expect(m.value).toBe("abc");
  });

  it("deletes the grapheme at the cursor with Delete", () => {
    const m = new TextInputMachine({ value: "abc", cursor: 0 });
    m.handle(keyEvent("Delete"));
    expect(m.value).toBe("bc");
    expect(m.cursor).toBe(0);
  });

  it("backspaces a wide grapheme as a unit", () => {
    const m = new TextInputMachine({ value: "中x", cursor: 1 });
    m.handle(keyEvent("Backspace"));
    expect(m.value).toBe("x");
    expect(m.cursor).toBe(0);
  });
});

describe("TextInputMachine — submit and controlled value", () => {
  it("emits a submit effect on Enter without changing the value", () => {
    const m = new TextInputMachine({ value: "go", cursor: 2 });
    expect(m.handle(keyEvent("Enter"))).toEqual([{ type: "submit", value: "go" }]);
    expect(m.value).toBe("go");
  });

  it("accepts a controlled value and clamps the cursor", () => {
    const m = new TextInputMachine({ value: "abc", cursor: 3 });
    m.setValue("z");
    expect(m.value).toBe("z");
    expect(m.cursor).toBe(1);
  });
});
