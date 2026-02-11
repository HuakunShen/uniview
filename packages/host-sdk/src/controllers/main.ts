import type { ComponentType, ReactElement } from "react";
import { createElement } from "react";
import type { UINode, JSONValue, HandlerId, Mutation } from "@uniview/protocol";
import type { PluginController, HostMode } from "../types";
import {
  createRenderBridge,
  render,
  serializeTree,
  HandlerRegistry,
  MutationCollector,
} from "@uniview/react-renderer";
import { MutableTree } from "../mutable-tree";

export interface MainControllerOptions {
  App: ComponentType<unknown>;
  initialProps?: JSONValue;
  mode?: "full" | "incremental";
}

export function createMainController(
  opts: MainControllerOptions,
): PluginController {
  const { App, initialProps, mode = "full" } = opts;

  let bridge: ReturnType<typeof createRenderBridge> | null = null;
  let currentElement: ReactElement | null = null;
  let handlerRegistry: HandlerRegistry | null = null;
  let mutationCollector: MutationCollector | null = null;
  let tree: UINode | null = null;
  let mutableTree = new MutableTree();
  let connected = false;
  const subscribers = new Set<(tree: UINode | null) => void>();

  return {
    async connect() {
      handlerRegistry = new HandlerRegistry();
      bridge = createRenderBridge();

      if (mode === "incremental") {
        mutationCollector = new MutationCollector(handlerRegistry);
        bridge.mutationCollector = mutationCollector;

        bridge.subscribeMutations((mutations: Mutation[]) => {
          tree = mutableTree.applyMutations(mutations);
          subscribers.forEach((cb) => void cb(tree));
        });

        bridge.subscribe(() => {
          if (!bridge || !handlerRegistry) return;
          tree = serializeTree(
            bridge.rootInstance,
            handlerRegistry,
          ) as UINode | null;
          mutableTree.init(tree);
          subscribers.forEach((cb) => void cb(tree));
        });
      } else {
        bridge.subscribe(() => {
          if (!bridge || !handlerRegistry) return;
          tree = serializeTree(
            bridge.rootInstance,
            handlerRegistry,
          ) as UINode | null;
          subscribers.forEach((cb) => void cb(tree));
        });
      }

      currentElement = createElement(App, (initialProps ?? {}) as object);
      render(currentElement, bridge);
      connected = true;
    },

    async disconnect() {
      bridge = null;
      currentElement = null;
      handlerRegistry?.clear();
      handlerRegistry = null;
      mutationCollector = null;
      connected = false;
      tree = null;
      mutableTree = new MutableTree();
    },

    async updateProps(props: JSONValue) {
      if (!bridge || !currentElement) return;

      const newElement = createElement(
        (currentElement as unknown as { type: ComponentType<unknown> }).type,
        (props ?? {}) as object,
      );
      currentElement = newElement;
      render(newElement, bridge);
    },

    async executeHandler(handlerId: HandlerId, args?: JSONValue[]) {
      if (!handlerRegistry) return;
      await handlerRegistry.execute(handlerId, ...(args ?? []));
    },

    async destroy() {
      await this.disconnect();
    },

    async syncTree(): Promise<void> {
      if (!connected) return;

      subscribers.forEach((cb) => void cb(tree));
    },

    getTree() {
      return tree;
    },

    subscribe(cb: (tree: UINode | null) => void): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },

    getStatus(): { mode: HostMode; connected: boolean; lastError?: string } {
      return {
        mode: "main",
        connected,
      };
    },
  };
}
