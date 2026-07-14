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
import { setHostEnvironment } from "./environment";
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
  /**
   * Enable benchmark stats (globalThis.__uniview_stats). Costs an extra
   * JSON.stringify of every payload per update — keep off in production.
   */
  debug?: boolean;
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
  const { App, transport, mode = "full", debug = false } = options;

  let disposeRoot: (() => void) | null = null;
  let setProps: ((props: Record<string, unknown>) => void) | null = null;
  let handlerRegistry: HandlerRegistry | null = null;
  let mutationCollector: SolidMutationCollector | null = null;
  let rpc: RPCChannel<HostToPluginAPI, PluginToHostAPI> | null = null;

  // Stats tracking (debug only — the stringify below doubles
  // serialization cost per update)
  const stats: Stats = { bytesSent: 0, messagesSent: 0 };
  if (debug) {
    globalThis.__uniview_stats = stats;
  }
  function trackStats(payload: unknown): void {
    if (!debug) return;
    stats.bytesSent += JSON.stringify(payload).length;
    stats.messagesSent++;
  }

  /** Forward a plugin-side error to the host's reportError RPC. */
  function reportErrorToHost(error: unknown): void {
    console.error("[uniview plugin]", error);
    if (!rpc) return;
    const payload =
      error instanceof Error
        ? { message: error.message, ...(error.stack ? { stack: error.stack } : {}) }
        : { message: String(error) };
    try {
      void rpc.getAPI().reportError(payload);
    } catch {
      // Channel already gone — nothing more to do.
    }
  }

  interface GlobalErrorTarget {
    addEventListener?: (type: string, listener: (event: unknown) => void) => void;
    removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
  }

  const globalTarget = globalThis as GlobalErrorTarget;
  const onGlobalError = (event: unknown) => {
    const e = event as { error?: unknown; message?: unknown };
    reportErrorToHost(e.error ?? e.message ?? event);
  };
  const onUnhandledRejection = (event: unknown) => {
    const e = event as { reason?: unknown };
    reportErrorToHost(e.reason ?? event);
  };

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
        trackStats(mutations);
        rpc.getAPI().applyMutations(mutations);
      });

      // No full-tree backstop: the reconciler now emits a setRoot mutation
      // whenever the plugin's top-level element attaches to (or leaves) the
      // synthetic container, so the host seeds and stays in sync from
      // mutations alone. syncTree() remains the explicit full-tree recovery
      // path if a host detects drift.
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

        trackStats(serializedTree);
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
      // Seed before the first render, so a plugin keying off colorScheme()
      // doesn't paint light, ship it to the host, and repaint dark a round
      // trip later.
      if (req.env) setHostEnvironment(req.env);
      setupRuntime((req.props ?? {}) as Record<string, unknown>);
    },

    async setEnvironment(env) {
      setHostEnvironment(env);
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

      trackStats(serializedTree);
      rpc.getAPI().updateTree(serializedTree);
    },

    async destroy() {
      resetState();
    },
  };

  return {
    async start() {
      rpc = createChannel(transport, pluginAPI);
      // Uncaught exceptions and unhandled rejections anywhere in the
      // plugin context are reported to the host.
      globalTarget.addEventListener?.("error", onGlobalError);
      globalTarget.addEventListener?.("unhandledrejection", onUnhandledRejection);
    },
    stop() {
      globalTarget.removeEventListener?.("error", onGlobalError);
      globalTarget.removeEventListener?.("unhandledrejection", onUnhandledRejection);
      // Full teardown so a stopped runtime leaves no live reactive root.
      resetState();
      rpc?.destroy();
      rpc = null;
    },
  };
}
