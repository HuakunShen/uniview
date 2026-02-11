import type { UINode } from "@uniview/protocol";
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

export function serializeTree(
	node: AnyNode | null,
	registry: HandlerRegistry,
): UINode | string | null {
	if (node == null) {
		return null;
	}

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
		const serializedChild = serializeTree(child, registry);
		if (serializedChild !== null) {
			serializedChildren.push(serializedChild);
		}
	}

	return {
		type: node.type,
		props: serializeProps(node.props, registry),
		children: serializedChildren,
		id: node.id,
	};
}
