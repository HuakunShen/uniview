import { describe, expect, test } from "vitest";
import type { Mutation, UINode } from "@uniview/protocol";
import { validateIncomingTree, validateIncomingMutations } from "../src/validate";

describe("host-sdk incoming validation", () => {
  test("accepts a valid v3 tree (with text node) and null", () => {
    const tree: UINode = {
      id: "root",
      type: "div",
      props: {},
      children: [
        { id: "t", type: "#text", props: {}, children: [], text: "hi" },
      ],
    };
    expect(validateIncomingTree(tree)).toBeNull();
    expect(validateIncomingTree(null)).toBeNull();
  });

  test("flags a malformed tree", () => {
    const bad = { id: "root", type: "div" } as unknown as UINode;
    expect(validateIncomingTree(bad)).toContain("invalid updateTree");
  });

  test("accepts a valid mutation batch", () => {
    const mutations: Mutation[] = [
      { type: "setText", nodeId: "t", text: "x" },
      { type: "removeChild", parentId: "root", nodeId: "t" },
    ];
    expect(validateIncomingMutations(mutations)).toBeNull();
  });

  test("flags a malformed mutation batch", () => {
    const bad = [{ type: "setText", parentId: "root", childIndex: 0, text: "x" }] as unknown as Mutation[];
    expect(validateIncomingMutations(bad)).toContain("invalid mutations");
  });
});
