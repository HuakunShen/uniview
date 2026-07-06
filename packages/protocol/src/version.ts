/**
 * Protocol version number
 * Increment this when making breaking changes to the protocol
 *
 * v3: text children are explicit `{type: TEXT_NODE_TYPE, text}` nodes with
 *     stable ids; SetTextMutation is addressed by nodeId instead of
 *     parentId + childIndex.
 */
export const PROTOCOL_VERSION = 3;
