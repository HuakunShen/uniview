import { describe, expect, it } from "vitest";
import { SelectionMachine } from "../../src/components/selection-machine";
import type { TuiInputEvent } from "../../src/input/events";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

describe("SelectionMachine", () => {
  it("moves down and up, clamping at both ends", () => {
    const m = new SelectionMachine({ count: 3 });
    expect(m.selectedIndex).toBe(0);
    expect(m.handle(key("ArrowUp"))).toEqual([]); // already at top: no move, no effect
    expect(m.handle(key("ArrowDown"))).toEqual([{ type: "select", index: 1 }]);
    expect(m.handle(key("ArrowDown"))).toEqual([{ type: "select", index: 2 }]);
    expect(m.handle(key("ArrowDown"))).toEqual([]); // clamped at last
    expect(m.selectedIndex).toBe(2);
  });

  it("jumps with Home/End and pages by pageSize", () => {
    const m = new SelectionMachine({ count: 20, pageSize: 5 });
    expect(m.handle(key("End"))).toEqual([{ type: "select", index: 19 }]);
    expect(m.handle(key("Home"))).toEqual([{ type: "select", index: 0 }]);
    expect(m.handle(key("PageDown"))).toEqual([{ type: "select", index: 5 }]);
    expect(m.handle(key("PageUp"))).toEqual([{ type: "select", index: 0 }]);
  });

  it("composes back-to-back synchronous keys (no stale collapse)", () => {
    const m = new SelectionMachine({ count: 10, selectedIndex: 0 });
    m.handle(key("ArrowDown"));
    m.handle(key("ArrowDown")); // reads the machine's own updated index, not a stale prop
    expect(m.selectedIndex).toBe(2);
  });

  it("re-syncs from the controlled prop and clamps on setCount", () => {
    const m = new SelectionMachine({ count: 10, selectedIndex: 9 });
    m.setSelectedIndex(4);
    expect(m.selectedIndex).toBe(4);
    m.setCount(3); // data shrank
    expect(m.selectedIndex).toBe(2); // clamped to last valid
  });

  it("ignores non-key events and an empty list", () => {
    const m = new SelectionMachine({ count: 0 });
    expect(m.handle(key("ArrowDown"))).toEqual([]);
    expect(m.handle({ type: "text", text: "x" } as TuiInputEvent)).toEqual([]);
  });
});
