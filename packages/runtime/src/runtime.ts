import type { ReactElement, ComponentType } from "react";
import { createElement } from "react";
import type { RPCChannel, DestroyableIoInterface } from "kkrpc";
import type {
  JSONValue,
  UINode,
  HostToPluginAPI,
  PluginToHostAPI,
  Mutation,
} from "@uniview/protocol";
import {
  createRenderer,
  render,
  serializeTree,
  HandlerRegistry,
  MutationCollector,
  setMutationCollector,
  type RenderBridge,
  type InternalNode,
} from "@uniview/react-renderer";

interface RendererHandle extends RenderBridge {
  _container?: unknown;
}

export interface PluginRuntimeOptions<T extends DestroyableIoInterface> {
  App: ComponentType<unknown>;
  io: T;
  updateMode?: "full" | "incremental";
}

export interface PluginRuntime {
  start(): Promise<void>;
  stop(): void;
}

export function createPluginRuntime<T extends DestroyableIoInterface>(
  opts: PluginRuntimeOptions<T>,
  createChannel: (
    io: T,
    expose: HostToPluginAPI,
  ) => RPCChannel<HostToPluginAPI, PluginToHostAPI, T>,
): PluginRuntime {
  const { App, io, updateMode = "incremental" } = opts;

  let bridge: RendererHandle | null = null;
  let currentElement: ReactElement | null = null;
  let handlerRegistry: HandlerRegistry | null = null;
  let mutationCollector: MutationCollector | null = null;
  let rpc: RPCChannel<HostToPluginAPI, PluginToHostAPI, T> | null = null;
  let isFirstRender = true;

  const pluginAPI: HostToPluginAPI = {
    async initialize(req) {
      handlerRegistry = new HandlerRegistry();
      mutationCollector = new MutationCollector(handlerRegistry);
      if (updateMode !== "full") {
        setMutationCollector(mutationCollector);
      }
      bridge = createRenderer();

      bridge.subscribe((type, data) => {
        if (!bridge || !handlerRegistry || !rpc) return;

        if (type === "full") {
          const tree = data as InternalNode | null;
          const serializedTree = serializeTree(
            tree,
            handlerRegistry,
          ) as UINode | null;
          rpc.getAPI().updateTree(serializedTree);
        } else if (type === "mutations") {
          const mutations = data as Mutation[];
          rpc.getAPI().applyMutations(mutations);
        }
      });

      currentElement = createElement(App, (req.props ?? {}) as object);
      render(currentElement, bridge);
      isFirstRender = false;
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
      setMutationCollector(null);
      bridge = null;
      currentElement = null;
      handlerRegistry?.clear();
      handlerRegistry = null;
      mutationCollector = null;
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
