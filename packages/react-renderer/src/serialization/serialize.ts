import type { UINode, JSONValue } from "@uniview/protocol";
import { EVENT_PROPS, handlerIdProp } from "@uniview/protocol";
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

    if (
      EVENT_PROPS.includes(key as (typeof EVENT_PROPS)[number]) &&
      typeof value === "function"
    ) {
      const handlerId = registry.register(
        value as (...args: unknown[]) => unknown,
      );
      serializedProps[handlerIdProp(key as (typeof EVENT_PROPS)[number])] =
        handlerId;
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
