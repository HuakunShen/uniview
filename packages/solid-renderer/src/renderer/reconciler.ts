import type { AnyNode, SolidNode, SolidTextNode, SolidSlotNode } from "./types";
import { generateId } from "./types";
import { createRenderer } from "./universal";
import type { Mutation } from "@uniview/protocol";

let updateCallback: ((mutations: Mutation[]) => void) | null = null;
let rootNode: SolidNode | null = null;
let scheduled = false;
const pendingMutations: Mutation[] = [];

function scheduleUpdate() {
	if (scheduled) return;
	scheduled = true;
	queueMicrotask(() => {
		scheduled = false;
		if (updateCallback && pendingMutations.length > 0) {
			const mutations = pendingMutations.splice(0);
			updateCallback(mutations);
		}
	});
}

export function setUpdateCallback(cb: (mutations: Mutation[]) => void): void {
	updateCallback = cb;
}

export function getRootNode(): SolidNode | null {
	return rootNode;
}

export function setRootNode(node: SolidNode | null): void {
	rootNode = node;
}

function getIndexInParent(parent: SolidNode, node: AnyNode): number {
	return parent.children.indexOf(node as SolidNode | SolidTextNode | SolidSlotNode);
}

function _createElement(tagName: string): SolidNode {
	return {
		_type: "element",
		id: generateId(tagName),
		type: tagName,
		props: {},
		children: [],
		parent: null,
	};
}

function _createTextNode(value: string | number): SolidTextNode {
	return {
		_type: "text",
		id: generateId("text"),
		value: String(value),
		parent: null,
	};
}

function _createSlotNode(): SolidSlotNode {
	return {
		_type: "slot",
		id: generateId("slot"),
		parent: null,
	};
}

function _isTextNode(node: AnyNode): boolean {
	return node._type === "text";
}

function _replaceText(textNode: SolidTextNode, value: string): void {
	textNode.value = value;
	pendingMutations.push({
		type: "setText",
		nodeId: textNode.id,
		text: value,
	});
	scheduleUpdate();
}

function _insertNode(parent: SolidNode, node: AnyNode, anchor?: AnyNode): void {
	node.parent = parent;

	let index: number;
	if (anchor) {
		const anchorIndex = parent.children.indexOf(anchor as SolidNode | SolidTextNode | SolidSlotNode);
		if (anchorIndex !== -1) {
			parent.children.splice(anchorIndex, 0, node as SolidNode | SolidTextNode | SolidSlotNode);
			index = anchorIndex;
		} else {
			parent.children.push(node as SolidNode | SolidTextNode | SolidSlotNode);
			index = parent.children.length - 1;
		}
	} else {
		parent.children.push(node as SolidNode | SolidTextNode | SolidSlotNode);
		index = parent.children.length - 1;
	}

	if (node._type === "element") {
		pendingMutations.push({
			type: "create",
			nodeId: node.id,
			nodeType: node.type,
			parentId: parent.id,
			index,
			props: {},
		});
	} else if (node._type === "text") {
		pendingMutations.push({
			type: "create",
			nodeId: node.id,
			nodeType: "text",
			parentId: parent.id,
			index,
			props: { text: node.value },
		});
	}

	scheduleUpdate();
}

function _removeNode(parent: SolidNode, node: AnyNode): void {
	const index = parent.children.indexOf(node as SolidNode | SolidTextNode | SolidSlotNode);
	if (index !== -1) {
		parent.children.splice(index, 1);
	}
	node.parent = null;

	if (node._type === "element" || node._type === "text") {
		pendingMutations.push({
			type: "remove",
			nodeId: node.id,
			parentId: parent.id,
		});
	}

	scheduleUpdate();
}

function _setProperty(
	node: SolidNode,
	name: string,
	value: unknown,
	_prev: unknown,
): void {
	if (value === undefined) {
		delete node.props[name];
		pendingMutations.push({
			type: "removeProp",
			nodeId: node.id,
			key: name,
		});
	} else {
		node.props[name] = value;
		pendingMutations.push({
			type: "setProp",
			nodeId: node.id,
			key: name,
			value: value as string | number | boolean | null | object,
		});
	}
	scheduleUpdate();
}

function _getParentNode(childNode: AnyNode): SolidNode | undefined {
	return childNode.parent ?? undefined;
}

function _getFirstChild(node: SolidNode): AnyNode | undefined {
	return node.children[0];
}

function _getNextSibling(node: AnyNode): AnyNode | undefined {
	const parent = node.parent;
	if (!parent) return undefined;
	const index = parent.children.indexOf(node as SolidNode | SolidTextNode | SolidSlotNode);
	if (index === -1 || index >= parent.children.length - 1) return undefined;
	return parent.children[index + 1];
}

const renderer = createRenderer<AnyNode>({
	createElement: _createElement,
	createTextNode: _createTextNode,
	createSlotNode: _createSlotNode,
	isTextNode: _isTextNode,
	replaceText: _replaceText,
	insertNode: _insertNode,
	removeNode: _removeNode,
	setProperty: _setProperty,
	getParentNode: _getParentNode,
	getFirstChild: _getFirstChild,
	getNextSibling: _getNextSibling,
});

export const {
	render,
	effect,
	memo,
	createComponent,
	createElement,
	createTextNode,
	insertNode,
	insert,
	spread,
	setProp,
	mergeProps,
	use,
} = renderer;
