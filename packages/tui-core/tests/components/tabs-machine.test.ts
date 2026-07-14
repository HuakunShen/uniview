import { describe, expect, it } from "vitest";
import { keyEvent } from "../../src/input/events";
import { TabsMachine } from "../../src/components/tabs-machine";

describe("TabsMachine", () => {
  it("starts on the first tab", () => {
    const m = new TabsMachine({ count: 3 });
    expect(m.selectedIndex).toBe(0);
  });

  it("moves right and left, wrapping around", () => {
    const m = new TabsMachine({ count: 3 });
    expect(m.handle(keyEvent("ArrowRight"))).toEqual([{ type: "change", index: 1 }]);
    m.handle(keyEvent("ArrowRight"));
    expect(m.selectedIndex).toBe(2);
    m.handle(keyEvent("ArrowRight")); // wrap
    expect(m.selectedIndex).toBe(0);
    m.handle(keyEvent("ArrowLeft")); // wrap back
    expect(m.selectedIndex).toBe(2);
  });

  it("jumps to first and last with Home/End", () => {
    const m = new TabsMachine({ count: 4, selectedIndex: 2 });
    m.handle(keyEvent("Home"));
    expect(m.selectedIndex).toBe(0);
    m.handle(keyEvent("End"));
    expect(m.selectedIndex).toBe(3);
  });

  it("skips disabled tabs when navigating", () => {
    const m = new TabsMachine({ count: 3, disabled: [1] });
    m.handle(keyEvent("ArrowRight"));
    expect(m.selectedIndex).toBe(2); // 1 is disabled, skip to 2
  });

  it("emits no effect when navigation does not change the selection", () => {
    const m = new TabsMachine({ count: 1 });
    expect(m.handle(keyEvent("ArrowRight"))).toEqual([]);
  });

  it("accepts a controlled selected index", () => {
    const m = new TabsMachine({ count: 3 });
    m.setSelectedIndex(2);
    expect(m.selectedIndex).toBe(2);
  });
});
