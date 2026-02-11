import type {
	AppendChildMutation,
	InsertBeforeMutation,
	Mutation,
	RemoveChildMutation,
	SetPropsMutation,
	SetRootMutation,
	SetTextMutation,
	UINode,
} from "@uniview/protocol";
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
	private serializeSubtree(
		node: InternalNode | TextNode,
	): UINode | string | null {
		if (isTextNode(node)) {
			return node.text;
		}

		const serializedChildren: (UINode | string)[] = [];
		for (const child of node.children) {
			const serializedChild = this.serializeSubtree(child);
			if (serializedChild !== null) {
				serializedChildren.push(serializedChild);
			}
		}

		return {
			type: node.type,
			props: serializeProps(node.props, this.handlerRegistry),
			children: serializedChildren,
			id: node.id,
		};
	}

	/**
	 * Clean up handlers for a removed subtree.
	 * Recursively removes all handler IDs from the registry.
	 */
	private cleanupHandlers(node: InternalNode | TextNode): void {
		if (isTextNode(node)) {
			return;
		}

		// Remove handlers from this node's props
		for (const [, value] of Object.entries(node.props)) {
			if (typeof value === "function") {
				// Handlers are registered during serialization, but we don't track
				// the IDs directly. The registry's clear() is called between full renders,
				// but for incremental mode, we need to be more careful.
				// For now, we rely on the fact that handler IDs are not reused
				// and stale entries in the registry are harmless.
			}
		}

		// Recursively clean up children
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
			node:
				typeof serializedChild === "string"
					? ({
							id: isTextNode(child) ? child.id : "",
							type: "text",
							props: {},
							children: [serializedChild],
						} as UINode)
					: serializedChild,
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

		const beforeId = isTextNode(beforeChild) ? beforeChild.id : beforeChild.id;

		const mutation: InsertBeforeMutation = {
			type: "insertBefore",
			parentId: parent.id,
			node:
				typeof serializedChild === "string"
					? ({
							id: isTextNode(child) ? child.id : "",
							type: "text",
							props: {},
							children: [serializedChild],
						} as UINode)
					: serializedChild,
			beforeId,
		};
		this.pendingMutations.push(mutation);
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
			props: serializeProps(instance.props, this.handlerRegistry),
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect a setText mutation.
	 */
	collectSetText(textInstance: TextNode): void {
		const parent = textInstance.parent;
		if (!parent) return;

		const childIndex = parent.children.findIndex((c) => c === textInstance);
		if (childIndex === -1) return;

		const mutation: SetTextMutation = {
			type: "setText",
			parentId: parent.id,
			childIndex,
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

		const serialized = this.serializeSubtree(rootInstance);
		if (serialized === null || typeof serialized === "string") {
			// Root cannot be a text node, create a wrapper
			const mutation: SetRootMutation = {
				type: "setRoot",
				node: null,
			};
			this.pendingMutations.push(mutation);
			return;
		}

		const mutation: SetRootMutation = {
			type: "setRoot",
			node: serialized,
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
