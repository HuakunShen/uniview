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
	 * Apply appendChild mutation.
	 */
	private applyAppendChild(mutation: {
		parentId: string;
		node: UINode;
	}): void {
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
		const parent = this.nodeIndex.get(mutation.parentId);
		if (!parent) return;

		// Find insertion index based on beforeId
		let insertIndex = parent.children.length;
		for (let i = 0; i < parent.children.length; i++) {
			const child = parent.children[i];
			if (typeof child !== "string" && child.id === mutation.beforeId) {
				insertIndex = i;
				break;
			}
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
	): boolean {
		if (!node) return false;

		let replaced = false;
		const newChildren = node.children.map((child) => {
			if (typeof child === "string") return child;
			if (child.id === targetId) {
				replaced = true;
				return newNode;
			}
			// Recursively check children
			if (this.replaceNodeInTree(child, targetId, newNode)) {
				replaced = true;
			}
			return child;
		});

		if (replaced) {
			// Create new node with updated children
			const updatedNode: UINode = {
				...node,
				children: newChildren as (UINode | string)[],
			};
			this.nodeIndex.set(node.id, updatedNode);
			if (this.tree?.id === node.id) {
				this.tree = updatedNode;
			}
		}

		return replaced;
	}
}
