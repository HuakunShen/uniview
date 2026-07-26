import { TEXT_NODE_TYPE } from "@uniview/protocol";
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
        _onClickHandlerId: "button-1:onClick",
        variant: "primary",
        disabled: false,
        // null is a valid JSONValue and is now preserved; undefinedValue and
        // the non-on[A-Z] debugCallback function are still dropped.
        nullable: null,
      },
      children: [
        {
          id: "text-1",
          type: TEXT_NODE_TYPE,
          props: {},
          children: [],
          text: "Save",
        },
      ],
    });
    expect(registry.size).toBe(1);
    expect(registry.has("button-1:onClick")).toBe(true);
    expect(await registry.execute("button-1:onClick")).toBe("clicked");
  });

  // Guards against narrowing the on[A-Z]* rule to the protocol's EVENT_PROPS.
  // EVENT_PROPS is only the DOM-style subset hosts auto-wire to input events;
  // hosts also bind app-level handler ids by name — AppKit reads
  // _onSelectHandlerId for menu items and _onActionHandlerId for the
  // Raycast-style surfaces, and the Svelte host relays unrecognized handler id
  // props to registered components. Dropping them here silently breaks every
  // <Action>, <MenuItem> and <List searchText> in the plugin API.
  test("mints ids for app-level handlers outside EVENT_PROPS too", async () => {
    const registry = new HandlerRegistry();
    const action = createElementNode("action-1", "Action", {
      onClick: () => "clicked",
      onAction: () => "acted",
      onSelect: () => "selected",
    });

    const serialized = serializeTree(action, registry);

    expect(serialized).toEqual({
      id: "action-1",
      type: "Action",
      props: {
        _onClickHandlerId: "action-1:onClick",
        _onActionHandlerId: "action-1:onAction",
        _onSelectHandlerId: "action-1:onSelect",
      },
      children: [],
    });
    expect(registry.size).toBe(3);
    expect(await registry.execute("action-1:onAction")).toBe("acted");
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
          children: [
            {
              id: "text-1",
              type: TEXT_NODE_TYPE,
              props: {},
              children: [],
              text: "Ready",
            },
          ],
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
