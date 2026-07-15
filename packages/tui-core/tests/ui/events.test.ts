import { describe, expect, it } from "vitest";
import { clampScroll, filterCommands, listCounter, nextFocus } from "../../src/index";

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

describe("listCounter", () => {
  it("formats 1-based position", () => {
    expect(listCounter(0, 8)).toBe("1 of 8");
    expect(listCounter(7, 8)).toBe("8 of 8");
    expect(listCounter(0, 0)).toBe("0 of 0");
  });
});

describe("clampScroll", () => {
  it("clamps to [0, rowCount - height]", () => {
    expect(clampScroll(5, 20, 5)).toBe(5);
    expect(clampScroll(-3, 20, 5)).toBe(0);
    expect(clampScroll(100, 20, 5)).toBe(15);
  });
  it("clamps to 0 when the content fits within the viewport", () => {
    expect(clampScroll(5, 3, 5)).toBe(0);
  });
});

describe("filterCommands", () => {
  const items = [
    { id: "open", label: "Open File" },
    { id: "diff", label: "Show Diff" },
    { id: "theme", label: "Toggle Theme" },
  ];
  it("filters by a case-insensitive subsequence of the label", () => {
    expect(filterCommands(items, "df").map((c) => c.id)).toEqual(["diff"]);
    expect(filterCommands(items, "the").map((c) => c.id)).toEqual(["theme"]);
    expect(filterCommands(items, "op").map((c) => c.id)).toEqual(["open"]);
    expect(filterCommands(items, "").map((c) => c.id)).toEqual(["open", "diff", "theme"]);
  });
});
