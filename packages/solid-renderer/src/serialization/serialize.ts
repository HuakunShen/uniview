import type { UINode, JSONValue } from "@uniview/protocol";
import { EVENT_PROPS, handlerIdProp } from "@uniview/protocol";
import type { AnyNode, SolidNode, SolidTextNode, SolidSlotNode } from "../renderer/types";
import type { HandlerRegistry } from "./handler-registry";

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

	const serializedProps: Record<string, JSONValue> = {};

	for (const [key, value] of Object.entries(node.props)) {
		if (key === "children" || key === "key" || key === "ref") {
			continue;
		}

		if (
			EVENT_PROPS.includes(key as (typeof EVENT_PROPS)[number]) &&
			typeof value === "function"
		) {
			const handlerId = registry.register(
				value as (...args: unknown[]) => unknown,
			);
			serializedProps[handlerIdProp(key as (typeof EVENT_PROPS)[number])] =
				handlerId;
		} else if (typeof value === "function") {
			continue;
		} else if (value !== undefined && value !== null) {
			try {
				JSON.stringify(value);
				serializedProps[key] = value as JSONValue;
			} catch {
				continue;
			}
		}
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
		props: serializedProps,
		children: serializedChildren,
		id: node.id,
	};
}
