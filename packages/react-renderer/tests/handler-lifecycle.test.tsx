/**
 * Regression tests for handler registry lifecycle.
 *
 * Handler ids are deterministic (`${nodeId}:${propName}`): re-rendering a
 * node overwrites its entries instead of growing the registry, removed
 * subtrees release their handlers, and full-tree serialization sweeps
 * entries for nodes that left the tree. Previously every serialization
 * registered fresh `handler_N` ids and nothing was ever released — the
 * registry grew on every render for the lifetime of the plugin.
 */
import { createElement, useState } from "react";
import { describe, expect, test } from "vitest";
import type { Mutation, UINode } from "@uniview/protocol";
import {
  HandlerRegistry,
  MutationCollector,
  createRenderer,
  render,
  serializeTree,
} from "../src";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

describe("handler lifecycle", () => {
  test("registry does not grow across re-renders (full mode)", async () => {
    let bump: () => void = () => {};
    function App() {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      return createElement(
        "div",
        { "data-n": n },
        createElement("button", { onClick: () => n }, "b1"),
        createElement("button", { onClick: () => n }, "b2"),
      );
    }

    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    renderer.subscribe(() => {
      serializeTree(renderer.rootInstance, registry);
    });
    render(createElement(App), renderer);
    await flush();
    const sizeAfterMount = registry.size;
    expect(sizeAfterMount).toBe(2);

    for (let i = 0; i < 10; i++) {
      bump();
      await flush();
    }
    expect(registry.size).toBe(sizeAfterMount);
  });

  test("handler id is stable and executes the LATEST handler after re-render", async () => {
    let bump: () => void = () => {};
    const calls: number[] = [];
    function App() {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      return createElement("button", { onClick: () => calls.push(n) }, "b");
    }

    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    let lastTree: UINode | null = null;
    renderer.subscribe(() => {
      lastTree = serializeTree(renderer.rootInstance, registry) as UINode;
    });
    render(createElement(App), renderer);
    await flush();

    const idBefore = lastTree!.props._onClickHandlerId;
    bump();
    await flush();
    const idAfter = lastTree!.props._onClickHandlerId;

    expect(idAfter).toBe(idBefore);

    // An event RPC created against the old tree arrives now: it must run
    // the CURRENT handler (n=1), not a stale or unrelated one.
    await registry.execute(String(idBefore));
    expect(calls).toEqual([1]);
  });

  test("removed subtrees release their handlers (incremental mode)", async () => {
    let setCount: (n: number) => void = () => {};
    function App() {
      const [count, set] = useState(5);
      setCount = set;
      return createElement(
        "div",
        null,
        Array.from({ length: count }, (_, i) =>
          createElement("button", { key: `k${i}`, onClick: () => i }, `b${i}`),
        ),
      );
    }

    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    const collector = new MutationCollector(registry);
    renderer.mutationCollector = collector;
    const batches: Mutation[][] = [];
    renderer.subscribeMutations((m) => batches.push(m));

    render(createElement(App), renderer);
    await flush();
    expect(registry.size).toBe(5);

    setCount(2);
    await flush();
    expect(registry.size).toBe(2);

    setCount(4);
    await flush();
    expect(registry.size).toBe(4);
  });

  test("dropping a handler prop releases its id", async () => {
    let toggle: (v: boolean) => void = () => {};
    function App() {
      const [on, set] = useState(true);
      toggle = set;
      return createElement(
        "button",
        on ? { onClick: () => 1, onFocus: () => 2 } : { onClick: () => 1 },
        "b",
      );
    }

    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    renderer.subscribe(() => {
      serializeTree(renderer.rootInstance, registry);
    });
    render(createElement(App), renderer);
    await flush();
    expect(registry.size).toBe(2);

    toggle(false);
    await flush();
    expect(registry.size).toBe(1);
  });
});
