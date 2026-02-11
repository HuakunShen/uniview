import type { Component } from "solid-js";
import { createRoot } from "solid-js";
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
  render,
  setUpdateCallback,
  setMutationUpdateCallback,
  setMutationCollector,
  setRootNode,
  getRootNode,
  serializeTree,
  HandlerRegistry,
  resetIdCounter,
  SolidMutationCollector,
  type SolidNode,
} from "@uniview/solid-renderer";

// Stats tracking for benchmarks
interface Stats {
  bytesSent: number;
  messagesSent: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __uniview_stats: Stats | undefined;
}

export interface SolidPluginRuntimeOptions<T extends IoInterface> {
  App: Component<Record<string, unknown>>;
  io: T;
  mode?: UpdateMode;
}

export interface SolidPluginRuntime {
  start(): Promise<void>;
  stop(): void;
}

export function createSolidPluginRuntime<T extends IoInterface>(
  options: SolidPluginRuntimeOptions<T>,
  createChannel: (
    io: T,
    expose: HostToPluginAPI,
  ) => RPCChannel<HostToPluginAPI, PluginToHostAPI, T>,
): SolidPluginRuntime {
  const { App, io, mode = "full" } = options;

  let disposeRoot: (() => void) | null = null;
  let handlerRegistry: HandlerRegistry | null = null;
  let mutationCollector: SolidMutationCollector | null = null;
  let rpc: RPCChannel<HostToPluginAPI, PluginToHostAPI, T> | null = null;

  // Stats tracking
  const stats: Stats = { bytesSent: 0, messagesSent: 0 };
  globalThis.__uniview_stats = stats;

  function resetState() {
    if (disposeRoot) {
      disposeRoot();
      disposeRoot = null;
    }
    setMutationCollector(null);
    mutationCollector = null;
    handlerRegistry?.clear();
    handlerRegistry = null;
    setRootNode(null);
  }

  function setupRuntime(props: Record<string, unknown>) {
    handlerRegistry = new HandlerRegistry();
    resetIdCounter();

    const rootNode: SolidNode = {
      _type: "element",
      id: "root",
      type: "div",
      props: {},
      children: [],
      parent: null,
    };
    setRootNode(rootNode);

    if (mode === "incremental") {
      // Set up mutation collection
      mutationCollector = new SolidMutationCollector(handlerRegistry);
      setMutationCollector(mutationCollector);

      setMutationUpdateCallback((mutations: Mutation[]) => {
        if (!rpc) return;

        // Track stats
        const bytes = JSON.stringify(mutations).length;
        stats.bytesSent += bytes;
        stats.messagesSent++;

        rpc.getAPI().applyMutations(mutations);
      });

      // Also send full tree for initial render
      setUpdateCallback(() => {
        if (!handlerRegistry || !rpc) return;

        const currentRoot = getRootNode();
        if (!currentRoot || currentRoot.children.length === 0) return;

        // Don't clear handler registry in incremental mode
        // The mutation collector manages handler lifecycle

        const serializedTree = serializeTree(
          currentRoot.children[0],
          handlerRegistry,
        ) as UINode | null;

        // Track stats
        const bytes = JSON.stringify(serializedTree).length;
        stats.bytesSent += bytes;
        stats.messagesSent++;

        rpc.getAPI().updateTree(serializedTree);
      });
    } else {
      // Full tree mode (default)
      setUpdateCallback(() => {
        if (!handlerRegistry || !rpc) return;

        const currentRoot = getRootNode();
        if (!currentRoot || currentRoot.children.length === 0) return;

        handlerRegistry.clear();

        const serializedTree = serializeTree(
          currentRoot.children[0],
          handlerRegistry,
        ) as UINode | null;

        // Track stats
        const bytes = JSON.stringify(serializedTree).length;
        stats.bytesSent += bytes;
        stats.messagesSent++;

        rpc.getAPI().updateTree(serializedTree);
      });
    }

    disposeRoot = createRoot((dispose) => {
      render(() => App(props), rootNode);
      return dispose;
    });
  }

  const pluginAPI: HostToPluginAPI = {
    async initialize(req) {
      resetState();
      setupRuntime((req.props ?? {}) as Record<string, unknown>);
    },

    async updateProps(props: JSONValue) {
      resetState();
      setupRuntime((props ?? {}) as Record<string, unknown>);
    },

    async executeHandler(handlerId, args) {
      if (!handlerRegistry) return;
      await handlerRegistry.execute(handlerId, ...args);
    },

    async destroy() {
      resetState();
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
