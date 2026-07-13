import { describe, expect, it } from "vitest";
import { keyEvent } from "../../src/input/events";
import { CheckboxMachine } from "../../src/components/checkbox-machine";

const space = { type: "text", text: " " } as const;
const clickUp = {
  type: "mouse",
  action: "up",
  button: "left",
  x: 0,
  y: 0,
  ctrl: false,
  alt: false,
  shift: false,
} as const;

describe("CheckboxMachine", () => {
  it("starts unchecked by default", () => {
    expect(new CheckboxMachine().checked).toBe(false);
  });

  it("toggles on Space and emits a change effect", () => {
    const m = new CheckboxMachine();
    expect(m.handle(space)).toEqual([{ type: "change", checked: true }]);
    expect(m.checked).toBe(true);
    expect(m.handle(space)).toEqual([{ type: "change", checked: false }]);
    expect(m.checked).toBe(false);
  });

  it("toggles on Enter and on a mouse click", () => {
    const m = new CheckboxMachine();
    expect(m.handle(keyEvent("Enter"))).toEqual([{ type: "change", checked: true }]);
    expect(m.handle(clickUp)).toEqual([{ type: "change", checked: false }]);
  });

  it("ignores input when disabled", () => {
    const m = new CheckboxMachine({ disabled: true });
    expect(m.handle(space)).toEqual([]);
    expect(m.checked).toBe(false);
  });

  it("accepts a controlled checked value", () => {
    const m = new CheckboxMachine({ checked: true });
    expect(m.checked).toBe(true);
    m.setChecked(false);
    expect(m.checked).toBe(false);
  });

  it("ignores unrelated keys", () => {
    const m = new CheckboxMachine();
    expect(m.handle(keyEvent("ArrowDown"))).toEqual([]);
  });
});
