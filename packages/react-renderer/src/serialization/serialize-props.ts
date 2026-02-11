import type { JSONValue } from "@uniview/protocol";
import { EVENT_PROPS, handlerIdProp } from "@uniview/protocol";
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

		// Convert event handlers to handler IDs
		if (
			EVENT_PROPS.includes(key as (typeof EVENT_PROPS)[number]) &&
			typeof value === "function"
		) {
			const handlerId = registry.register(
				value as (...args: unknown[]) => unknown,
			);
			serializedProps[handlerIdProp(key as (typeof EVENT_PROPS)[number])] =
				handlerId;
		}
		// Skip other functions
		else if (typeof value === "function") {
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
