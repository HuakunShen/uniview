import { describe, expect, it } from "vitest";
import { keyEvent } from "../../src/input/events";
import { PressableMachine } from "../../src/components/pressable-machine";

describe("PressableMachine", () => {
  it("activates on Enter", () => {
    const m = new PressableMachine();
    expect(m.handle(keyEvent("Enter"))).toEqual([{ type: "activate" }]);
  });

  it("activates on Space", () => {
    const m = new PressableMachine();
    expect(m.handle({ type: "text", text: " " })).toEqual([{ type: "activate" }]);
  });

  it("activates on a mouse click (down then up)", () => {
    const m = new PressableMachine();
    expect(m.handle({ type: "mouse", action: "down", button: "left", x: 0, y: 0, ctrl: false, alt: false, shift: false })).toEqual([]);
    expect(m.handle({ type: "mouse", action: "up", button: "left", x: 0, y: 0, ctrl: false, alt: false, shift: false })).toEqual([{ type: "activate" }]);
  });

  it("does not activate when disabled", () => {
    const m = new PressableMachine({ disabled: true });
    expect(m.handle(keyEvent("Enter"))).toEqual([]);
    expect(m.handle({ type: "text", text: " " })).toEqual([]);
  });

  it("ignores unrelated keys", () => {
    const m = new PressableMachine();
    expect(m.handle(keyEvent("ArrowDown"))).toEqual([]);
    expect(m.handle({ type: "text", text: "a" })).toEqual([]);
  });
});
