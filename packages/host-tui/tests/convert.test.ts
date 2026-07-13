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
