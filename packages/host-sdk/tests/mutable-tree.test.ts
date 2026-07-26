import { TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MutableTree } from "../src/mutable-tree";

function textNode(id: string, text: string): UINode {
  return { id, type: TEXT_NODE_TYPE, props: {}, children: [], text };
}

function createRoot(): UINode {
  return {
    id: "root",
    type: "div",
    props: { className: "root" },
    children: [
      {
        id: "label",
        type: "span",
        props: {},
        children: [textNode("label-text", "before")],
      },
      textNode("tail-text", "tail"),
    ],
  };
}

function createNestedRoot(): UINode {
  return {
    id: "root",
    type: "div",
    props: {},
    children: [
      {
        id: "section",
        type: "section",
        props: {},
        children: [
          {
            id: "nested-label",
            type: "span",
            props: {},
            children: [textNode("nested-label-text", "before")],
          },
          { id: "nested-list", type: "div", props: {}, children: [] },
        ],
      },
    ],
  };
}

/** Collect console.error output so divergence reports can be asserted on. */
function captureErrors(): string[] {
  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    messages.push(args.map(String).join(" "));
  });
  return messages;
}

function childIds(node: UINode | null): string[] {
  return (node?.children ?? []).map((child) =>
    typeof child === "string" ? child : child.id,
  );
}

function getElementChild(node: UINode, index: number): UINode {
  const child = node.children[index];
  if (typeof child === "string") {
    throw new Error(`Expected element child at index ${index}`);
  }
  return child;
}

describe("MutableTree", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  test("applies setText by text node id", () => {
    const tree = new MutableTree();
    tree.init(createRoot());

    const next = tree.applyMutations([
      { type: "setText", nodeId: "label-text", text: "after" },
    ]);

    const label = next?.children[0];
    expect(typeof label).not.toBe("string");
    if (typeof label !== "string") {
      const text = label.children[0];
      expect(typeof text).not.toBe("string");
      if (typeof text !== "string") {
        expect(text.text).toBe("after");
      }
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
    ).toEqual(["label", "tail-text", "middle", "last"]);

    const afterRemove = tree.applyMutations([
      { type: "removeChild", parentId: "root", nodeId: "middle" },
    ]);

    expect(
      afterRemove?.children.map((child) =>
        typeof child === "string" ? child : child.id,
      ),
    ).toEqual(["label", "tail-text", "last"]);
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

    expect(
      tree.applyMutations([{ type: "setRoot", node: replacement }]),
    ).toEqual(replacement);
  });

  test("initializes an empty tree from an initial setRoot mutation", () => {
    const tree = new MutableTree();
    const root = createRoot();

    expect(tree.getTree()).toBeNull();
    expect(tree.applyMutations([{ type: "setRoot", node: root }])).toEqual(
      root,
    );
    expect(tree.getTree()).toEqual(root);
  });

  test("propagates nested mutations to the root tree", () => {
    const tree = new MutableTree();
    tree.init(createNestedRoot());

    const afterText = tree.applyMutations([
      { type: "setText", nodeId: "nested-label-text", text: "after" },
    ]);

    if (!afterText) throw new Error("Expected tree after setText");
    const sectionAfterText = getElementChild(afterText, 0);
    const labelAfterText = getElementChild(sectionAfterText, 0);
    const nestedText = getElementChild(labelAfterText, 0);
    expect(nestedText.text).toBe("after");

    const afterAppend = tree.applyMutations([
      {
        type: "appendChild",
        parentId: "nested-list",
        node: { id: "item", type: "span", props: {}, children: ["item"] },
      },
    ]);

    if (!afterAppend) throw new Error("Expected tree after appendChild");
    const sectionAfterAppend = getElementChild(afterAppend, 0);
    const listAfterAppend = getElementChild(sectionAfterAppend, 1);
    expect(
      listAfterAppend.children.map((child) =>
        typeof child === "string" ? child : child.id,
      ),
    ).toEqual(["item"]);
  });

  test("reports an appendChild against an unknown parent", () => {
    const errors = captureErrors();
    const tree = new MutableTree();
    tree.init(createRoot());

    const next = tree.applyMutations([
      {
        type: "appendChild",
        parentId: "ghost",
        node: { id: "orphan", type: "p", props: {}, children: ["orphan"] },
      },
    ]);

    expect(childIds(next)).toEqual(["label", "tail-text"]);
    expect(errors).toEqual([
      expect.stringContaining(
        "[uniview] appendChild parent ghost not found; dropping node orphan",
      ),
    ]);
  });

  test("reports the subtree lost when a move targets an unknown parent", () => {
    const errors = captureErrors();
    const tree = new MutableTree();
    tree.init(createRoot());

    // A move (detach + re-attach) whose destination is gone: the node is
    // detached and never re-attached, so the whole subtree disappears.
    const next = tree.applyMutations([
      {
        type: "appendChild",
        parentId: "ghost",
        node: {
          id: "label",
          type: "span",
          props: {},
          children: [textNode("label-text", "before")],
        },
      },
    ]);

    expect(childIds(next)).toEqual(["tail-text"]);
    expect(errors).toEqual([
      expect.stringContaining(
        "[uniview] appendChild parent ghost not found; dropping node label",
      ),
    ]);
  });

  test("reports an insertBefore against an unknown parent", () => {
    const errors = captureErrors();
    const tree = new MutableTree();
    tree.init(createRoot());

    const next = tree.applyMutations([
      {
        type: "insertBefore",
        parentId: "ghost",
        beforeId: "tail-text",
        node: { id: "orphan", type: "p", props: {}, children: ["orphan"] },
      },
    ]);

    expect(childIds(next)).toEqual(["label", "tail-text"]);
    expect(errors).toEqual([
      expect.stringContaining(
        "[uniview] insertBefore parent ghost not found; dropping node orphan",
      ),
    ]);
  });

  test("reports a removeChild against an unknown parent", () => {
    const errors = captureErrors();
    const tree = new MutableTree();
    tree.init(createRoot());

    const next = tree.applyMutations([
      { type: "removeChild", parentId: "ghost", nodeId: "label" },
    ]);

    expect(childIds(next)).toEqual(["label", "tail-text"]);
    expect(errors).toEqual([
      expect.stringContaining(
        "[uniview] removeChild parent ghost not found; label was not removed",
      ),
    ]);
  });

  test("reports a setProps against an unknown node", () => {
    const errors = captureErrors();
    const tree = new MutableTree();
    tree.init(createRoot());

    tree.applyMutations([
      { type: "setProps", nodeId: "ghost", props: { className: "hot" } },
    ]);

    expect(errors).toEqual([
      expect.stringContaining("[uniview] setProps target ghost not found"),
    ]);
  });

  test("reports a setText against an unknown node", () => {
    const errors = captureErrors();
    const tree = new MutableTree();
    tree.init(createRoot());

    tree.applyMutations([{ type: "setText", nodeId: "ghost", text: "after" }]);

    expect(errors).toEqual([
      expect.stringContaining("[uniview] setText target ghost not found"),
    ]);
  });
});
