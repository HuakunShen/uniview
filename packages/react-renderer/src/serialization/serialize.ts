import type { UINode } from "@uniview/protocol";
import type { InternalNode, TextNode } from "../reconciler/types";
import type { HandlerRegistry } from "./handler-registry";
import { serializeProps } from "./serialize-props";

function isTextNode(node: unknown): node is TextNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "_isTextNode" in node &&
    (node as TextNode)._isTextNode === true
  );
}

/**
 * Serialize a full tree from the root. Brackets the walk with a registry
 * sweep so handlers owned by nodes that left the tree are released —
 * without this, full update mode leaks handlers for every removed node.
 */
export function serializeTree(
  instance: InternalNode | TextNode | null,
  registry: HandlerRegistry,
): UINode | string | null {
  registry.beginSweep();
  try {
    return serializeNode(instance, registry);
  } finally {
    registry.endSweep();
  }
}

function serializeNode(
  instance: InternalNode | TextNode | null,
  registry: HandlerRegistry,
): UINode | string | null {
  if (instance == null) {
    return null;
  }

  if (isTextNode(instance)) {
    return instance.text;
  }

  const serializedChildren: (UINode | string)[] = [];
  for (const child of instance.children) {
    const serializedChild = serializeNode(
      child as InternalNode | TextNode,
      registry,
    );
    if (serializedChild !== null) {
      serializedChildren.push(serializedChild);
    }
  }

  return {
    type: instance.type,
    props: serializeProps(instance.props, registry, instance.id),
    children: serializedChildren,
    id: instance.id,
  };
}
