import { describe, expect, it } from "vitest";
import { TEXT_NODE_TYPE, handlerIdProp, type UINode } from "@uniview/protocol";
import { uinodeToRenderNode, extractHandlers } from "../src/convert";

const text = (id: string, t: string): UINode => ({
  id,
  type: TEXT_NODE_TYPE,
  props: {},
  children: [],
  text: t,
});

describe("uinodeToRenderNode", () => {
  it("converts a text node to a text render node", () => {
    expect(uinodeToRenderNode(text("t", "hi"))).toEqual({ type: "text", text: "hi" });
  });

  it("converts a bare string child to text", () => {
    expect(uinodeToRenderNode("hello")).toEqual({ type: "text", text: "hello" });
  });

  it("maps a text element's props to a text style and joins its text", () => {
    const node: UINode = {
      id: "label",
      type: "text",
      props: { color: "cyan", bold: true },
      children: [text("t", "Hello")],
    };
    expect(uinodeToRenderNode(node)).toEqual({
      type: "text",
      id: "label",
      text: "Hello",
      textStyle: { fg: "cyan", bold: true },
      style: {},
    });
  });

  it("maps layout props to a TuiStyle on a box", () => {
    const node: UINode = {
      id: "root",
      type: "box",
      props: { flexDirection: "row", padding: 1, gap: 2, width: 20 },
      children: [],
    };
    const rendered = uinodeToRenderNode(node);
    expect(rendered).toMatchObject({
      type: "box",
      id: "root",
      style: { flexDirection: "row", padding: 1, gap: 2, width: 20 },
      children: [],
    });
  });

  it("maps backgroundColor to a background fill and preserves nesting", () => {
    const node: UINode = {
      id: "panel",
      type: "box",
      props: { backgroundColor: "blue" },
      children: [{ id: "c", type: "box", props: {}, children: [] }],
    };
    const rendered = uinodeToRenderNode(node);
    expect(rendered?.background).toBe("blue");
    expect(rendered?.children?.[0]).toMatchObject({ type: "box", id: "c" });
  });

  it("does not leak handler-id props into the style", () => {
    const node: UINode = {
      id: "btn",
      type: "box",
      props: { [handlerIdProp("onClick")]: "h1", padding: 1 },
      children: [],
    };
    expect(uinodeToRenderNode(node)?.style).toEqual({ padding: 1 });
  });
});

describe("extractHandlers", () => {
  it("collects handler ids per node across the tree", () => {
    const tree: UINode = {
      id: "root",
      type: "box",
      props: {},
      children: [
        {
          id: "btn",
          type: "box",
          props: { [handlerIdProp("onClick")]: "h1" },
          children: [],
        },
        {
          id: "field",
          type: "box",
          props: { [handlerIdProp("onChange")]: "h2" },
          children: [],
        },
      ],
    };
    const handlers = extractHandlers(tree);
    expect(handlers.get("btn")).toEqual({ onClick: "h1" });
    expect(handlers.get("field")).toEqual({ onChange: "h2" });
    expect(handlers.get("root")).toBeUndefined();
  });
});

describe("uinodeToRenderNode — richtext", () => {
  it("maps a richtext node's spans prop to RenderNode.spans", () => {
    const node: UINode = {
      id: "line-1",
      type: "richtext",
      props: {
        spans: [
          { text: "const", style: { fg: "blue", bold: true } },
          { text: " x", style: {} },
        ],
      },
      children: [],
    };
    expect(uinodeToRenderNode(node)).toEqual({
      type: "richtext",
      id: "line-1",
      style: {},
      spans: [
        { text: "const", style: { fg: "blue", bold: true } },
        { text: " x", style: {} },
      ],
    });
  });

  it("passes a background prop through and defaults empty spans", () => {
    const node: UINode = {
      id: "hl",
      type: "richtext",
      props: { backgroundColor: "red" },
      children: [],
    };
    const rendered = uinodeToRenderNode(node);
    expect(rendered).toMatchObject({ type: "richtext", spans: [], background: "red" });
  });

  it("accepts an { r, g, b } background (not just string colors)", () => {
    const node: UINode = {
      id: "panel",
      type: "box",
      props: { backgroundColor: { r: 24, g: 26, b: 38 } },
      children: [],
    };
    expect(uinodeToRenderNode(node)).toMatchObject({ background: { r: 24, g: 26, b: 38 } });
  });

  it("accepts an { r, g, b } text color", () => {
    const node: UINode = {
      id: "label",
      type: "text",
      props: { color: { r: 255, g: 0, b: 0 } },
      children: [],
    };
    expect(uinodeToRenderNode(node)).toMatchObject({ textStyle: { fg: { r: 255, g: 0, b: 0 } } });
  });

  it("ignores a malformed spans prop (not an array)", () => {
    const node: UINode = {
      id: "bad",
      type: "richtext",
      props: { spans: "oops" },
      children: [],
    };
    expect(uinodeToRenderNode(node)).toMatchObject({ type: "richtext", spans: [] });
  });
});
