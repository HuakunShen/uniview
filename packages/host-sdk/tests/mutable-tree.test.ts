import type { UINode } from "@uniview/protocol";
import { describe, expect, test } from "vitest";
import { MutableTree } from "../src/mutable-tree";

function createRoot(): UINode {
  return {
    id: "root",
    type: "div",
    props: { className: "root" },
    children: [
      { id: "label", type: "span", props: {}, children: ["before"] },
      "tail",
    ],
  };
}

describe("MutableTree", () => {
  test("initializes and returns the current tree", () => {
    const tree = new MutableTree();
    const root = createRoot();

    tree.init(root);

    expect(tree.getTree()).toBe(root);
  });

  test("applies setProps to an indexed node", () => {
    const tree = new MutableTree();
    tree.init(createRoot());

    const next = tree.applyMutations([
      { type: "setProps", nodeId: "label", props: { className: "hot" } },
    ]);

    const label = next?.children[0];
    expect(typeof label).not.toBe("string");
    if (typeof label !== "string") {
      expect(label.props).toEqual({ className: "hot" });
    }
  });

  test("applies setText by parent and child index", () => {
    const tree = new MutableTree();
    tree.init(createRoot());

    const next = tree.applyMutations([
      { type: "setText", parentId: "label", childIndex: 0, text: "after" },
    ]);

    const label = next?.children[0];
    expect(typeof label).not.toBe("string");
    if (typeof label !== "string") {
      expect(label.children).toEqual(["after"]);
    }
  });

  test("appends, inserts, and removes child nodes", () => {
    const tree = new MutableTree();
    tree.init(createRoot());

    tree.applyMutations([
      {
        type: "appendChild",
        parentId: "root",
        node: { id: "last", type: "p", props: {}, children: ["last"] },
      },
      {
        type: "insertBefore",
        parentId: "root",
        beforeId: "last",
        node: { id: "middle", type: "p", props: {}, children: ["middle"] },
      },
    ]);

    const afterInsert = tree.getTree();
    expect(
      afterInsert?.children.map((child) =>
        typeof child === "string" ? child : child.id,
      ),
    ).toEqual(["label", "tail", "middle", "last"]);

    const afterRemove = tree.applyMutations([
      { type: "removeChild", parentId: "root", nodeId: "middle" },
    ]);

    expect(
      afterRemove?.children.map((child) =>
        typeof child === "string" ? child : child.id,
      ),
    ).toEqual(["label", "tail", "last"]);
  });

  test("replaces the root with setRoot", () => {
    const tree = new MutableTree();
    tree.init(createRoot());

    const replacement: UINode = {
      id: "replacement",
      type: "section",
      props: {},
      children: ["new root"],
    };

    expect(tree.applyMutations([{ type: "setRoot", node: replacement }])).toEqual(
      replacement,
    );
  });
});
