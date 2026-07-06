import { TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import type { AnyNode, SolidNode, SolidTextNode, SolidSlotNode } from "../renderer/types";
import type { HandlerRegistry } from "./handler-registry";
import { serializeProps } from "./serialize-props";

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
 * Serialize a full tree from the root. Brackets the walk with a registry
 * sweep so handlers owned by nodes that left the tree are released —
 * without this, full update mode leaks handlers for every removed node.
 */
export function serializeTree(
	node: AnyNode | null,
	registry: HandlerRegistry,
): UINode | string | null {
	registry.beginSweep();
	try {
		return serializeNode(node, registry);
	} finally {
		registry.endSweep();
	}
}

function serializeNode(
	node: AnyNode | null,
	registry: HandlerRegistry,
): UINode | string | null {
	if (node == null) {
		return null;
	}

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
		const serializedChild = serializeNode(child, registry);
		if (serializedChild !== null) {
			serializedChildren.push(serializedChild);
		}
	}

	return {
		type: node.type,
		props: serializeProps(node.props, registry, node.id),
		children: serializedChildren,
		id: node.id,
	};
}
