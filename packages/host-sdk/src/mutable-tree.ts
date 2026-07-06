import type { Mutation, UINode, JSONValue } from "@uniview/protocol";

/**
 * MutableTree applies incremental mutations to a UINode tree.
 *
 * It maintains two indexes — id -> node and id -> parentId — so every
 * mutation is O(depth): detaching a moved node and rebuilding the ancestor
 * chain walk UP via the parent index instead of scanning the whole tree
 * (which made an N-row keyed reorder O(N²) per batch). Each mutation
 * produces new object references along the root path to trigger Svelte
 * $state reactivity.
 */
export class MutableTree {
  private tree: UINode | null = null;
  private nodeIndex: Map<string, UINode> = new Map();
  private parentIndex: Map<string, string> = new Map();

  /**
   * Initialize the tree with a full UINode (from setRoot or first updateTree).
   */
  init(tree: UINode | null): void {
    this.tree = tree;
    this.rebuildIndex();
  }

  /**
   * Get the current tree.
   */
  getTree(): UINode | null {
    return this.tree;
  }

  /**
   * Apply a list of mutations and return the new root.
   * Returns a shallow clone of the root to trigger reactivity.
   */
  applyMutations(mutations: Mutation[]): UINode | null {
    for (const mutation of mutations) {
      this.applyMutation(mutation);
    }
    // Return shallow clone to trigger Svelte $state updates
    return this.tree ? { ...this.tree } : null;
  }

  /**
   * Apply a single mutation.
   */
  private applyMutation(mutation: Mutation): void {
    switch (mutation.type) {
      case "setRoot":
        this.tree = mutation.node;
        this.rebuildIndex();
        break;
      case "appendChild":
        this.applyAppendChild(mutation);
        break;
      case "insertBefore":
        this.applyInsertBefore(mutation);
        break;
      case "removeChild":
        this.applyRemoveChild(mutation);
        break;
      case "setText":
        this.applySetText(mutation);
        break;
      case "setProps":
        this.applySetProps(mutation);
        break;
    }
  }

  /**
   * Rebuild both indexes from the current tree.
   */
  private rebuildIndex(): void {
    this.nodeIndex.clear();
    this.parentIndex.clear();
    if (this.tree) {
      this.indexNode(this.tree, null);
    }
  }

  /**
   * Recursively index a node (and its subtree) under the given parent.
   */
  private indexNode(node: UINode, parentId: string | null): void {
    this.nodeIndex.set(node.id, node);
    if (parentId !== null) {
      this.parentIndex.set(node.id, parentId);
    } else {
      this.parentIndex.delete(node.id);
    }
    for (const child of node.children) {
      if (typeof child !== "string") {
        this.indexNode(child, node.id);
      }
    }
  }

  /**
   * Remove a node and its children from both indexes.
   */
  private unindexNode(node: UINode): void {
    this.nodeIndex.delete(node.id);
    this.parentIndex.delete(node.id);
    for (const child of node.children) {
      if (typeof child !== "string") {
        this.unindexNode(child);
      }
    }
  }

  /**
   * Replace the node with the given id by a new object and rebuild the
   * ancestor chain (new references) up to the root via the parent index.
   */
  private replaceNode(targetId: string, newNode: UINode): void {
    this.nodeIndex.set(targetId, newNode);

    let childId = targetId;
    let childNode = newNode;
    while (this.tree && this.tree.id !== childId) {
      const parentId = this.parentIndex.get(childId);
      if (parentId === undefined) return; // not attached to the root
      const parent = this.nodeIndex.get(parentId);
      if (!parent) return;

      const currentChildId = childId;
      const newParent: UINode = {
        ...parent,
        children: parent.children.map((child) =>
          typeof child !== "string" && child.id === currentChildId
            ? childNode
            : child,
        ),
      };
      this.nodeIndex.set(parentId, newParent);
      childId = parentId;
      childNode = newParent;
    }

    if (this.tree && this.tree.id === childId) {
      this.tree = childNode;
    }
  }

