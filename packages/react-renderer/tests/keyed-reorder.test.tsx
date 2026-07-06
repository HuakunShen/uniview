/**
 * Regression tests for keyed child reordering.
 *
 * React's commitPlacement reuses appendChild/insertBefore to MOVE existing
 * keyed instances. The host config must detach the child from its current
 * position first (DOM insertBefore does this implicitly; an array-based
 * children model must do it explicitly), otherwise reorders leave the same
 * InternalNode in the children array twice — serialized trees then contain
 * duplicate node ids, which crashes keyed renderers on the host (Svelte
 * `each_key_duplicate`).
 */
import { createElement, useState } from "react";
import { describe, expect, test } from "vitest";
import { HandlerRegistry, createRenderer, render, serializeTree } from "../src";
import type { UINode } from "@uniview/protocol";

let setItemsRef: (items: string[]) => void;

function ListApp() {
  const [items, setItems] = useState(["a", "b", "c", "d", "e", "f"]);
  setItemsRef = setItems;
  return createElement(
    "List",
    null,
    createElement(
      "Section",
      null,
      items.map((t) => createElement("Item", { key: t, title: t })),
    ),
  );
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

function collect(tree: UINode | string | null): { ids: string[]; titles: string[] } {
  const ids: string[] = [];
  const titles: string[] = [];
  (function walk(node: UINode | string | null): void {
    if (!node || typeof node === "string") return;
    ids.push(node.id);
    if (node.type === "Item") titles.push(String(node.props.title));
    for (const child of node.children ?? []) walk(child);
  })(tree);
  return { ids, titles };
}

function expectNoDuplicateIds(ids: string[]): void {
  expect(new Set(ids).size).toBe(ids.length);
}

describe("keyed reorder", () => {
  test("moves, shuffles, and add/remove never duplicate nodes", async () => {
    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    render(createElement(ListApp), renderer);
    await flush();

    const scenarios: Array<{ next: string[]; expected: string }> = [
      { next: ["f", "e", "d", "c", "b", "a"], expected: "fedcba" },
      { next: ["c", "a", "f", "b", "e", "d"], expected: "cafbed" },
      { next: ["a", "b", "c", "d", "e", "f"], expected: "abcdef" },
      // subset in a different relative order (search-filter shape)
      { next: ["e", "b"], expected: "eb" },
      // restore full list in yet another order (clear-search shape)
      { next: ["d", "f", "a", "c", "e", "b"], expected: "dfaceb" },
      // adds + removals + moves at once
      { next: ["b", "x", "a", "y", "c"], expected: "bxayc" },
    ];

    for (const { next, expected } of scenarios) {
      setItemsRef(next);
      await flush();
      registry.clear();
      const tree = serializeTree(renderer.rootInstance!, registry);
      const { ids, titles } = collect(tree);
      expect(titles.join("")).toBe(expected);
      expectNoDuplicateIds(ids);
    }
  });
});
