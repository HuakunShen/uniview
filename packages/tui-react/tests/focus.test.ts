import { describe, expect, it } from "vitest";
import { nextFocus } from "../src/focus";

describe("nextFocus", () => {
  it("Tab cycles forward with wrap", () => {
    expect(nextFocus(0, 3, "Tab", false)).toBe(1);
    expect(nextFocus(2, 3, "Tab", false)).toBe(0);
  });
  it("Shift+Tab cycles backward with wrap", () => {
    expect(nextFocus(0, 3, "Tab", true)).toBe(2);
    expect(nextFocus(1, 3, "Tab", true)).toBe(0);
  });
  it("a digit jumps to that 1-based panel", () => {
    expect(nextFocus(0, 5, "3", false)).toBe(2);
    expect(nextFocus(0, 5, "5", false)).toBe(4);
  });
  it("returns null for out-of-range digits and other keys", () => {
    expect(nextFocus(0, 3, "9", false)).toBeNull();
    expect(nextFocus(0, 3, "x", false)).toBeNull();
  });
});