  /**
   * Detach a node from wherever it currently sits in the tree, if present.
   * appendChild/insertBefore mutations are also used to MOVE existing nodes
   * (keyed list reorders); without detaching first the node would appear
   * twice. The subtree is intentionally NOT unindexed — it is about to be
   * re-inserted.
   */
  private detachExistingNode(nodeId: string): void {
    const parentId = this.parentIndex.get(nodeId);
    if (parentId === undefined) return;
    const parent = this.nodeIndex.get(parentId);
    if (!parent) return;

    const newParent: UINode = {
      ...parent,
      children: parent.children.filter(
        (child) => typeof child === "string" || child.id !== nodeId,
      ),
    };
    this.parentIndex.delete(nodeId);
    this.replaceNode(parentId, newParent);
  }

  /**
   * Apply appendChild mutation.
   */
  private applyAppendChild(mutation: { parentId: string; node: UINode }): void {
    // Detach first: this mutation may be moving an existing node.
    this.detachExistingNode(mutation.node.id);
    const parent = this.nodeIndex.get(mutation.parentId);
    if (!parent) return;

    const newParent: UINode = {
      ...parent,
      children: [...parent.children, mutation.node],
    };

    this.indexNode(mutation.node, mutation.parentId);
    this.replaceNode(mutation.parentId, newParent);
  }

  /**
   * Apply insertBefore mutation.
   */
  private applyInsertBefore(mutation: {
    parentId: string;
    node: UINode;
    beforeId: string;
  }): void {
    // Detach first (may be a move), and only then resolve the parent — a
    // same-parent detach replaces the parent's index entry.
    this.detachExistingNode(mutation.node.id);
    const parent = this.nodeIndex.get(mutation.parentId);
    if (!parent) return;

    // Find insertion index based on beforeId
    let insertIndex = -1;
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (typeof child !== "string" && child.id === mutation.beforeId) {
        insertIndex = i;
        break;
      }
    }
    if (insertIndex === -1) {
      // The anchor should always be present; a miss means the host tree
      // diverged from the plugin tree. Append as recovery so the node
      // isn't lost, but order is no longer trustworthy.
      console.error(
        `[uniview] insertBefore anchor ${mutation.beforeId} not found under ${mutation.parentId}; appending instead (tree state diverged)`,
      );
      insertIndex = parent.children.length;
    }

    const newChildren = [...parent.children];
    newChildren.splice(insertIndex, 0, mutation.node);

    const newParent: UINode = {
      ...parent,
      children: newChildren,
    };

    this.indexNode(mutation.node, mutation.parentId);
    this.replaceNode(mutation.parentId, newParent);
  }

  /**
   * Apply removeChild mutation.
   */
  private applyRemoveChild(mutation: {
    parentId: string;
    nodeId: string;
  }): void {
    const parent = this.nodeIndex.get(mutation.parentId);
    if (!parent) return;

    const newChildren = parent.children.filter((child) => {
      if (typeof child === "string") return true;
      if (child.id === mutation.nodeId) {
        this.unindexNode(child);
        return false;
      }
      return true;
    });

    const newParent: UINode = {
      ...parent,
      children: newChildren,
    };

    this.replaceNode(mutation.parentId, newParent);
  }

  /**
   * Apply setText mutation (protocol v3: addressed by the text node's
   * stable id, not parentId + childIndex which corrupted the wrong child
   * whenever host and plugin trees diverged).
   */
  private applySetText(mutation: { nodeId: string; text: string }): void {
    const node = this.nodeIndex.get(mutation.nodeId);
    if (!node) {
      console.error(
        `[uniview] setText target ${mutation.nodeId} not found (tree state diverged)`,
      );
      return;
    }

    this.replaceNode(mutation.nodeId, {
      ...node,
      text: mutation.text,
    });
  }

  /**
   * Apply setProps mutation.
   */
  private applySetProps(mutation: {
    nodeId: string;
    props: Record<string, JSONValue>;
  }): void {
    const node = this.nodeIndex.get(mutation.nodeId);
    if (!node) return;

    this.replaceNode(mutation.nodeId, {
      ...node,
      props: mutation.props,
    });
  }
}
