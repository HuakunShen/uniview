import type { Mutation } from "@uniview/protocol";
import type { AnyNode, SolidNode, SolidTextNode, SolidSlotNode } from "./types";
import { generateId } from "./types";
import { createRenderer } from "./universal";
import type { SolidMutationCollector } from "../mutation/mutation-collector";

// Module-level state
let updateCallback: ((root: SolidNode | null) => void) | null = null;
let mutationUpdateCallback: ((mutations: Mutation[]) => void) | null = null;
let mutationCollector: SolidMutationCollector | null = null;
let rootNode: SolidNode | null = null;
let scheduled = false;

function scheduleUpdate() {
	if (scheduled) return;
	scheduled = true;
	queueMicrotask(() => {
		scheduled = false;

		// Flush mutations if collector is active
		if (mutationCollector && mutationUpdateCallback) {
			const mutations = mutationCollector.flushCommit();
			if (mutations.length > 0) {
				mutationUpdateCallback(mutations);
			}
		}

		// Always notify full-mode subscribers
		if (updateCallback && rootNode) {
			updateCallback(rootNode);
		}
	});
}

export function setUpdateCallback(cb: (root: SolidNode | null) => void): void {
	updateCallback = cb;
}

export function setMutationUpdateCallback(cb: (mutations: Mutation[]) => void): void {
	mutationUpdateCallback = cb;
}

export function setMutationCollector(collector: SolidMutationCollector | null): void {
	mutationCollector = collector;
}

export function getRootNode(): SolidNode | null {
	return rootNode;
}

export function setRootNode(node: SolidNode | null): void {
	rootNode = node;
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
	mutationCollector?.collectSetText(textNode);
	scheduleUpdate();
}

function _insertNode(parent: SolidNode, node: AnyNode, anchor?: AnyNode): void {
	node.parent = parent;

	if (anchor) {
		const anchorIndex = parent.children.indexOf(anchor as SolidNode | SolidTextNode | SolidSlotNode);
		if (anchorIndex !== -1) {
			parent.children.splice(anchorIndex, 0, node as SolidNode | SolidTextNode | SolidSlotNode);
			mutationCollector?.collectInsertBefore(parent, node, anchor);
		} else {
			parent.children.push(node as SolidNode | SolidTextNode | SolidSlotNode);
			mutationCollector?.collectAppendChild(parent, node);
		}
	} else {
		parent.children.push(node as SolidNode | SolidTextNode | SolidSlotNode);
		mutationCollector?.collectAppendChild(parent, node);
	}

	scheduleUpdate();
}

function _removeNode(parent: SolidNode, node: AnyNode): void {
	const index = parent.children.indexOf(node as SolidNode | SolidTextNode | SolidSlotNode);
	if (index !== -1) {
		parent.children.splice(index, 1);
		mutationCollector?.collectRemoveChild(parent, node);
	}
	node.parent = null;
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
	} else {
		node.props[name] = value;
	}
	mutationCollector?.collectSetProps(node);
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
