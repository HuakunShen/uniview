/**
 * Regression tests for Suspense support.
 *
 * hideInstance/unhideInstance (and the text variants) were previously
 * missing from the host config entirely — any plugin using <Suspense> or
 * React.lazy crashed with a bare TypeError the moment a boundary toggled.
 * Hidden nodes now stay mounted but leave the serialized tree; in
 * incremental mode the collector emits remove/insert mutations so the
 * host converges to exactly the full-mode serialization.
 */
import { Suspense, createElement, useState } from "react";
import { describe, expect, test } from "vitest";
import { textContent } from "@uniview/protocol";
import type { Mutation, UINode } from "@uniview/protocol";
import {
  HandlerRegistry,
  MutationCollector,
  createRenderer,
  render,
  serializeTree,
} from "../src";
import { MutableTree } from "../../host-sdk/src/mutable-tree";
import { flush } from "./flush";


function shape(node: UINode | string | null): string {
  if (node === null) return "null";
  const text = textContent(node);
  if (text !== null) return `text(${text})`;
  const n = node as UINode;
  return `${n.type}[${n.children.map(shape).join(",")}]`;
}

function createSuspender() {
  let resolvePromise: () => void = () => {};
  let resolved = false;
  const promise = new Promise<void>((r) => {
    resolvePromise = () => {
      resolved = true;
      r();
    };
  });
  function Suspender({ label }: { label: string }) {
    if (!resolved) throw promise;
    return createElement("span", null, label);
  }
  return { Suspender, resolve: () => resolvePromise() };
}

describe("suspense", () => {
  test("mount-time suspend shows fallback, then content (full mode)", async () => {
    const { Suspender, resolve } = createSuspender();
    function App() {
      return createElement(
        "div",
        null,
        createElement(
          Suspense,
          { fallback: createElement("p", null, "loading") },
          createElement(Suspender, { label: "ready" }),
        ),
      );
    }

    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    render(createElement(App), renderer);
    await flush();

    const during = serializeTree(renderer.rootInstance, registry) as UINode;
    expect(shape(during)).toContain("p[text(loading)]");
    expect(shape(during)).not.toContain("ready");

    resolve();
    // React throttles fallback->content transitions (~300ms)
    await flush(700);

    const after = serializeTree(renderer.rootInstance, registry) as UINode;
    expect(shape(after)).toContain("span[text(ready)]");
    expect(shape(after)).not.toContain("loading");
  });

  test("update-time suspend hides mounted content and host converges (incremental)", async () => {
    const { Suspender, resolve } = createSuspender();
    let setGen: (n: number) => void = () => {};

    function Gate({ gen }: { gen: number }) {
      if (gen === 0) return createElement("span", null, "initial");
      return createElement(Suspender, { label: `gen${gen}` });
    }
    function App() {
      const [gen, set] = useState(0);
      setGen = set;
      return createElement(
        "div",
        null,
        createElement("h1", null, "title"),
        createElement(
          Suspense,
          { fallback: createElement("p", null, "loading") },
          createElement(Gate, { gen }),
        ),
      );
    }

    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    const collector = new MutationCollector(registry);
    renderer.mutationCollector = collector;
    const batches: Mutation[][] = [];
    renderer.subscribeMutations((m) => batches.push(m));
    const host = new MutableTree();
    const drain = () => {
      for (const batch of batches.splice(0)) host.applyMutations(batch);
    };

    render(createElement(App), renderer);
    await flush();
    drain();
    expect(shape(host.getTree())).toContain("initial");

    // Trigger an update that suspends
    setGen(1);
    await flush(50);
    drain();

    const pluginNow = serializeTree(
      renderer.rootInstance,
      new HandlerRegistry(),
    ) as UINode;
    // Host must mirror the plugin's visible tree, whatever React chose to
    // show while suspended (kept old content in a transition, or fallback).
    expect(shape(host.getTree())).toBe(shape(pluginNow));

    resolve();
    // React throttles fallback->content transitions (~300ms)
    await flush(700);
    drain();

    const pluginAfter = serializeTree(
      renderer.rootInstance,
      new HandlerRegistry(),
    ) as UINode;
    expect(shape(pluginAfter)).toContain("span[text(gen1)]");
    expect(shape(host.getTree())).toBe(shape(pluginAfter));
  });
});
