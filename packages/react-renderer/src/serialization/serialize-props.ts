import type { JSONValue } from "@uniview/protocol";
import type { HandlerRegistry } from "./handler-registry";

/**
 * Serialize props for a node, converting event handlers to handler IDs
 * and filtering out non-serializable values.
 *
 * This is shared between full-tree serialization and mutation-based updates.
 */
export function serializeProps(
	props: Record<string, unknown>,
	registry: HandlerRegistry,
): Record<string, JSONValue> {
	const serializedProps: Record<string, JSONValue> = {};

	for (const [key, value] of Object.entries(props)) {
		// Skip React-internal props
		if (key === "children" || key === "key" || key === "ref") {
			continue;
		}

		// Convert event handler functions (on[A-Z]*) to handler IDs
		if (typeof value === "function") {
			if (/^on[A-Z]/.test(key)) {
				const handlerId = registry.register(
					value as (...args: unknown[]) => unknown,
				);
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

	return serializedProps;
}
