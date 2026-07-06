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

  it("drops non-serializable submit events", () => {
    const event = { type: "submit", target: {}, preventDefault() {} };
    expect(serializeHandlerArgs("onSubmit", [event])).toEqual([]);
  });
});
