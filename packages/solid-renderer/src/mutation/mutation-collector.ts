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
	private serializeSubtree(node: AnyNode): UINode | string | null {
		if (isTextNode(node)) {
			return node.value;
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
			props: serializeProps(node.props, this.handlerRegistry),
			children: serializedChildren,
			id: node.id,
		};
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
			node:
				typeof serializedNode === "string"
					? ({
							id: isTextNode(node) ? node.id : "",
							type: "text",
							props: {},
							children: [serializedNode],
						} as UINode)
					: serializedNode,
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

		const beforeId = isTextNode(anchor) ? anchor.id : anchor.id;

		const mutation: InsertBeforeMutation = {
			type: "insertBefore",
			parentId: parent.id,
			node:
				typeof serializedNode === "string"
					? ({
							id: isTextNode(node) ? node.id : "",
							type: "text",
							props: {},
							children: [serializedNode],
						} as UINode)
					: serializedNode,
			beforeId,
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect a removeChild mutation.
	 */
	collectRemoveChild(_parent: SolidNode, node: AnyNode): void {
		const nodeId = isTextNode(node) ? node.id : node.id;

		const mutation: RemoveChildMutation = {
			type: "removeChild",
			parentId: _parent.id,
			nodeId,
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect a setProps mutation.
	 */
	collectSetProps(node: SolidNode): void {
		const mutation: SetPropsMutation = {
			type: "setProps",
			nodeId: node.id,
			props: serializeProps(node.props, this.handlerRegistry),
		};
		this.pendingMutations.push(mutation);
	}

	/**
	 * Collect a setText mutation.
	 */
	collectSetText(textNode: SolidTextNode): void {
		const parent = textNode.parent;
		if (!parent) return;

		const childIndex = parent.children.findIndex((c) => c === textNode);
		if (childIndex === -1) return;

		const mutation: SetTextMutation = {
			type: "setText",
			parentId: parent.id,
			childIndex,
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

		const serialized = this.serializeSubtree(rootNode);
		if (serialized === null || typeof serialized === "string") {
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
