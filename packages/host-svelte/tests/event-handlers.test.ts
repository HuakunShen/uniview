/**
 * Verifies host-svelte converts component event callbacks into JSON-safe
 * handler arguments before they cross Worker/kkrpc boundaries.
 */
import { describe, expect, it } from "vitest";
import { serializeHandlerArgs } from "../src/event-handlers";

class FakePointerEvent {
  readonly type = "click";
}

describe("serializeHandlerArgs", () => {
  it("drops click event objects so Worker postMessage never receives PointerEvent", () => {
    expect(serializeHandlerArgs("onClick", [new FakePointerEvent()])).toEqual([]);
  });

  it("extracts input values from component change events", () => {
    expect(serializeHandlerArgs("onChange", [{ target: { value: "hello" } }])).toEqual(["hello"]);
  });

  it("keeps already-serializable custom arguments", () => {
    expect(serializeHandlerArgs("onClick", ["id-1", { ok: true }])).toEqual(["id-1", { ok: true }]);
  });

  it("serializes keyboard events with key, code, and modifiers", () => {
    const event = {
      type: "keydown",
      key: "Enter",
      code: "Enter",
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      target: {},
      preventDefault() {},
    };
    // ComponentRenderer passes the raw event through — previously
    // keydown/keyup were stripped to zero args before reaching here, so
    // plugins never learned which key was pressed.
    expect(serializeHandlerArgs("onKeyDown", [event])).toEqual([
      {
        key: "Enter",
        code: "Enter",
        altKey: false,
        ctrlKey: false,
        metaKey: true,
        shiftKey: false,
      },
    ]);
  });

  it("serializes wheel events the way the terminal host does (deltaY/x/y)", () => {
    const event = {
      type: "wheel",
      deltaY: 120,
      deltaX: 0,
      clientX: 40,
      clientY: 12,
      target: {},
      preventDefault() {},
    };
    // Field for field the same as host-tui's InputRouter wheel payload
    // (TuiWheelEvent), so one plugin tree reads wheel events identically
    // whether the terminal or the web renders it.
    expect(serializeHandlerArgs("onWheel", [event])).toEqual([
      { deltaY: 120, x: 40, y: 12 },
    ]);
  });

  it("keeps an already-serialized wheel payload untouched", () => {
    expect(serializeHandlerArgs("onWheel", [{ deltaY: -3, x: 1, y: 2 }])).toEqual([
      { deltaY: -3, x: 1, y: 2 },
    ]);
  });

  it("drops non-serializable submit events", () => {
    const event = { type: "submit", target: {}, preventDefault() {} };
    expect(serializeHandlerArgs("onSubmit", [event])).toEqual([]);
  });
});
