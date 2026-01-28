import type { ComponentType, ReactElement } from "react";
import { createElement } from "react";
import type { UINode, JSONValue, HandlerId } from "@uniview/protocol";
import type { PluginController, HostMode } from "../types";
import {
  createRenderBridge,
  render,
  serializeTree,
  HandlerRegistry,
} from "@uniview/react-renderer";

export interface MainControllerOptions {
  App: ComponentType<unknown>;
  initialProps?: JSONValue;
}

export function createMainController(
  opts: MainControllerOptions,
): PluginController {
  const { App, initialProps } = opts;

  let bridge: ReturnType<typeof createRenderBridge> | null = null;
  let currentElement: ReactElement | null = null;
  let handlerRegistry: HandlerRegistry | null = null;
  let tree: UINode | null = null;
  let connected = false;
  const subscribers = new Set<(tree: UINode | null) => void>();

  return {
    async connect() {
      handlerRegistry = new HandlerRegistry();
      bridge = createRenderBridge();

      bridge.subscribe(() => {
        if (!bridge || !handlerRegistry) return;

        tree = serializeTree(
          bridge.rootInstance,
          handlerRegistry,
        ) as UINode | null;

        subscribers.forEach((cb) => cb(tree));
      });

      currentElement = createElement(App, (initialProps ?? {}) as object);
      render(currentElement, bridge);
      connected = true;
    },

    async disconnect() {
      bridge = null;
      currentElement = null;
      handlerRegistry?.clear();
      handlerRegistry = null;
      connected = false;
      tree = null;
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

    async reload() {
      await this.disconnect();
      await this.connect();
    },

    getTree() {
      return tree;
    },

    subscribe(cb: (tree: UINode | null) => void) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },

    async execute(handlerId: HandlerId, args?: JSONValue[]) {
      if (!handlerRegistry) return;
      await handlerRegistry.execute(handlerId, ...(args ?? []));
    },

    getStatus(): { mode: HostMode; connected: boolean; lastError?: string } {
      return {
        mode: "main",
        connected,
      };
    },
  };
}
