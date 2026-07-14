import { describe, expect, it } from "vitest";
import { TEXT_NODE_TYPE, handlerIdProp, type UINode } from "@uniview/protocol";
import { buildSemanticTree } from "../src/semantics";

const text = (id: string, t: string): UINode => ({
  id,
  type: TEXT_NODE_TYPE,
  props: {},
  children: [],
  text: t,
});

describe("buildSemanticTree — role inference", () => {
  it("infers button from an onClick handler", () => {
    const node: UINode = {
      id: "b",
      type: "box",
      props: { [handlerIdProp("onClick")]: "h1" },
      children: [text("t", "Save")],
    };
    const tree = buildSemanticTree(node);
    expect(tree).toMatchObject({ id: "b", role: "button", name: "Save" });
  });

  it("uses an explicit role prop over inference", () => {
    const node: UINode = {
      id: "s",
      type: "box",
      props: { role: "status" },
      children: [text("t", "Updated")],
    };
    expect(buildSemanticTree(node)).toMatchObject({ role: "status", name: "Updated" });
  });

  it("marks text nodes with the text role and content", () => {
    expect(buildSemanticTree(text("t", "hello"))).toMatchObject({
      role: "text",
      text: "hello",
    });
  });

  it("infers checkbox with its checked state", () => {
    const node: UINode = {
      id: "c",
      type: "checkbox",
      props: { checked: true, label: "Agree" },
      children: [],
    };
    expect(buildSemanticTree(node)).toMatchObject({
      role: "checkbox",
      checked: true,
      name: "Agree",
    });
  });

  it("carries disabled and selected state", () => {
    const node: UINode = {
      id: "tab",
      type: "box",
      props: { role: "tab", selected: true, disabled: true, "aria-label": "Files" },
      children: [],
    };
    expect(buildSemanticTree(node)).toMatchObject({
      role: "tab",
      selected: true,
      disabled: true,
      name: "Files",
    });
  });

  it("treats a plain box as a group and recurses", () => {
    const node: UINode = {
      id: "root",
      type: "box",
      props: {},
      children: [
        { id: "b", type: "box", props: { [handlerIdProp("onClick")]: "h" }, children: [text("t", "Go")] },
      ],
    };
    const tree = buildSemanticTree(node);
    expect(tree?.role).toBe("group");
    expect(tree?.children[0]).toMatchObject({ role: "button", name: "Go" });
  });
});
