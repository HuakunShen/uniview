import type { Mutation, JSONValue } from "@uniview/protocol";
import type { HandlerRegistry } from "./handler-registry";
import type { InternalNode, TextNode } from "../reconciler/types";

/**
 * Check if a prop name looks like an event handler (starts with "on" followed by uppercase).
 */
function isEventProp(key: string): boolean {
  return key.length > 2 && key.startsWith("on") && key[2] === key[2].toUpperCase();
}

function toHandlerIdProp(eventProp: string): string {
  return `_${eventProp}HandlerId`;
}

export class MutationCollector {
  private mutations: Mutation[] = [];
  private registry: HandlerRegistry;
  private previousHandlers = new Map<string, string>();

  constructor(registry: HandlerRegistry) {
    this.registry = registry;
  }

  collectCommitUpdate(
    instance: InternalNode,
    oldProps: Record<string, unknown>,
    newProps: Record<string, unknown>,
  ): void {
    for (const [key, newValue] of Object.entries(newProps)) {
      if (key === "children" || key === "key" || key === "ref") continue;
      const oldValue = oldProps[key];
      if (newValue === oldValue) continue;

      if (isEventProp(key) && typeof newValue === "function") {
        const handlerId = this.registry.register(
          newValue as (...args: unknown[]) => unknown,
        );
        const handlerKey = `${instance.id}:${key}`;
        const prevHandlerId = this.previousHandlers.get(handlerKey);
        if (prevHandlerId) {
          this.registry.remove(prevHandlerId);
        }
        this.previousHandlers.set(handlerKey, handlerId);

        this.mutations.push({
          type: "setProp",
          nodeId: instance.id,
          key: toHandlerIdProp(key),
          value: handlerId,
        });
      } else if (typeof newValue !== "function") {
        this.mutations.push({
          type: "setProp",
          nodeId: instance.id,
          key,
          value: newValue as JSONValue,
        });
      }
    }

    for (const key of Object.keys(oldProps)) {
      if (!(key in newProps)) {
        this.collectRemoveProp(instance.id, key);
      }
    }
  }

  collectRemoveProp(nodeId: string, key: string): void {
    const handlerKey = `${nodeId}:${key}`;
    if (this.previousHandlers.has(handlerKey)) {
      const handlerId = this.previousHandlers.get(handlerKey)!;
      this.registry.remove(handlerId);
      this.previousHandlers.delete(handlerKey);
    }
    this.mutations.push({
      type: "removeProp",
      nodeId,
      key,
    });
  }

  collectAppendChild(
    parent: InternalNode,
    child: InternalNode | TextNode,
  ): void {
    const index = parent.children.length - 1;
    if ("_isTextNode" in child) {
      this.mutations.push({
        type: "create",
        nodeId: `text_${Math.random().toString(36).slice(2, 11)}`,
        nodeType: "text",
        parentId: parent.id,
        index,
        props: { text: child.text },
      });
    } else {
      const props = this.serializePropsForCreate(child);
      this.mutations.push({
        type: "create",
        nodeId: child.id,
        nodeType: child.type,
        parentId: parent.id,
        index,
        props,
      });
    }
  }

  collectInsertBefore(
    parent: InternalNode,
    child: InternalNode | TextNode,
    beforeChild: InternalNode | TextNode,
  ): void {
    const index = parent.children.indexOf(beforeChild);
    if (index === -1) return;

    if ("_isTextNode" in child) {
      this.mutations.push({
        type: "create",
        nodeId: `text_${Math.random().toString(36).slice(2, 11)}`,
        nodeType: "text",
        parentId: parent.id,
        index,
        props: { text: child.text },
      });
    } else {
      const props = this.serializePropsForCreate(child);
      this.mutations.push({
        type: "create",
        nodeId: child.id,
        nodeType: child.type,
        parentId: parent.id,
        index,
        props,
      });
    }
  }

  collectRemoveChild(
    parent: InternalNode,
    child: InternalNode | TextNode,
  ): void {
    if (!("_isTextNode" in child)) {
      for (const [key, handlerId] of this.previousHandlers.entries()) {
        if (key.startsWith(`${child.id}:`)) {
          this.registry.remove(handlerId);
        }
      }
      this.mutations.push({
        type: "remove",
        nodeId: child.id,
        parentId: parent.id,
      });
    } else {
      const textId = this.findTextNodeId(parent, child);
      if (textId) {
        this.mutations.push({
          type: "remove",
          nodeId: textId,
          parentId: parent.id,
        });
      }
    }
  }

  collectCommitTextUpdate(_textInstance: TextNode, newText: string): void {
    this.mutations.push({
      type: "setText",
      nodeId: `text_${Math.random().toString(36).slice(2, 11)}`,
      text: newText,
    });
  }

  private serializePropsForCreate(
    node: InternalNode,
  ): Record<string, JSONValue> {
    const props: Record<string, JSONValue> = {};
    for (const [key, value] of Object.entries(node.props)) {
      if (key === "children" || key === "key" || key === "ref") continue;
      if (isEventProp(key) && typeof value === "function") {
        const handlerId = this.registry.register(
          value as (...args: unknown[]) => unknown,
        );
        this.previousHandlers.set(`${node.id}:${key}`, handlerId);
        props[toHandlerIdProp(key)] = handlerId;
      } else if (typeof value !== "function") {
        props[key] = value as JSONValue;
      }
    }
    return props;
  }

  private findTextNodeId(
    parent: InternalNode,
    textNode: TextNode,
  ): string | null {
    const index = parent.children.indexOf(textNode);
    return index !== -1 ? `text_${parent.id}_${index}` : null;
  }

  flush(): Mutation[] {
    const result = this.mutations;
    this.mutations = [];
    return result;
  }

  clear(): void {
    this.mutations = [];
    this.previousHandlers.clear();
  }
}
