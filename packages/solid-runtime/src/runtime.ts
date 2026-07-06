import type { Component } from "solid-js";
import { createRoot } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
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
  let setProps: ((props: Record<string, unknown>) => void) | null = null;
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
    setProps = null;
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

      // Full tree on every flush is (still) required in incremental mode:
      // solid has no setRoot mutation — the host tree is seeded from
      // updateTree, and mutations that replace the top-level element
      // reference the internal container id which hosts never see. Proper
      // root seeding is tracked in BACKLOG; until then the full tree is
      // the correctness backstop.
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

        // No clear() here: it reset the id counter, so handler ids were
        // REUSED across renders and a late event RPC could execute the
        // wrong handler. serializeTree sweeps stale nodes itself now.

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
      // Props go through a store so updateProps() can update them
      // reactively instead of tearing down and rebuilding the whole tree
      // (which lost all plugin state on every host-side prop change).
      const [propsStore, updatePropsStore] = createStore<
        Record<string, unknown>
      >({ ...props });
      setProps = (next) => updatePropsStore(reconcile(next, { merge: true }));
      render(() => App(propsStore), rootNode);
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
      const next = (props ?? {}) as Record<string, unknown>;
      if (setProps) {
        // Reactive update — matches the react runtime's re-render-in-place
        // semantics instead of a full teardown that lost plugin state.
        setProps(next);
        return;
      }
      resetState();
      setupRuntime(next);
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
      // Full teardown so a stopped runtime leaves no live reactive root.
      resetState();
      rpc?.destroy();
      rpc = null;
    },
  };
}
