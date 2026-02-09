import type { Mutation, UINode } from "@uniview/protocol";

export type TreeUpdate =
  | { type: "full"; tree: UINode | null }
  | { type: "mutations"; mutations: Mutation[] };

export class MutableTree {
  private root: UINode | null = null;
  private nodes = new Map<string, UINode>();

  init(tree: UINode | null): void {
    this.root = tree;
    this.nodes.clear();
    if (tree) {
      this.buildNodeMap(tree);
    }
  }

  apply(mutations: Mutation[]): void {
    for (const mutation of mutations) {
      this.applyMutation(mutation);
    }
  }

  getRoot(): UINode | null {
    return this.root;
  }

  getNode(id: string): UINode | undefined {
    return this.nodes.get(id);
  }

  private buildNodeMap(node: UINode): void {
    this.nodes.set(node.id, node);
    for (const child of node.children) {
      if (typeof child !== "string") {
        this.buildNodeMap(child);
      }
    }
  }

  private applyMutation(mutation: Mutation): void {
    switch (mutation.type) {
      case "create":
        this.applyCreate(mutation);
        break;
      case "remove":
        this.applyRemove(mutation);
        break;
      case "setProp":
        this.applySetProp(mutation);
        break;
      case "removeProp":
        this.applyRemoveProp(mutation);
        break;
      case "setText":
        this.applySetText(mutation);
        break;
      case "reorder":
        this.applyReorder(mutation);
        break;
    }
  }

  private applyCreate(mutation: Extract<Mutation, { type: "create" }>): void {
    const newNode: UINode = {
      id: mutation.nodeId,
      type: mutation.nodeType,
      props: mutation.props || {},
      children: [],
    };
    this.nodes.set(mutation.nodeId, newNode);

    if (mutation.parentId === null) {
      this.root = newNode;
    } else {
      const parent = this.nodes.get(mutation.parentId);
      if (parent) {
        const index = Math.min(mutation.index, parent.children.length);
        parent.children.splice(index, 0, newNode);
      }
    }
  }

  private applyRemove(mutation: Extract<Mutation, { type: "remove" }>): void {
    const parent = this.nodes.get(mutation.parentId);
    if (parent) {
      const index = parent.children.findIndex(
        (child) => typeof child !== "string" && child.id === mutation.nodeId,
      );
      if (index !== -1) {
        parent.children.splice(index, 1);
      }
    }
    this.removeNodeAndDescendants(mutation.nodeId);
  }

  private applySetProp(mutation: Extract<Mutation, { type: "setProp" }>): void {
    const node = this.nodes.get(mutation.nodeId);
    if (node) {
      node.props[mutation.key] = mutation.value;
    }
  }

  private applyRemoveProp(
    mutation: Extract<Mutation, { type: "removeProp" }>,
  ): void {
    const node = this.nodes.get(mutation.nodeId);
    if (node) {
      delete node.props[mutation.key];
    }
  }

  private applySetText(mutation: Extract<Mutation, { type: "setText" }>): void {
    for (const [, node] of this.nodes) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (typeof child !== "string" && child.id === mutation.nodeId) {
          node.children[i] = mutation.text;
          return;
        }
      }
    }
  }

  private applyReorder(mutation: Extract<Mutation, { type: "reorder" }>): void {
    const parent = this.nodes.get(mutation.parentId);
    if (!parent) return;

    const childMap = new Map<string, UINode | string>();
    for (const child of parent.children) {
      if (typeof child === "string") {
        const textId = `text_${Math.random().toString(36).slice(2)}`;
        childMap.set(textId, child);
      } else {
        childMap.set(child.id, child);
      }
    }

    const reorderedChildren: (UINode | string)[] = [];
    const seenIds = new Set<string>();
    for (const id of mutation.childIds) {
      if (childMap.has(id) && !seenIds.has(id)) {
        reorderedChildren.push(childMap.get(id)!);
        seenIds.add(id);
      }
    }

    for (const child of parent.children) {
      const id =
        typeof child === "string"
          ? `text_${Math.random().toString(36).slice(2)}`
          : child.id;
      if (!seenIds.has(id)) {
        reorderedChildren.push(child);
      }
    }

    parent.children = reorderedChildren;
  }

  private removeNodeAndDescendants(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    for (const child of node.children) {
      if (typeof child !== "string") {
        this.removeNodeAndDescendants(child.id);
      }
    }

    this.nodes.delete(nodeId);
  }
}
