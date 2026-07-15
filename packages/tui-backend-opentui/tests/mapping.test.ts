import { describe, expect, it } from "vitest";
import type { RenderNode } from "@uniview/tui-core";
import { toOpenTuiDescriptor } from "../src/mapping";

describe("toOpenTuiDescriptor", () => {
  it("maps a text node with a text style", () => {
    const node: RenderNode = {
      type: "text",
      text: "Hi",
      textStyle: { fg: "cyan", bold: true },
    };
    expect(toOpenTuiDescriptor(node)).toEqual({
      type: "text",
      content: "Hi",
      options: { fg: "cyan", attributes: { bold: true } },
    });
  });

  it("maps a box's layout, background and border", () => {
    const node: RenderNode = {
      type: "box",
      background: "blue",
      style: { flexDirection: "column", padding: 1, width: 20, border: "rounded" },
      children: [{ type: "text", text: "x" }],
    };
    const d = toOpenTuiDescriptor(node);
    expect(d).toMatchObject({
      type: "box",
      options: {
        flexDirection: "column",
        padding: 1,
        width: 20,
        backgroundColor: "blue",
        borderStyle: "rounded",
      },
    });
    expect(d.type === "box" && d.children[0]).toMatchObject({ type: "text", content: "x" });
  });

  it("omits an absent/none border and preserves nesting depth", () => {
    const node: RenderNode = {
      type: "box",
      children: [{ type: "box", children: [{ type: "text", text: "deep" }] }],
    };
    const d = toOpenTuiDescriptor(node);
    expect(d.type === "box" && d.options.borderStyle).toBeUndefined();
    const inner = d.type === "box" ? d.children[0] : undefined;
    const leaf = inner && inner.type === "box" ? inner.children[0] : undefined;
    expect(leaf).toMatchObject({ type: "text", content: "deep" });
  });
});
