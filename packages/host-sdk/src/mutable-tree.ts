import type { Mutation, UINode, JSONValue } from "@uniview/protocol";

/**
 * MutableTree applies incremental mutations to a UINode tree.
 *
 * This class maintains indexes for efficient lookups and produces
 * new root references on each mutation to trigger Svelte $state reactivity.
 */
export class MutableTree {
  private tree: UINode | null = null;
  private nodeIndex: Map<string, UINode> = new Map();

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
   * Rebuild the node index from the current tree.
   */
  private rebuildIndex(): void {
    this.nodeIndex.clear();
    if (this.tree) {
      this.indexNode(this.tree);
    }
  }

  /**
   * Recursively index a node and its children.
   */
  private indexNode(node: UINode): void {
    this.nodeIndex.set(node.id, node);
    for (const child of node.children) {
      if (typeof child !== "string") {
        this.indexNode(child);
      }
    }
  }

  /**
   * Remove a node and its children from the index.
   */
  private unindexNode(node: UINode): void {
    this.nodeIndex.delete(node.id);
    for (const child of node.children) {
      if (typeof child !== "string") {
        this.unindexNode(child);
      }
    }
  }

  /**
   * Find the parent node currently containing a child with the given id.
   */
  private findParentOf(node: UINode | null, childId: string): UINode | null {
    if (!node) return null;
    for (const child of node.children) {
      if (typeof child === "string") continue;
      if (child.id === childId) return node;
      const found = this.findParentOf(child, childId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Detach a node from wherever it currently sits in the tree, if present.
   * appendChild/insertBefore mutations are also used to MOVE existing nodes
   * (keyed list reorders); without detaching first the node would appear
   * twice. The subtree is intentionally NOT unindexed — it is about to be
   * re-inserted.
   */
  private detachExistingNode(nodeId: string): void {
    const parent = this.findParentOf(this.tree, nodeId);
    if (!parent) return;

    const newChildren = parent.children.filter(
      (child) => typeof child === "string" || child.id !== nodeId,
    );
    const newParent: UINode = { ...parent, children: newChildren };
    this.nodeIndex.set(parent.id, newParent);
    if (this.tree?.id === parent.id) {
      this.tree = newParent;
    } else {
      this.replaceNodeInTree(this.tree, parent.id, newParent);
    }
  }

  /**
   * Apply appendChild mutation.
   */
  private applyAppendChild(mutation: { parentId: string; node: UINode }): void {
    // Detach first: this mutation may be moving an existing node.
    this.detachExistingNode(mutation.node.id);
    const parent = this.nodeIndex.get(mutation.parentId);
    if (!parent) return;

    // Create new parent reference with updated children
    const newParent: UINode = {
      ...parent,
      children: [...parent.children, mutation.node],
    };

    // Update index
    this.nodeIndex.set(mutation.parentId, newParent);
    this.indexNode(mutation.node);

    // Update tree if root was modified
    if (this.tree?.id === mutation.parentId) {
      this.tree = newParent;
    } else {
      // Update parent reference in tree
      this.replaceNodeInTree(this.tree, mutation.parentId, newParent);
    }
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
      // diverged from the plugin tree (known cause until protocol v3:
      // text-node anchors serialize as bare strings and carry no id).
      // Append as recovery so the node isn't lost, but order is wrong.
      console.error(
        `[uniview] insertBefore anchor ${mutation.beforeId} not found under ${mutation.parentId}; appending instead (tree state diverged)`,
      );
      insertIndex = parent.children.length;
    }

    // Create new parent with inserted child
    const newChildren = [...parent.children];
    newChildren.splice(insertIndex, 0, mutation.node);

    const newParent: UINode = {
      ...parent,
      children: newChildren,
    };

    // Update index
    this.nodeIndex.set(mutation.parentId, newParent);
    this.indexNode(mutation.node);

    // Update tree
    if (this.tree?.id === mutation.parentId) {
      this.tree = newParent;
    } else {
      this.replaceNodeInTree(this.tree, mutation.parentId, newParent);
    }
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

    // Find and remove the child
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

    // Update index
    this.nodeIndex.set(mutation.parentId, newParent);

    // Update tree
    if (this.tree?.id === mutation.parentId) {
      this.tree = newParent;
    } else {
      this.replaceNodeInTree(this.tree, mutation.parentId, newParent);
    }
  }

  /**
   * Apply setText mutation.
   */
  private applySetText(mutation: {
    parentId: string;
    childIndex: number;
    text: string;
  }): void {
    const parent = this.nodeIndex.get(mutation.parentId);
    if (!parent) return;

    // Validate child index
    if (
      mutation.childIndex < 0 ||
      mutation.childIndex >= parent.children.length
    ) {
      return;
    }

    // Create new children array with updated text
    const newChildren = [...parent.children];
    newChildren[mutation.childIndex] = mutation.text;

    const newParent: UINode = {
      ...parent,
      children: newChildren,
    };

    // Update index
    this.nodeIndex.set(mutation.parentId, newParent);

    // Update tree
    if (this.tree?.id === mutation.parentId) {
      this.tree = newParent;
    } else {
      this.replaceNodeInTree(this.tree, mutation.parentId, newParent);
    }
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

    const newNode: UINode = {
      ...node,
      props: mutation.props,
    };

    // Update index
    this.nodeIndex.set(mutation.nodeId, newNode);

    // Update tree
    if (this.tree?.id === mutation.nodeId) {
      this.tree = newNode;
    } else {
      this.replaceNodeInTree(this.tree, mutation.nodeId, newNode);
    }
  }

  /**
   * Recursively replace a node in the tree.
   */
  private replaceNodeInTree(
    node: UINode | null,
    targetId: string,
    newNode: UINode,
  ): UINode | null {
    if (!node) return null;

    if (node.id === targetId) {
      this.nodeIndex.set(targetId, newNode);
      if (this.tree?.id === targetId) {
        this.tree = newNode;
      }
      return newNode;
    }

    let replaced = false;
    const newChildren = node.children.map((child) => {
      if (typeof child === "string") return child;

      const updatedChild = this.replaceNodeInTree(child, targetId, newNode);
      if (updatedChild) {
        replaced = true;
        return updatedChild;
      }

      return child;
    });

    if (!replaced) {
      return null;
    }

    const updatedNode: UINode = {
      ...node,
      children: newChildren,
    };
    this.nodeIndex.set(node.id, updatedNode);
    if (this.tree?.id === node.id) {
      this.tree = updatedNode;
    }

    return updatedNode;
  }
}
