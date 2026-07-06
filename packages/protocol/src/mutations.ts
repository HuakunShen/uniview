import type { JSONValue, UINode } from "./tree";

/**
 * Update mode for plugin rendering
 * - "full": Send entire tree on every update (default, backward compatible)
 * - "incremental": Send only mutations (more efficient for large trees)
 */
export type UpdateMode = "full" | "incremental";

/**
 * Append a child node to a parent.
 * The full serialized subtree is provided in `node`; text children are
 * explicit `{type: TEXT_NODE_TYPE, text}` nodes since protocol v3.
 * Hosts must treat this as a MOVE when the node already exists in the
 * tree (detach from its current position first).
 */
export interface AppendChildMutation {
	type: "appendChild";
	parentId: string;
	node: UINode;
}

/**
 * Insert a child node before a reference node.
 * The full serialized subtree is provided in `node`; `beforeId` may
 * reference an element or a text node. Hosts must treat this as a MOVE
 * when the node already exists in the tree.
 */
export interface InsertBeforeMutation {
	type: "insertBefore";
	parentId: string;
	node: UINode;
	beforeId: string;
}

/**
 * Remove a child node from a parent
 * `nodeId` is the element id or textNodeId
 */
export interface RemoveChildMutation {
	type: "removeChild";
	parentId: string;
	nodeId: string;
}

/**
 * Update the content of a text node, addressed by its stable node id
 * (protocol v3 — previously addressed by parentId + childIndex, which
 * corrupted the wrong child whenever host and plugin trees diverged)
 */
export interface SetTextMutation {
	type: "setText";
	nodeId: string;
	text: string;
}

/**
 * Update all props of an element node
 * Sends full serialized props (not a diff) for simplicity
 */
export interface SetPropsMutation {
	type: "setProps";
	nodeId: string;
	props: Record<string, JSONValue>;
}

/**
 * Set or replace the entire root node
 * Used for first render and full-root replacements
 */
export interface SetRootMutation {
	type: "setRoot";
	node: UINode | null;
}

/**
 * Discriminated union of all mutation types
 */
export type Mutation =
	| AppendChildMutation
	| InsertBeforeMutation
	| RemoveChildMutation
	| SetTextMutation
	| SetPropsMutation
	| SetRootMutation;
