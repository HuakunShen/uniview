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
});
