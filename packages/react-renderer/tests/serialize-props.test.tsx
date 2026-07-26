import { createElement } from "react";
import { describe, expect, test } from "vitest";
import type { UINode } from "@uniview/protocol";
import { HandlerRegistry, createRenderer, render, serializeTree } from "../src";
import { flush } from "./flush";


describe("serializeProps value handling", () => {
  test("keeps null-valued props (null is a valid JSONValue) but drops undefined", async () => {
    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    // value={null} is how a controlled input is cleared; title={undefined}
    // is React's "absent" and must not appear in serialized props.
    render(
      createElement("input", { value: null, placeholder: "p", title: undefined }),
      renderer,
    );
    await flush();

    const tree = serializeTree(renderer.rootInstance, registry) as UINode;
    expect(tree.props).toHaveProperty("value", null);
    expect(tree.props).toHaveProperty("placeholder", "p");
    expect(tree.props).not.toHaveProperty("title");
  });
});

describe("serializeProps handler props", () => {
  // Guards against narrowing the on[A-Z]* rule to the protocol's EVENT_PROPS.
  // EVENT_PROPS is only the DOM-style subset hosts auto-wire to input events;
  // hosts also bind app-level handler ids by name — AppKit reads
  // _onSelectHandlerId for menu items and _onActionHandlerId for the
  // Raycast-style surfaces, and the Svelte host relays unrecognized handler id
  // props to registered components. Dropping them here silently breaks every
  // <Action>, <MenuItem> and <List searchText> in the plugin API.
  test("mints ids for DOM events AND for app-level handlers outside EVENT_PROPS", async () => {
    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    render(
      createElement("Action", {
        onClick: () => "clicked",
        onAction: () => "acted",
        onSelect: () => "selected",
      }),
      renderer,
    );
    await flush();

    const tree = serializeTree(renderer.rootInstance, registry) as UINode;

    expect(tree.props).toHaveProperty(
      "_onClickHandlerId",
      `${tree.id}:onClick`,
    );
    expect(tree.props).toHaveProperty(
      "_onActionHandlerId",
      `${tree.id}:onAction`,
    );
    expect(tree.props).toHaveProperty(
      "_onSelectHandlerId",
      `${tree.id}:onSelect`,
    );
    expect(await registry.execute(`${tree.id}:onAction`)).toBe("acted");
    expect(registry.size).toBe(3);
  });

  test("leaves non-handler function props out of the tree and the registry", async () => {
    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    // `debugCallback` does not match on[A-Z]*, so it is neither serialized nor
    // registered — a function is not a JSONValue and no host could call it.
    render(
      createElement("div", {
        onClick: () => "clicked",
        debugCallback: () => "not serializable",
      }),
      renderer,
    );
    await flush();

    const tree = serializeTree(renderer.rootInstance, registry) as UINode;

    expect(tree.props).not.toHaveProperty("debugCallback");
    expect(tree.props).not.toHaveProperty("_debugCallbackHandlerId");
    expect(registry.size).toBe(1);
  });
});
