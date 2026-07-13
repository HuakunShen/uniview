import { describe, expect, it } from "vitest";
import { TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import { MutableTree } from "../src/mutable-tree";

const el = (id: string, type = "box", children: (UINode | string)[] = []): UINode => ({
  id,
  type,
  props: {},
  children,
});

const textNode = (id: string, text: string): UINode => ({
  id,
  type: TEXT_NODE_TYPE,
  props: {},
  children: [],
  text,
});

describe("MutableTree — setRoot", () => {
  it("sets the root and indexes descendants by id", () => {
    const tree = new MutableTree();
    tree.apply({ type: "setRoot", node: el("root", "box", [el("child")]) });
    expect(tree.getRoot()?.id).toBe("root");
    expect(tree.getNode("child")?.type).toBe("box");
  });

  it("clears the previous index when the root is replaced", () => {
    const tree = new MutableTree();
    tree.apply({ type: "setRoot", node: el("root", "box", [el("old")]) });
    tree.apply({ type: "setRoot", node: el("root2") });
    expect(tree.getNode("old")).toBeUndefined();
    expect(tree.getRoot()?.id).toBe("root2");
  });
});

describe("MutableTree — child mutations", () => {
  it("appends a child to a parent", () => {
    const tree = new MutableTree();
    tree.apply({ type: "setRoot", node: el("root") });
    tree.apply({ type: "appendChild", parentId: "root", node: el("a") });
    tree.apply({ type: "appendChild", parentId: "root", node: el("b") });
    expect(tree.getRoot()?.children.map((c) => (c as UINode).id)).toEqual(["a", "b"]);
    expect(tree.getNode("a")).toBeDefined();
  });

  it("inserts a child before a reference node", () => {
    const tree = new MutableTree();
    tree.apply({ type: "setRoot", node: el("root", "box", [el("a"), el("c")]) });
    tree.apply({ type: "insertBefore", parentId: "root", node: el("b"), beforeId: "c" });
    expect(tree.getRoot()?.children.map((c) => (c as UINode).id)).toEqual(["a", "b", "c"]);
  });

  it("removes a child and unindexes its subtree", () => {
    const tree = new MutableTree();
    tree.apply({ type: "setRoot", node: el("root", "box", [el("a", "box", [el("a1")])]) });
    tree.apply({ type: "removeChild", parentId: "root", nodeId: "a" });
    expect(tree.getRoot()?.children).toEqual([]);
    expect(tree.getNode("a")).toBeUndefined();
    expect(tree.getNode("a1")).toBeUndefined();
  });

  it("treats appendChild of an existing node as a move (no duplicate)", () => {
    const tree = new MutableTree();
    tree.apply({
      type: "setRoot",
      node: el("root", "box", [el("p1", "box", [el("x")]), el("p2")]),
    });
    tree.apply({ type: "appendChild", parentId: "p2", node: el("x") });
    expect(tree.getNode("p1")?.children).toEqual([]);
    expect(tree.getNode("p2")?.children.map((c) => (c as UINode).id)).toEqual(["x"]);
  });
});

describe("MutableTree — node mutations", () => {
  it("updates props", () => {
    const tree = new MutableTree();
    tree.apply({ type: "setRoot", node: el("root") });
    tree.apply({ type: "setProps", nodeId: "root", props: { color: "red" } });
    expect(tree.getNode("root")?.props).toEqual({ color: "red" });
  });

  it("updates text on a text node", () => {
    const tree = new MutableTree();
    tree.apply({ type: "setRoot", node: el("root", "box", [textNode("t", "hi")]) });
    tree.apply({ type: "setText", nodeId: "t", text: "bye" });
    expect(tree.getNode("t")?.text).toBe("bye");
  });
});

describe("MutableTree — applyBatch", () => {
  it("applies mutations in order", () => {
    const tree = new MutableTree();
    tree.applyBatch([
      { type: "setRoot", node: el("root") },
      { type: "appendChild", parentId: "root", node: el("a") },
      { type: "setProps", nodeId: "a", props: { x: 1 } },
    ]);
    expect(tree.getNode("a")?.props).toEqual({ x: 1 });
  });
});
