import type { JSONValue } from "@uniview/protocol";
import type { HandlerRegistry } from "./handler-registry";

/**
 * Serialize props for a node, converting event handlers to handler IDs
 * and filtering out non-serializable values.
 *
 * Handler ids are deterministic (`${nodeId}:${propName}`) and the node's
 * full handler set is synced into the registry in one shot, so repeated
 * serialization of the same node never grows the registry.
 *
 * This is shared between full-tree serialization and mutation-based updates.
 */
export function serializeProps(
	props: Record<string, unknown>,
	registry: HandlerRegistry,
	nodeId: string,
): Record<string, JSONValue> {
	const serializedProps: Record<string, JSONValue> = {};
	const handlers = new Map<string, (...args: unknown[]) => unknown>();

	for (const [key, value] of Object.entries(props)) {
		// Skip React-internal props
		if (key === "children" || key === "key" || key === "ref") {
			continue;
		}

		// Convert event handler functions (on[A-Z]*) to handler IDs
		if (typeof value === "function") {
			if (/^on[A-Z]/.test(key)) {
				const handlerId = `${nodeId}:${key}`;
				handlers.set(handlerId, value as (...args: unknown[]) => unknown);
				serializedProps[`_${key}HandlerId`] = handlerId;
			}
			continue;
		}
		// Include JSON-serializable values
		else if (value !== undefined && value !== null) {
			try {
				JSON.stringify(value);
				serializedProps[key] = value as JSONValue;
			} catch {
				// Skip values that can't be serialized
				continue;
			}
		}
	}

	registry.syncNode(nodeId, handlers);

	return serializedProps;
}
