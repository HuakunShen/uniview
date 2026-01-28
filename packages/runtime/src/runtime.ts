import type { ReactElement, ComponentType } from "react";
import { createElement } from "react";
import type { RPCChannel, DestroyableIoInterface } from "kkrpc";
import type {
  JSONValue,
  UINode,
  HostToPluginAPI,
  PluginToHostAPI,
} from "@uniview/protocol";
import {
  createRenderer,
  render,
  serializeTree,
  HandlerRegistry,
  type RenderBridge,
} from "@uniview/react-renderer";

interface RendererHandle extends RenderBridge {
  _container?: unknown;
}

export interface PluginRuntimeOptions<T extends DestroyableIoInterface> {
  App: ComponentType<unknown>;
  io: T;
}

export interface PluginRuntime {
  start(): Promise<void>;
  stop(): void;
}

export function createPluginRuntime<T extends DestroyableIoInterface>(
  options: PluginRuntimeOptions<T>,
  createChannel: (
    io: T,
    expose: HostToPluginAPI,
  ) => RPCChannel<HostToPluginAPI, PluginToHostAPI, T>,
): PluginRuntime {
  const { App, io } = options;

  let bridge: RendererHandle | null = null;
  let currentElement: ReactElement | null = null;
  let handlerRegistry: HandlerRegistry | null = null;
  let rpc: RPCChannel<HostToPluginAPI, PluginToHostAPI, T> | null = null;

  const pluginAPI: HostToPluginAPI = {
    async initialize(req) {
      handlerRegistry = new HandlerRegistry();
      bridge = createRenderer();

      bridge.subscribe(() => {
        if (!bridge || !handlerRegistry || !rpc) return;

        const serializedTree = serializeTree(
          bridge.rootInstance,
          handlerRegistry,
        ) as UINode | null;

        rpc.getAPI().updateTree(serializedTree);
      });

      currentElement = createElement(App, (req.props ?? {}) as object);
      render(currentElement, bridge);
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

    async executeHandler(handlerId, args) {
      if (!handlerRegistry) return;
      await handlerRegistry.execute(handlerId, ...args);
    },

    async destroy() {
      bridge = null;
      currentElement = null;
      handlerRegistry?.clear();
      handlerRegistry = null;
      io.destroy();
    },
  };

  return {
    async start() {
      rpc = createChannel(io, pluginAPI);
    },
    stop() {
      io.destroy();
    },
  };
}
