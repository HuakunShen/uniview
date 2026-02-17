import type { UINode, JSONValue } from "@uniview/protocol";
import type { InternalNode, TextNode } from "../reconciler/types";
import type { HandlerRegistry } from "./handler-registry";

function isTextNode(node: unknown): node is TextNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "_isTextNode" in node &&
    (node as TextNode)._isTextNode === true
  );
}

/**
 * Check if a prop name looks like an event handler (starts with "on" followed by uppercase).
 * e.g., "onClick", "onAction", "onSearchTextChange"
 */
function isEventProp(key: string): boolean {
  return key.length > 2 && key.startsWith("on") && key[2] === key[2].toUpperCase();
}

/**
 * Convert an event prop name to its handler ID prop name.
 * e.g., "onClick" → "_onClickHandlerId", "onAction" → "_onActionHandlerId"
 */
function toHandlerIdProp(eventProp: string): string {
  return `_${eventProp}HandlerId`;
}

export function serializeTree(
  instance: InternalNode | TextNode | null,
  registry: HandlerRegistry,
): UINode | string | null {
  if (instance == null) {
    return null;
  }

  if (isTextNode(instance)) {
    return instance.text;
  }

  const serializedProps: Record<string, JSONValue> = {};

  for (const [key, value] of Object.entries(instance.props)) {
    if (key === "children" || key === "key" || key === "ref") {
      continue;
    }

    if (isEventProp(key) && typeof value === "function") {
      const handlerId = registry.register(
        value as (...args: unknown[]) => unknown,
      );
      serializedProps[toHandlerIdProp(key)] = handlerId;
    } else if (typeof value === "function") {
      continue;
    } else if (value !== undefined && value !== null) {
      try {
        JSON.stringify(value);
        serializedProps[key] = value as JSONValue;
      } catch {
        continue;
      }
    }
  }

  const serializedChildren: (UINode | string)[] = [];
  for (const child of instance.children) {
    const serializedChild = serializeTree(
      child as InternalNode | TextNode,
      registry,
    );
    if (serializedChild !== null) {
      serializedChildren.push(serializedChild);
    }
  }

  return {
    type: instance.type,
    props: serializedProps,
    children: serializedChildren,
    id: instance.id,
  };
}
