import type { ReactElement, ComponentType } from "react";
import { createElement } from "react";
import type { RPCChannel, IoInterface } from "kkrpc";
import type {
  JSONValue,
  UINode,
  HostToPluginAPI,
  PluginToHostAPI,
  UpdateMode,
  Mutation,
} from "@uniview/protocol";
import {
  createRenderer,
  render,
  serializeTree,
  HandlerRegistry,
  MutationCollector,
  type RenderBridge,
} from "@uniview/react-renderer";

interface RendererHandle extends RenderBridge {
  _container?: unknown;
}

export interface PluginRuntimeOptions<T extends IoInterface> {
  App: ComponentType<unknown>;
  io: T;
  mode?: UpdateMode;
}

export interface PluginRuntime {
  start(): Promise<void>;
  stop(): void;
}

// Stats tracking for benchmarks
interface Stats {
  bytesSent: number;
  messagesSent: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __uniview_stats: Stats | undefined;
}

export function createPluginRuntime<T extends IoInterface>(
  options: PluginRuntimeOptions<T>,
  createChannel: (
    io: T,
    expose: HostToPluginAPI,
  ) => RPCChannel<HostToPluginAPI, PluginToHostAPI, T>,
): PluginRuntime {
  const { App, io, mode = "full" } = options;

  let bridge: RendererHandle | null = null;
  let currentElement: ReactElement | null = null;
  let handlerRegistry: HandlerRegistry | null = null;
  let mutationCollector: MutationCollector | null = null;
  let rpc: RPCChannel<HostToPluginAPI, PluginToHostAPI, T> | null = null;

  // Stats tracking
  const stats: Stats = { bytesSent: 0, messagesSent: 0 };
  globalThis.__uniview_stats = stats;

  const pluginAPI: HostToPluginAPI = {
    async initialize(req) {
      handlerRegistry = new HandlerRegistry();
      bridge = createRenderer();

      if (mode === "incremental") {
        // Set up mutation collection
        mutationCollector = new MutationCollector(handlerRegistry);
        bridge.mutationCollector = mutationCollector;

        bridge.subscribeMutations((mutations: Mutation[]) => {
          if (!rpc) return;

          // Track stats
          const bytes = JSON.stringify(mutations).length;
          stats.bytesSent += bytes;
          stats.messagesSent++;

          rpc.getAPI().applyMutations(mutations);
        });

        // Send full tree for initial render
        // In incremental mode, skip this and let mutations establish the tree
        if (mode !== "incremental") {
          bridge.subscribe(() => {
            if (!bridge || !handlerRegistry || !rpc) return;

            const serializedTree = serializeTree(
              bridge.rootInstance,
              handlerRegistry,
            ) as UINode | null;

            // Track stats
            const bytes = JSON.stringify(serializedTree).length;
            stats.bytesSent += bytes;
            stats.messagesSent++;

            rpc.getAPI().updateTree(serializedTree);
          });
        }
      } else {
        // Full tree mode (default)
        bridge.subscribe(() => {
          if (!bridge || !handlerRegistry || !rpc) return;

          const serializedTree = serializeTree(
            bridge.rootInstance,
            handlerRegistry,
          ) as UINode | null;

          // Track stats
          const bytes = JSON.stringify(serializedTree).length;
          stats.bytesSent += bytes;
          stats.messagesSent++;

          rpc.getAPI().updateTree(serializedTree);
        });
      }

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

    async syncTree() {
      if (!bridge || !rpc) return;

      const serializedTree = serializeTree(
        mode === "incremental"
          ? (bridge.rootInstance ?? null)
          : (bridge.rootInstance ?? null),
        handlerRegistry,
      ) as UINode | null;

      const bytes = JSON.stringify(serializedTree).length;
      stats.bytesSent += bytes;
      stats.messagesSent++;

      rpc.getAPI().updateTree(serializedTree);
    },

    /**
     * Update a single list item for benchmarking
     * Designed for testing incremental mode efficiency
     * Triggers setText mutation on specific child by itemId
     */
    async updateItem(itemId: string, text: string): Promise<void> {
      if (!bridge || !currentElement) return;

      const newElement = createElement(
        (currentElement as unknown as { type: ComponentType<unknown> }).type,
        (props ?? {}) as object,
      );
      currentElement = newElement;
      render(newElement, bridge);
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

    async syncTree() {
      if (!bridge || !rpc) return;

      const serializedTree = serializeTree(
        mode === "incremental"
          ? (bridge.rootInstance ?? null)
          : (bridge.rootInstance ?? null),
        handlerRegistry,
      ) as UINode | null;

      const bytes = JSON.stringify(serializedTree).length;
      stats.bytesSent += bytes;
      stats.messagesSent++;

      rpc.getAPI().updateTree(serializedTree);
    },

    async destroy() {
      bridge = null;
      currentElement = null;
      mutationCollector = null;
      handlerRegistry?.clear();
      handlerRegistry = null;
      io.destroy?.();
    },
  };

  return {
    async start() {
      rpc = createChannel(io, pluginAPI);
    },
    stop() {
      io.destroy?.();
    },
  };
}
