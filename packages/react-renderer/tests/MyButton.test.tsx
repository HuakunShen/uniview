import type { Mutation } from "@uniview/protocol";
import { createElement } from "react";
import { describe, expect, test } from "vitest";
import {
  HandlerRegistry,
  MutationCollector,
  createRenderBridge,
  render,
  serializeTree,
  type RenderBridge,
} from "../src";

function Demo() {
  return createElement(
    "div",
    { className: "root" },
    createElement("button", { onClick: () => undefined }, "Click me"),
    createElement("span", null, "Hello"),
  );
}

function ListDemo({ items }: { items: string[] }) {
  return createElement(
    "div",
    { className: "list" },
    items.map((item) => createElement("span", { key: item }, item)),
  );
}

async function waitForRoot(bridge: RenderBridge): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (bridge.rootInstance) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Rendered tree did not commit");
}

async function waitForMutationBatch(
  batches: Mutation[][],
): Promise<Mutation[]> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const batch = batches[0];
    if (batch) return batch;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Rendered tree did not emit mutations");
}

describe("react renderer", () => {
  test("serializes a rendered React tree into UINode", async () => {
    const bridge = createRenderBridge();
    const registry = new HandlerRegistry();

    render(createElement(Demo), bridge);
    await waitForRoot(bridge);

    const tree = serializeTree(bridge.rootInstance, registry);

    expect(tree).toMatchObject({
      type: "div",
      props: { className: "root" },
    });

    if (!tree || typeof tree === "string") {
      throw new Error("Expected root UINode");
    }

    expect(tree.children).toHaveLength(2);
    expect(registry.size).toBe(1);
  });

  test("emits a setRoot mutation on initial incremental render", async () => {
    const bridge = createRenderBridge();
    const registry = new HandlerRegistry();
    const batches: Mutation[][] = [];

    bridge.mutationCollector = new MutationCollector(registry);
    bridge.subscribeMutations((mutations) => batches.push(mutations));

    render(createElement(Demo), bridge);

    const firstBatch = await waitForMutationBatch(batches);
    const setRoot = firstBatch.find(
      (mutation) => mutation.type === "setRoot" && mutation.node !== null,
    );

    if (!setRoot || setRoot.type !== "setRoot" || !setRoot.node) {
      throw new Error(
        `Initial incremental render did not emit setRoot: ${JSON.stringify(firstBatch)}`,
      );
    }

    expect(setRoot.node).toMatchObject({
      type: "div",
      props: { className: "root" },
    });
    expect(setRoot.node.children).toHaveLength(2);
  });

  test("emits child mutations when a keyed list grows", async () => {
    const bridge = createRenderBridge();
    const registry = new HandlerRegistry();
    const batches: Mutation[][] = [];

    bridge.mutationCollector = new MutationCollector(registry);
    bridge.subscribeMutations((mutations) => batches.push(mutations));

    render(createElement(ListDemo, { items: ["a"] }), bridge);
    await waitForRoot(bridge);

    batches.length = 0;
    render(createElement(ListDemo, { items: ["a", "b"] }), bridge);

    const updateBatch = await waitForMutationBatch(batches);
    expect(
      updateBatch.some(
        (mutation) =>
          (mutation.type === "appendChild" ||
            mutation.type === "insertBefore") &&
          mutation.node.type === "span" &&
          mutation.node.children.includes("b"),
      ),
      `Expected list growth mutation, got ${JSON.stringify(updateBatch)}`,
    ).toBe(true);
  });
});
