import type { Component } from "solid-js";
import { createRoot } from "solid-js";
import type { RPCChannel, RPCMessage, Transport } from "kkrpc";
import type {
  JSONValue,
  UINode,
  HostToPluginAPI,
  PluginToHostAPI,
  UpdateMode,
  Mutation,
} from "@uniview/protocol";
import { PROTOCOL_VERSION } from "@uniview/protocol";
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

function assertProtocolVersion(protocolVersion: number): void {
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `Protocol version mismatch: host=${protocolVersion}, plugin=${PROTOCOL_VERSION}`,
    );
  }
}

export interface SolidPluginRuntimeOptions<T extends Transport<RPCMessage>> {
  App: Component<Record<string, unknown>>;
  transport: T;
  mode?: UpdateMode;
}

export interface SolidPluginRuntime {
  start(): Promise<void>;
  stop(): void;
}

export function createSolidPluginRuntime<T extends Transport<RPCMessage>>(
  options: SolidPluginRuntimeOptions<T>,
  createChannel: (
    transport: T,
    expose: HostToPluginAPI,
  ) => RPCChannel<HostToPluginAPI, PluginToHostAPI>,
): SolidPluginRuntime {
  const { App, transport, mode = "full" } = options;

  let disposeRoot: (() => void) | null = null;
  let handlerRegistry: HandlerRegistry | null = null;
  let mutationCollector: SolidMutationCollector | null = null;
  let rpc: RPCChannel<HostToPluginAPI, PluginToHostAPI> | null = null;

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

      // Also set up full tree callback for initial render
      // Mutations only capture changes, not initial state
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
      assertProtocolVersion(req.protocolVersion);
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

    async syncTree() {
      if (!rpc || !handlerRegistry) return;

      const currentRoot = getRootNode();
      if (!currentRoot || currentRoot.children.length === 0) return;

      const serializedTree = serializeTree(
        currentRoot.children[0],
        handlerRegistry,
      ) as UINode | null;

      const bytes = JSON.stringify(serializedTree).length;
      stats.bytesSent += bytes;
      stats.messagesSent++;

      rpc.getAPI().updateTree(serializedTree);
    },

    async destroy() {
      resetState();
    },
  };

  return {
    async start() {
      rpc = createChannel(transport, pluginAPI);
    },
    stop() {
      rpc?.destroy();
      rpc = null;
    },
  };
}
