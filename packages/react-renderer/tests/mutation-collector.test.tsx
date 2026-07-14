import { createElement, useState } from "react";
import { describe, expect, test } from "vitest";
import type { Mutation } from "@uniview/protocol";
import { TEXT_NODE_TYPE } from "@uniview/protocol";
import {
  HandlerRegistry,
  MutationCollector,
  createRenderer,
  render,
} from "../src";

import { flush } from "./flush";

function collect() {
  const renderer = createRenderer();
  const registry = new HandlerRegistry();
  const collector = new MutationCollector(registry);
  renderer.mutationCollector = collector;
  const batches: Mutation[][] = [];
  renderer.subscribeMutations((m) => batches.push(m));
  return { renderer, registry, batches };
}

let toggleRef: (v: boolean) => void = () => {};
function ToggleApp() {
  const [show, setShow] = useState(true);
  toggleRef = setShow;
  return createElement(
    "div",
    null,
    createElement("button", { onClick: () => "hit", "data-x": show ? 1 : 0 }, "b"),
    // The conditional child carries its OWN handler so removing it is
    // observable as a drop in registry size.
    show ? createElement("button", { onClick: () => "inner" }, "here") : null,
  );
}

describe("MutationCollector", () => {
  test("emits a setRoot with v3 text nodes on mount", async () => {
    const { renderer, batches } = collect();
    render(createElement(ToggleApp), renderer);
    await flush();

    const setRoot = batches
      .flat()
      .filter((m) => m.type === "setRoot" && m.node)
      .at(-1);
    expect(setRoot).toBeDefined();
    if (setRoot?.type !== "setRoot" || !setRoot.node) throw new Error("no root");
    // The button's text child is an explicit #text node, not a bare string.
    const button = setRoot.node.children.find(
      (c) => typeof c !== "string" && c.type === "button",
    );
    expect(button && typeof button !== "string").toBe(true);
    if (button && typeof button !== "string") {
      const textChild = button.children[0];
      expect(typeof textChild !== "string" && textChild.type).toBe(TEXT_NODE_TYPE);
    }
  });

  test("removeChild releases the removed subtree's handlers", async () => {
    const { renderer, registry, batches } = collect();
    render(createElement(ToggleApp), renderer);
    await flush();
    batches.splice(0);

    // Two handlers: outer button + inner conditional button.
    expect(registry.size).toBe(2);

    toggleRef(false);
    await flush();
    const kinds = batches.flat().map((m) => m.type);
    expect(kinds).toContain("removeChild"); // inner button removed
    expect(kinds).toContain("setProps"); // outer button data-x flips

    // The removed button's handler is released; the outer one remains.
    expect(registry.size).toBe(1);
  });

  test("setProps mutation carries the full serialized props", async () => {
    const { renderer, batches } = collect();
    render(createElement(ToggleApp), renderer);
    await flush();
    batches.splice(0);

    toggleRef(false);
    await flush();
    const setProps = batches.flat().find((m) => m.type === "setProps");
    expect(setProps).toBeDefined();
    if (setProps?.type === "setProps") {
      expect(setProps.props).toHaveProperty("data-x", 0);
      // handler props are represented as ids, not raw functions
      expect(setProps.props).toHaveProperty("_onClickHandlerId");
    }
  });
});
