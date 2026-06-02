import { describe, expect, test } from "vitest";
import { HandlerRegistry, SolidMutationCollector, serializeTree } from "../src";
import type { SolidNode, SolidTextNode } from "../src";

function createTextNode(
  id: string,
  value: string,
  parent: SolidNode | null = null,
): SolidTextNode {
  return {
    _type: "text",
    id,
    value,
    parent,
  };
}

function createElementNode(
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  children: SolidNode["children"] = [],
): SolidNode {
  const node: SolidNode = {
    _type: "element",
    id,
    type,
    props,
    children,
    parent: null,
  };

  for (const child of children) {
    child.parent = node;
  }

  return node;
}

describe("solid renderer serialization", () => {
  test("serializes UI trees and converts supported event handlers to handler IDs", async () => {
    const registry = new HandlerRegistry();
    const label = createTextNode("text-1", "Save");
    const button = createElementNode(
      "button-1",
      "Button",
      {
        onClick: () => "clicked",
        debugCallback: () => "not serializable",
        variant: "primary",
        disabled: false,
        nullable: null,
        undefinedValue: undefined,
      },
      [label],
    );

    const serialized = serializeTree(button, registry);

    expect(serialized).toEqual({
      id: "button-1",
      type: "Button",
      props: {
        _onClickHandlerId: "handler_0",
        variant: "primary",
        disabled: false,
      },
      children: ["Save"],
    });
    expect(registry.size).toBe(1);
    expect(registry.has("handler_0")).toBe(true);
    expect(await registry.execute("handler_0")).toBe("clicked");
  });

  test("collects incremental mutations using serialized node payloads", () => {
    const registry = new HandlerRegistry();
    const collector = new SolidMutationCollector(registry);
    const label = createTextNode("text-1", "Ready");
    const text = createElementNode("text-node-1", "Text", { color: "green" }, [
      label,
    ]);
    const root = createElementNode("root", "div");

    collector.collectAppendChild(root, text);
    collector.collectSetProps(text);

    expect(collector.flushCommit()).toEqual([
      {
        type: "appendChild",
        parentId: "root",
        node: {
          id: "text-node-1",
          type: "Text",
          props: { color: "green" },
          children: ["Ready"],
        },
      },
      {
        type: "setProps",
        nodeId: "text-node-1",
        props: { color: "green" },
      },
    ]);
    expect(collector.flushCommit()).toEqual([]);
  });
});
