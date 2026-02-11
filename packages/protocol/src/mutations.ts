import type { JSONValue, UINode } from "./tree";

/**
 * Update mode for plugin rendering
 * - "full": Send entire tree on every update (default, backward compatible)
 * - "incremental": Send only mutations (more efficient for large trees)
 */
export type UpdateMode = "full" | "incremental";

/**
 * Append a child node to a parent
 * For element nodes, the full serialized subtree is provided in `node`
 * For text nodes, `textNodeId` and `text` are set, and `node` is omitted
 */
export interface AppendChildMutation {
	type: "appendChild";
	parentId: string;
	node: UINode;
}

/**
 * Insert a child node before a reference node
 * For element nodes, the full serialized subtree is provided in `node`
 * For text nodes, `textNodeId` and `text` are set, and `node` is omitted
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
 * Update the text content of a text node
 */
export interface SetTextMutation {
	type: "setText";
	parentId: string;
	childIndex: number;
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
