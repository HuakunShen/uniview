import type { Mutation, JSONValue } from "@uniview/protocol";
import { EVENT_PROPS, handlerIdProp } from "@uniview/protocol";
import type { HandlerRegistry } from "./handler-registry";

export class MutationCollector {
  private mutations: Mutation[] = [];
  private registry: HandlerRegistry;
  private previousHandlers = new Map<string, string>();

  constructor(registry: HandlerRegistry) {
    this.registry = registry;
  }

  collectSetProp(
    nodeId: string,
    key: string,
    value: unknown,
    prevValue?: unknown,
  ): void {
    if (value === prevValue) return;

    if (
      EVENT_PROPS.includes(key as (typeof EVENT_PROPS)[number]) &&
      typeof value === "function"
    ) {
      const handlerId = this.registry.register(
        value as (...args: unknown[]) => unknown,
      );
      const prevHandlerId = this.previousHandlers.get(`${nodeId}:${key}`);
      if (prevHandlerId) {
        this.registry.remove(prevHandlerId);
      }
      this.previousHandlers.set(`${nodeId}:${key}`, handlerId);

      this.mutations.push({
        type: "setProp",
        nodeId,
        key: handlerIdProp(key as (typeof EVENT_PROPS)[number]),
        value: handlerId,
      });
    } else if (typeof value !== "function") {
      this.mutations.push({
        type: "setProp",
        nodeId,
        key,
        value: value as JSONValue,
      });
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

  collectCreate(
    nodeId: string,
    nodeType: string,
    parentId: string | null,
    index: number,
    props: Record<string, unknown> = {},
  ): void {
    const serializedProps: Record<string, JSONValue> = {};
    for (const [key, value] of Object.entries(props)) {
      if (key === "children" || key === "key" || key === "ref") continue;
      if (
        EVENT_PROPS.includes(key as (typeof EVENT_PROPS)[number]) &&
        typeof value === "function"
      ) {
        const handlerId = this.registry.register(
          value as (...args: unknown[]) => unknown,
        );
        this.previousHandlers.set(`${nodeId}:${key}`, handlerId);
        serializedProps[handlerIdProp(key as (typeof EVENT_PROPS)[number])] =
          handlerId;
      } else if (typeof value !== "function") {
        serializedProps[key] = value as JSONValue;
      }
    }

    this.mutations.push({
      type: "create",
      nodeId,
      nodeType,
      parentId,
      index,
      props: serializedProps,
    });
  }

  collectRemove(nodeId: string, parentId: string): void {
    for (const [key, handlerId] of this.previousHandlers.entries()) {
      if (key.startsWith(`${nodeId}:`)) {
        this.registry.remove(handlerId);
      }
    }
    this.mutations.push({
      type: "remove",
      nodeId,
      parentId,
    });
  }

  collectSetText(nodeId: string, text: string): void {
    this.mutations.push({
      type: "setText",
      nodeId,
      text,
    });
  }

  collectReorder(parentId: string, childIds: string[]): void {
    this.mutations.push({
      type: "reorder",
      parentId,
      childIds,
    });
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
