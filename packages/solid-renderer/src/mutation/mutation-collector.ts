import { TEXT_NODE_TYPE } from "@uniview/protocol";
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
import type { AnyNode, SolidNode, SolidSlotNode, SolidTextNode } from "../renderer/types";

function isTextNode(node: AnyNode): node is SolidTextNode {
	return node._type === "text";
}

function isSlotNode(node: AnyNode): node is SolidSlotNode {
	return node._type === "slot";
}

function isElementNode(node: AnyNode): node is SolidNode {
	return node._type === "element";
}

/**
 * Collects mutations during Solid's reactive updates.
 *
 * This class is instantiated per plugin instance (not a singleton).
 * It tracks all tree changes and produces a list of mutations
 * that can be sent to the host for incremental updates.
 */
export class SolidMutationCollector {
	private pendingMutations: Mutation[] = [];
	private handlerRegistry: HandlerRegistry;

	constructor(handlerRegistry: HandlerRegistry) {
		this.handlerRegistry = handlerRegistry;
	}

	/**
	 * Start a new commit batch.
	 */
	beginCommit(): void {
		this.pendingMutations = [];
	}

	/**
	 * Serialize a node and its entire subtree for mutations.
	 */
	private serializeSubtree(node: AnyNode): UINode | null {
		if (isTextNode(node)) {
			// Protocol v3: text children are explicit nodes with stable ids.
			return {
				id: node.id,
				type: TEXT_NODE_TYPE,
				props: {},
				children: [],
				text: node.value,
			};
		}

		if (isSlotNode(node)) {
			return null;
		}

		if (!isElementNode(node)) {
			return null;
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
			props: serializeProps(node.props, this.handlerRegistry, node.id),
			children: serializedChildren,
			id: node.id,
		};
	}

	/**
	 * Clean up handlers for a removed subtree.
	 * Recursively releases every handler id owned by the removed nodes.
	 */
	private cleanupHandlers(node: AnyNode): void {
		if (!isElementNode(node)) {
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
	collectAppendChild(parent: SolidNode, node: AnyNode): void {
		const serializedNode = this.serializeSubtree(node);
		if (serializedNode === null) return;

		const mutation: AppendChildMutation = {
			type: "appendChild",
			parentId: parent.id,
			node: serializedNode,
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect an insertBefore mutation.
	 */
	collectInsertBefore(
		parent: SolidNode,
		node: AnyNode,
		anchor: AnyNode,
	): void {
		const serializedNode = this.serializeSubtree(node);
		if (serializedNode === null) return;

		const mutation: InsertBeforeMutation = {
			type: "insertBefore",
			parentId: parent.id,
			node: serializedNode,
			beforeId: anchor.id,
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect a removeChild mutation.
	 */
	collectRemoveChild(_parent: SolidNode, node: AnyNode): void {
		const mutation: RemoveChildMutation = {
			type: "removeChild",
			parentId: _parent.id,
			nodeId: node.id,
		};
		this.pendingMutations.push(mutation);

		// Clean up handlers for the removed subtree
		this.cleanupHandlers(node);
	}

	/**
	 * Collect a setProps mutation.
	 */
	collectSetProps(node: SolidNode): void {
		const mutation: SetPropsMutation = {
			type: "setProps",
			nodeId: node.id,
			props: serializeProps(node.props, this.handlerRegistry, node.id),
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect a setText mutation.
	 */
	collectSetText(textNode: SolidTextNode): void {
		const mutation: SetTextMutation = {
			type: "setText",
			nodeId: textNode.id,
			text: textNode.value,
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect a setRoot mutation.
	 */
	collectSetRoot(rootNode: SolidNode | null): void {
		if (rootNode === null) {
			const mutation: SetRootMutation = {
				type: "setRoot",
				node: null,
			};
			this.pendingMutations.push(mutation);
			return;
		}

		const mutation: SetRootMutation = {
			type: "setRoot",
			node: this.serializeSubtree(rootNode),
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
