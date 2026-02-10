import type { JSONValue } from "./tree";

/**
 * Mutation types for incremental UI updates
 *
 * Instead of sending the entire UINode tree on every change,
 * plugins send a batch of mutations describing only what changed.
 *
 * This reduces RPC payload size from O(n) to O(changes).
 */

/**
 * Create a new node and insert it at the specified position
 */
export interface CreateMutation {
  type: "create";
  /** Unique ID for the new node */
  nodeId: string;
  /** Component type (e.g., "div", "button", "Card") */
  nodeType: string;
  /** Parent node ID (null for root) */
  parentId: string | null;
  /** Index in parent's children array */
  index: number;
  /** Initial props (JSON-serializable, handler IDs for events) */
  props?: Record<string, JSONValue>;
}

/**
 * Remove a node from its parent
 */
export interface RemoveMutation {
  type: "remove";
  /** ID of node to remove */
  nodeId: string;
  /** Parent node ID */
  parentId: string;
}

/**
 * Update a single property on a node
 */
export interface SetPropMutation {
  type: "setProp";
  /** Target node ID */
  nodeId: string;
  /** Property name */
  key: string;
  /** New value (JSON-serializable, handler ID for event props) */
  value: JSONValue;
}

/**
 * Remove a property from a node
 */
export interface RemovePropMutation {
  type: "removeProp";
  /** Target node ID */
  nodeId: string;
  /** Property name to remove */
  key: string;
}

/**
 * Update text content of a text node
 */
export interface SetTextMutation {
  type: "setText";
  /** Text node ID */
  nodeId: string;
  /** New text content */
  text: string;
}

/**
 * Reorder children of a parent node
 * childIds specifies the new order (all existing children must be included)
 */
export interface ReorderMutation {
  type: "reorder";
  /** Parent node ID */
  parentId: string;
  /** Ordered list of child IDs */
  childIds: string[];
}

/**
 * Union type of all mutation operations
 */
export type Mutation =
  | CreateMutation
  | RemoveMutation
  | SetPropMutation
  | RemovePropMutation
  | SetTextMutation
  | ReorderMutation;

/**
 * Batch of mutations sent in a single update
 */
export type MutationBatch = Mutation[];
