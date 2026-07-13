import { describe, expect, it } from "vitest";
import { FocusManager } from "../../src/focus/focus-manager";

describe("FocusManager — navigation", () => {
  it("focuses the first enabled item when moving next from nothing", () => {
    const fm = new FocusManager();
    fm.setFocusables([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(fm.focused).toBeNull();
    expect(fm.move("next")).toBe("a");
  });

  it("cycles forward and wraps around", () => {
    const fm = new FocusManager();
    fm.setFocusables([{ id: "a" }, { id: "b" }, { id: "c" }]);
    fm.move("next"); // a
    expect(fm.move("next")).toBe("b");
    expect(fm.move("next")).toBe("c");
    expect(fm.move("next")).toBe("a"); // wrap
  });

  it("cycles backward and wraps around", () => {
    const fm = new FocusManager();
    fm.setFocusables([{ id: "a" }, { id: "b" }, { id: "c" }]);
    fm.focus("a");
    expect(fm.move("previous")).toBe("c"); // wrap backward
    expect(fm.move("previous")).toBe("b");
  });

  it("skips disabled items during navigation", () => {
    const fm = new FocusManager();
    fm.setFocusables([{ id: "a" }, { id: "b", disabled: true }, { id: "c" }]);
    fm.focus("a");
    expect(fm.move("next")).toBe("c");
  });

  it("returns null when there are no focusable items", () => {
    const fm = new FocusManager();
    fm.setFocusables([{ id: "a", disabled: true }]);
    expect(fm.move("next")).toBeNull();
    expect(fm.focused).toBeNull();
  });
});

describe("FocusManager — tabIndex order", () => {
  it("orders by ascending tabIndex", () => {
    const fm = new FocusManager();
    fm.setFocusables([
      { id: "a", tabIndex: 2 },
      { id: "b", tabIndex: 1 },
      { id: "c", tabIndex: 2 },
    ]);
    fm.move("next"); // b (lowest tabIndex)
    expect(fm.focused).toBe("b");
    expect(fm.move("next")).toBe("a"); // then a (stable within equal tabIndex)
    expect(fm.move("next")).toBe("c");
  });
});

describe("FocusManager — focus()", () => {
  it("never focuses a disabled item", () => {
    const fm = new FocusManager();
    fm.setFocusables([{ id: "a" }, { id: "b", disabled: true }]);
    expect(fm.focus("b")).toBeNull();
    expect(fm.focused).toBeNull();
  });

  it("records the focus reason", () => {
    const fm = new FocusManager();
    fm.setFocusables([{ id: "a" }]);
    fm.focus("a", "pointer");
    expect(fm.focusReason).toBe("pointer");
    fm.move("next");
    expect(fm.focusReason).toBe("keyboard");
  });

  it("clears focus when the focused item disappears", () => {
    const fm = new FocusManager();
    fm.setFocusables([{ id: "a" }, { id: "b" }]);
    fm.focus("a");
    fm.setFocusables([{ id: "b" }]); // 'a' removed
    expect(fm.focused).toBeNull();
  });

  it("keeps focus when the focused item survives an update", () => {
    const fm = new FocusManager();
    fm.setFocusables([{ id: "a" }, { id: "b" }]);
    fm.focus("b");
    fm.setFocusables([{ id: "b" }, { id: "c" }]);
    expect(fm.focused).toBe("b");
  });
});
