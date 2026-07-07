import { describe, expect, test, vi } from "vitest";
import { HandlerRegistry } from "../src";

type H = (...a: unknown[]) => unknown;
const set = (...pairs: [string, H][]) => new Map<string, H>(pairs);

describe("HandlerRegistry", () => {
  test("syncNode registers a node's handlers and execute calls the latest", async () => {
    const reg = new HandlerRegistry();
    const first = vi.fn();
    reg.syncNode("btn", set(["btn:onClick", first]));
    expect(reg.size).toBe(1);
    expect(reg.has("btn:onClick")).toBe(true);

    // Re-render with a fresh closure under the SAME id: overwrite, not grow.
    const second = vi.fn();
    reg.syncNode("btn", set(["btn:onClick", second]));
    expect(reg.size).toBe(1);

    await reg.execute("btn:onClick", 42);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(42);
  });

  test("syncNode drops props that disappeared", () => {
    const reg = new HandlerRegistry();
    reg.syncNode("n", set(["n:onClick", () => {}], ["n:onFocus", () => {}]));
    expect(reg.size).toBe(2);
    reg.syncNode("n", set(["n:onClick", () => {}]));
    expect(reg.size).toBe(1);
    expect(reg.has("n:onFocus")).toBe(false);
  });

  test("releaseNode frees everything a node owned", () => {
    const reg = new HandlerRegistry();
    reg.syncNode("a", set(["a:onClick", () => {}]));
    reg.syncNode("b", set(["b:onClick", () => {}]));
    reg.releaseNode("a");
    expect(reg.has("a:onClick")).toBe(false);
    expect(reg.has("b:onClick")).toBe(true);
    expect(reg.size).toBe(1);
  });

  test("sweep releases nodes not seen between begin/endSweep", () => {
    const reg = new HandlerRegistry();
    reg.syncNode("keep", set(["keep:onClick", () => {}]));
    reg.syncNode("gone", set(["gone:onClick", () => {}]));

    reg.beginSweep();
    reg.syncNode("keep", set(["keep:onClick", () => {}])); // touched this pass
    reg.endSweep();

    expect(reg.has("keep:onClick")).toBe(true);
    expect(reg.has("gone:onClick")).toBe(false);
  });

  test("execute on a missing handler warns and resolves undefined", async () => {
    const reg = new HandlerRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(reg.execute("nope:onClick")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  test("execute awaits async handlers and returns their result", async () => {
    const reg = new HandlerRegistry();
    reg.syncNode("n", set(["n:onClick", async () => "done"]));
    await expect(reg.execute("n:onClick")).resolves.toBe("done");
  });
});
