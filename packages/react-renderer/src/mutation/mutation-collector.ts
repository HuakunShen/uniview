import { TEXT_NODE_TYPE } from "@uniview/protocol/core";
import type {
	AppendChildMutation,
	InsertBeforeMutation,
	Mutation,
	RemoveChildMutation,
	SetPropsMutation,
	SetRootMutation,
	SetTextMutation,
	UINode,
} from "@uniview/protocol/core";
import type { HandlerRegistry } from "../serialization/handler-registry";
import { serializeProps } from "../serialization/serialize-props";
import type { InternalNode, TextNode } from "../reconciler/types";

function isTextNode(node: unknown): node is TextNode {
	return (
		typeof node === "object" &&
		node !== null &&
		"_isTextNode" in node &&
		(node as TextNode)._isTextNode === true
	);
}

/**
 * Collects mutations during a React commit phase.
 *
 * This class is instantiated per plugin instance (not a singleton).
 * It tracks all tree changes during a commit and produces a list
 * of mutations that can be sent to the host for incremental updates.
 */
export class MutationCollector {
	private pendingMutations: Mutation[] = [];
	private handlerRegistry: HandlerRegistry;

	constructor(handlerRegistry: HandlerRegistry) {
		this.handlerRegistry = handlerRegistry;
	}

	/**
	 * Start a new commit batch.
	 * Called at the beginning of the React commit phase.
	 */
	beginCommit(): void {
		this.pendingMutations = [];
	}

	/**
	 * Serialize a node and its entire subtree for mutations.
	 * This recursively processes all children and registers handlers.
	 */
	private serializeSubtree(node: InternalNode | TextNode): UINode | null {
		// Suspense-hidden nodes stay mounted but are not part of the visible tree
		if (node.hidden) {
			return null;
		}

		if (isTextNode(node)) {
			// Protocol v3: text children are explicit nodes with stable ids.
			return {
				id: node.id,
				type: TEXT_NODE_TYPE,
				props: {},
				children: [],
				text: node.text,
			};
		}

		const serializedChildren: UINode[] = [];
		for (const child of node.children) {
			const serializedChild = this.serializeSubtree(child);
			if (serializedChild !== null) {
				serializedChildren.push(serializedChild);
			}
		}

		return {
			type: node.type,
			props: serializeProps(node.props, this.handlerRegistry, node.id),
			children: serializedChildren,
			id: node.id,
		};
	}

	/**
	 * Clean up handlers for a removed subtree.
	 * Recursively releases every handler id owned by the removed nodes.
	 */
	private cleanupHandlers(node: InternalNode | TextNode): void {
		if (isTextNode(node)) {
			return;
		}

		this.handlerRegistry.releaseNode(node.id);

		for (const child of node.children) {
			this.cleanupHandlers(child);
		}
	}

	/**
	 * Collect an appendChild mutation.
	 */
	collectAppendChild(parent: InternalNode, child: InternalNode | TextNode): void {
		const serializedChild = this.serializeSubtree(child);
		if (serializedChild === null) return;

		const mutation: AppendChildMutation = {
			type: "appendChild",
			parentId: parent.id,
			node: serializedChild,
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect an insertBefore mutation.
	 */
	collectInsertBefore(
		parent: InternalNode,
		child: InternalNode | TextNode,
		beforeChild: InternalNode | TextNode,
	): void {
		const serializedChild = this.serializeSubtree(child);
		if (serializedChild === null) return;

		// The anchor may be Suspense-hidden (absent on the host) — resolve to
		// the next visible sibling, or fall back to an append.
		const anchor = beforeChild.hidden
			? this.nextVisibleSibling(parent, beforeChild)
			: beforeChild;
		if (!anchor) {
			const mutation: AppendChildMutation = {
				type: "appendChild",
				parentId: parent.id,
				node: serializedChild,
			};
			this.pendingMutations.push(mutation);
			return;
		}

		const mutation: InsertBeforeMutation = {
			type: "insertBefore",
			parentId: parent.id,
			node: serializedChild,
			beforeId: anchor.id,
		};
		this.pendingMutations.push(mutation);
	}

	/** Find the next non-hidden sibling after `node` in `parent`. */
	private nextVisibleSibling(
		parent: InternalNode,
		node: InternalNode | TextNode,
	): InternalNode | TextNode | null {
		const index = parent.children.indexOf(node);
		if (index === -1) return null;
		for (let i = index + 1; i < parent.children.length; i++) {
			const sibling = parent.children[i];
			if (sibling && !sibling.hidden) return sibling;
		}
		return null;
	}

	/**
	 * Collect mutations for a Suspense hide: the node leaves the host tree
	 * but stays mounted, so its handlers are NOT released.
	 */
	collectHide(node: InternalNode | TextNode): void {
		const parent = node.parent;
		if (!parent) return;

		const mutation: RemoveChildMutation = {
			type: "removeChild",
			parentId: parent.id,
			nodeId: node.id,
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect mutations for a Suspense unhide: re-insert the subtree at its
	 * position among currently visible siblings.
	 */
	collectUnhide(node: InternalNode | TextNode): void {
		const parent = node.parent;
		if (!parent) return;

		const serialized = this.serializeSubtree(node);
		if (serialized === null) return;

		const anchor = this.nextVisibleSibling(parent, node);
		if (anchor) {
			this.pendingMutations.push({
				type: "insertBefore",
				parentId: parent.id,
				node: serialized,
				beforeId: anchor.id,
			});
		} else {
			this.pendingMutations.push({
				type: "appendChild",
				parentId: parent.id,
				node: serialized,
			});
		}
	}

	/**
	 * Collect a removeChild mutation.
	 */
	collectRemoveChild(_parent: InternalNode, child: InternalNode | TextNode): void {
		const nodeId = isTextNode(child) ? child.id : child.id;

		const mutation: RemoveChildMutation = {
			type: "removeChild",
			parentId: _parent.id,
			nodeId,
		};
		this.pendingMutations.push(mutation);

		// Clean up handlers for the removed subtree
		this.cleanupHandlers(child);
	}

	/**
	 * Collect a setProps mutation.
	 */
	collectSetProps(instance: InternalNode): void {
		const mutation: SetPropsMutation = {
			type: "setProps",
			nodeId: instance.id,
			props: serializeProps(instance.props, this.handlerRegistry, instance.id),
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect a setText mutation.
	 */
	collectSetText(textInstance: TextNode): void {
		const mutation: SetTextMutation = {
			type: "setText",
			nodeId: textInstance.id,
			text: textInstance.text,
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect a setRoot mutation.
	 */
	collectSetRoot(rootInstance: InternalNode | null): void {
		if (rootInstance === null) {
			const mutation: SetRootMutation = {
				type: "setRoot",
				node: null,
			};
			this.pendingMutations.push(mutation);
			return;
		}

		const mutation: SetRootMutation = {
			type: "setRoot",
			node: this.serializeSubtree(rootInstance),
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Flush all collected mutations and return them.
	 * Clears the pending mutations list.
	 */
	flushCommit(): Mutation[] {
		const mutations = this.pendingMutations;
		this.pendingMutations = [];
		return mutations;
	}
}
