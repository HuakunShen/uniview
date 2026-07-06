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
let warnedMultipleRoots = false;

function scheduleUpdate() {
	if (scheduled) return;
	scheduled = true;
	queueMicrotask(() => {
		scheduled = false;

		// The protocol tree has a single root; runtimes serialize
		// rootNode.children[0] and silently dropped any siblings.
		if (!warnedMultipleRoots && rootNode) {
			const roots = rootNode.children.filter((c) => c._type !== "slot");
			if (roots.length > 1) {
				warnedMultipleRoots = true;
				console.error(
					"[uniview] plugin root must be a single element — wrap top-level siblings in one parent element (only the first is rendered)",
				);
			}
		}

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
	warnedMultipleRoots = false;
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

/**
 * Remove a node from its current parent's children array (if attached).
 * Solid's universal renderer reuses insertNode to MOVE existing nodes
 * (keyed list reorders); DOM insertBefore auto-detaches, an array-based
 * children model must do it explicitly or reorders duplicate the node.
 */
function _detachFromParent(node: AnyNode): void {
	const prevParent = node.parent;
	if (!prevParent) return;
	const index = prevParent.children.indexOf(
		node as SolidNode | SolidTextNode | SolidSlotNode,
	);
	if (index !== -1) {
		prevParent.children.splice(index, 1);
	}
}

/**
 * Emit a setRoot mutation seeding the host from the container's real root
 * element. Solid mounts the plugin into a synthetic container (`rootNode`,
 * id "root") the host never sees; appendChild/removeChild against that
 * container referenced the internal "root" id, so incremental hosts could
 * never seed their tree and the runtime had to resend the whole tree every
 * flush. Addressing container-level changes as setRoot fixes that — every
 * later mutation then references real node ids.
 */
function _syncContainerRoot(): void {
	if (!mutationCollector || !rootNode) return;
	const root = rootNode.children.find((c) => c._type !== "slot") ?? null;
	mutationCollector.collectSetRoot(root ?? null);
}

function _insertNode(parent: SolidNode, node: AnyNode, anchor?: AnyNode): void {
	// Detach first (may be a move) — and only then resolve the anchor index,
	// since detaching from the same parent shifts sibling positions.
	_detachFromParent(node);
	node.parent = parent;

	const isContainerInsert = parent === rootNode;

	if (anchor) {
		const anchorIndex = parent.children.indexOf(anchor as SolidNode | SolidTextNode | SolidSlotNode);
		if (anchorIndex !== -1) {
			parent.children.splice(anchorIndex, 0, node as SolidNode | SolidTextNode | SolidSlotNode);
			if (!isContainerInsert) mutationCollector?.collectInsertBefore(parent, node, anchor);
		} else {
			parent.children.push(node as SolidNode | SolidTextNode | SolidSlotNode);
			if (!isContainerInsert) mutationCollector?.collectAppendChild(parent, node);
		}
	} else {
		parent.children.push(node as SolidNode | SolidTextNode | SolidSlotNode);
		if (!isContainerInsert) mutationCollector?.collectAppendChild(parent, node);
	}

	// Attaching the plugin's top-level element to the container = (re)seed root.
	if (isContainerInsert) _syncContainerRoot();

	scheduleUpdate();
}

function _removeNode(parent: SolidNode, node: AnyNode): void {
	const index = parent.children.indexOf(node as SolidNode | SolidTextNode | SolidSlotNode);
	const wasContainerChild = parent === rootNode;
	if (index !== -1) {
		parent.children.splice(index, 1);
		// Removing from the container replaces/clears the root; represent it as
		// setRoot rather than removeChild(parentId:"root").
		if (wasContainerChild) {
			mutationCollector?.cleanupHandlers(node);
			_syncContainerRoot();
		} else {
			mutationCollector?.collectRemoveChild(parent, node);
		}
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
