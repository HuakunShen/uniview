/**
 * Regression tests for the single-root container guard.
 *
 * The protocol tree has exactly one root. appendChildToContainer used to
 * silently overwrite rootInstance (a top-level fragment kept only its last
 * child), and insertInContainerBefore was missing entirely (reordering
 * top-level fragment children crashed with a bare TypeError). Both now
 * fail with a clear error naming the fix.
 */
import { Fragment, createElement } from "react";
import { describe, expect, test, vi } from "vitest";
import { createRenderer, render } from "../src";
import { flush } from "./flush";


describe("single-root container guard", () => {
  test("top-level fragment with multiple children raises a clear error", async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });
    try {
      function App() {
        return createElement(
          Fragment,
          null,
          createElement("div", { key: "a" }, "A"),
          createElement("div", { key: "b" }, "B"),
        );
      }
      const renderer = createRenderer();
      render(createElement(App), renderer);
      await flush();

      expect(
        errors.some((e) => String(e).includes("single element")),
      ).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  test("single root followed by conditional root swap still works", async () => {
    const renderer = createRenderer();
    render(createElement("div", null, "A"), renderer);
    await flush();
    expect(renderer.rootInstance?.type).toBe("div");

    render(createElement("span", null, "B"), renderer);
    await flush();
    expect(renderer.rootInstance?.type).toBe("span");
  });
});
