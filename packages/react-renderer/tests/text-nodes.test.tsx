/**
 * Regression tests for protocol v3 explicit text nodes.
 *
 * Before v3, text children had no protocol identity: full-tree
 * serialization emitted bare strings while mutations wrapped them in
 * ad-hoc nodes. Inserting an element before a text sibling could never
 * match its anchor on the host (the mutation carried a text id, the host
 * held a bare string) and silently appended out of order; dynamically
 * appended text rendered as an unknown component on hosts.
 *
 * These tests drive the react renderer in incremental mode and apply the
 * emitted mutations to a host-side MutableTree, asserting the host tree
 * converges to exactly the full-mode serialization.
 */
import { createElement, useState } from "react";
import { describe, expect, test } from "vitest";
import { TEXT_NODE_TYPE, textContent } from "@uniview/protocol";
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


interface Harness {
  host: MutableTree;
  drain: () => void;
  pluginTruth: () => UINode;
}

function setupIncremental(element: React.ReactElement): Harness {
  const renderer = createRenderer();
  const registry = new HandlerRegistry();
  const collector = new MutationCollector(registry);
  renderer.mutationCollector = collector;

  const batches: Mutation[][] = [];
  renderer.subscribeMutations((m) => batches.push(m));
  const host = new MutableTree();

  render(element, renderer);

  return {
    host,
    drain() {
      for (const batch of batches.splice(0)) {
        host.applyMutations(batch);
      }
    },
    pluginTruth() {
      return serializeTree(renderer.rootInstance, new HandlerRegistry()) as UINode;
    },
  };
}

function shape(node: UINode | string): string {
  const text = textContent(node);
  if (text !== null) return `text(${text})`;
  const n = node as UINode;
  return `${n.type}[${n.children.map(shape).join(",")}]`;
}

describe("protocol v3 text nodes", () => {
  test("inserting an element before a text sibling keeps order on the host", async () => {
    let toggle: (v: boolean) => void = () => {};
    function App() {
      const [show, set] = useState(false);
      toggle = set;
      return createElement(
        "div",
        null,
        show ? createElement("span", null, "S") : null,
        "tail-text",
      );
    }

    const h = setupIncremental(createElement(App));
    await flush();
    h.drain();

    toggle(true);
    await flush();
    h.drain();

    expect(shape(h.host.getTree()!)).toBe(shape(h.pluginTruth()));
    // span must be BEFORE the text child
    const kinds = h.host.getTree()!.children.map((c) =>
      typeof c !== "string" && c.type === TEXT_NODE_TYPE ? "TEXT" : "span",
    );
    expect(kinds).toEqual(["span", "TEXT"]);
  });

  test("appended text arrives as a text node and matches full-mode output", async () => {
    let add: () => void = () => {};
    function App() {
      const [n, set] = useState(1);
      add = () => set((x) => x + 1);
      const kids: (string | React.ReactElement)[] = [];
      for (let i = 0; i < n; i++) {
        kids.push(createElement("span", { key: `s${i}` }, `item${i}`));
      }
      if (n >= 2) kids.push(`count:${n}`);
      return createElement("div", null, ...kids);
    }

    const h = setupIncremental(createElement(App));
    await flush();
    h.drain();

    add();
    await flush();
    h.drain();

    const hostTree = h.host.getTree()!;
    expect(shape(hostTree)).toBe(shape(h.pluginTruth()));

    const last = hostTree.children[hostTree.children.length - 1];
    expect(typeof last).not.toBe("string");
    if (typeof last !== "string") {
      expect(last.type).toBe(TEXT_NODE_TYPE);
      expect(last.text).toBe("count:2");
    }
  });

  test("setText updates the right node even after reorders", async () => {
    let setItems: (items: string[]) => void = () => {};
    let bump: () => void = () => {};
    function App() {
      const [items, set] = useState(["a", "b", "c"]);
      const [n, setN] = useState(0);
      setItems = set;
      bump = () => setN((x) => x + 1);
      return createElement(
        "div",
        null,
        items.map((t) => createElement("span", { key: t }, t)),
        `count:${n}`,
      );
    }

    const h = setupIncremental(createElement(App));
    await flush();
    h.drain();

    // Reorder, then update the trailing text
    setItems(["c", "a", "b"]);
    await flush();
    h.drain();
    bump();
    await flush();
    h.drain();

    expect(shape(h.host.getTree()!)).toBe(shape(h.pluginTruth()));
    const last = h.host.getTree()!.children.at(-1)!;
    expect(textContent(last)).toBe("count:1");
  });
});
