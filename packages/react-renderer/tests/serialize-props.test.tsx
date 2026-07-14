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
