import type { Mutation, UINode } from "@uniview/protocol";

function isElement(child: UINode | string): child is UINode {
  return typeof child !== "string";
}

/**
 * Applies protocol {@link Mutation}s to a UINode tree, maintaining an id index
 * and parent map so mutations address nodes in O(1). Moves (append/insert of an
 * already-present node) detach the node from its old parent first, per the
 * protocol contract.
 */
export class MutableTree {
  private root: UINode | null = null;
  private readonly nodes = new Map<string, UINode>();
  private readonly parentOf = new Map<string, string>();

  getRoot(): UINode | null {
    return this.root;
  }

  getNode(id: string): UINode | undefined {
    return this.nodes.get(id);
  }

  /** The id of a node's parent, or undefined for the root/unknown nodes. */
  parentId(id: string): string | undefined {
    return this.parentOf.get(id);
  }

  applyBatch(mutations: readonly Mutation[]): void {
    for (const mutation of mutations) this.apply(mutation);
  }

  apply(mutation: Mutation): void {
    switch (mutation.type) {
      case "setRoot":
        if (this.root) this.unindex(this.root);
        this.root = mutation.node;
        if (mutation.node) this.index(mutation.node, null);
        return;

      case "appendChild": {
        const parent = this.nodes.get(mutation.parentId);
        if (!parent) return;
        this.ensureDetached(mutation.node.id);
        parent.children.push(mutation.node);
        this.index(mutation.node, parent.id);
        return;
      }

      case "insertBefore": {
        const parent = this.nodes.get(mutation.parentId);
        if (!parent) return;
        this.ensureDetached(mutation.node.id);
        const at = parent.children.findIndex(
          (c) => isElement(c) && c.id === mutation.beforeId,
        );
        parent.children.splice(at < 0 ? parent.children.length : at, 0, mutation.node);
        this.index(mutation.node, parent.id);
        return;
      }

      case "removeChild": {
        const parent = this.nodes.get(mutation.parentId);
        if (!parent) return;
        const at = parent.children.findIndex(
          (c) => isElement(c) && c.id === mutation.nodeId,
        );
        if (at < 0) return;
        const [removed] = parent.children.splice(at, 1);
        if (removed && isElement(removed)) this.unindex(removed);
        return;
      }

      case "setText": {
        const node = this.nodes.get(mutation.nodeId);
        if (node) node.text = mutation.text;
        return;
      }

      case "setProps": {
        const node = this.nodes.get(mutation.nodeId);
        if (node) node.props = mutation.props;
        return;
      }
    }
  }

  private index(node: UINode, parentId: string | null): void {
    this.nodes.set(node.id, node);
    if (parentId !== null) this.parentOf.set(node.id, parentId);
    else this.parentOf.delete(node.id);
    for (const child of node.children) {
      if (isElement(child)) this.index(child, node.id);
    }
  }

  private unindex(node: UINode): void {
    this.nodes.delete(node.id);
    this.parentOf.delete(node.id);
    for (const child of node.children) {
      if (isElement(child)) this.unindex(child);
    }
  }

  /** Detach an existing node from its parent and drop its old index entries. */
  private ensureDetached(id: string): void {
    const existing = this.nodes.get(id);
    if (!existing) return;
    const parentId = this.parentOf.get(id);
    const parent = parentId !== undefined ? this.nodes.get(parentId) : undefined;
    if (parent) {
      const at = parent.children.findIndex((c) => isElement(c) && c.id === id);
      if (at >= 0) parent.children.splice(at, 1);
    }
    this.unindex(existing);
  }
}
