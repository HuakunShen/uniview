/**
 * Server-renders ComponentRenderer to assert on the markup and the props it
 * hands to registered components. `use:` actions do not run during SSR, so the
 * event *wiring* is covered by event-handlers.test.ts; what is asserted here is
 * everything visible in the rendered output: composed classes, and which
 * handler props a registered component receives.
 */
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { UINode } from "@uniview/protocol";
import type { ComponentRegistry } from "@uniview/host-sdk";
import type { Component } from "svelte";
import ComponentRenderer from "../src/ComponentRenderer.svelte";
import HandlerProbe from "./fixtures/HandlerProbe.svelte";

function renderNode(node: UINode, registry?: ComponentRegistry<Component>): string {
  const controller = { executeHandler: async () => {} };
  const context = new Map<string, unknown>([
    ["uniview:controller", controller],
    ["uniview:registry", registry],
  ]);
  return render(ComponentRenderer as never, { props: { node }, context }).body;
}

function node(partial: Partial<UINode> & { type: string }): UINode {
  return {
    id: partial.id ?? "n1",
    type: partial.type,
    props: partial.props ?? {},
    children: partial.children ?? [],
  } as UINode;
}

function probeRegistry(type: string): ComponentRegistry<Component> {
  return {
    register: () => {},
    get: (t: string) => (t === type ? (HandlerProbe as Component) : undefined),
    has: (t: string) => t === type,
    list: () => [type],
    clear: () => {},
  };
}

describe("ComponentRenderer — button class composition", () => {
  it("keeps cursor-pointer when the plugin also sets a className", () => {
    const html = renderNode(
      node({ type: "button", props: { className: "bg-red-500 px-4" } }),
    );
    expect(html).toContain("cursor-pointer");
    expect(html).toContain("bg-red-500 px-4");
  });

  it("still applies cursor-pointer when the plugin sets no className", () => {
    expect(renderNode(node({ type: "button" }))).toContain("cursor-pointer");
  });
});

describe("ComponentRenderer — onWheel", () => {
  it("consumes _onWheelHandlerId instead of leaking it as a DOM attribute", () => {
    const html = renderNode(
      node({ type: "div", props: { _onWheelHandlerId: "h_wheel" } }),
    );
    expect(html).not.toContain("_onWheelHandlerId");
    expect(html).not.toContain("h_wheel");
  });
});

describe("ComponentRenderer — registered component props", () => {
  it("passes hover and wheel handlers to registered components", () => {
    const html = renderNode(
      node({
        type: "MyPrimitive",
        props: {
          _onClickHandlerId: "h_click",
          _onMouseEnterHandlerId: "h_enter",
          _onMouseLeaveHandlerId: "h_leave",
          _onWheelHandlerId: "h_wheel",
        },
      }),
      probeRegistry("MyPrimitive"),
    );
    expect(html).toContain("onmouseenter");
    expect(html).toContain("onmouseleave");
    expect(html).toContain("onwheel");
    expect(html).toContain("onclick");
  });

  it("omits handlers the plugin did not declare", () => {
    const html = renderNode(
      node({ type: "MyPrimitive", props: { _onClickHandlerId: "h_click" } }),
      probeRegistry("MyPrimitive"),
    );
    expect(html).toContain("onclick");
    expect(html).not.toContain("onmouseenter");
    expect(html).not.toContain("onwheel");
  });
});
