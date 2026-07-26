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
import { resetHostEnvironment, setHostEnvironment } from "./environment";
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

  /**
   * Send something at the host without waiting for it, and survive the host
   * not being there any more.
   *
   * These pushes are fire-and-forget by design — a render must not block on a
   * round trip. But an un-awaited RPC still rejects when the host disappears
   * mid-flight (kkrpc times a request out after 30s), and in a plugin running
   * under Node or Bun — the bridge/ws-client case — an unhandled rejection
   * TERMINATES THE PROCESS. That is how the E2E suite's `simple-demo` bridge
   * client died with `RPCTimeoutError` the moment a host closed its tab, and
   * with it every later test that needed that plugin.
   *
   * A host that went away is an ordinary event. Log it and stay alive: the
   * ws-client keeps the plugin registered so the next host can attach.
   *
   * Deliberately does not route to `reportErrorToHost` — that is another RPC
   * at the same absent host, and would recurse.
   */
  function pushToHost(what: string, send: () => unknown): void {
    try {
      const pending = send() as Promise<unknown> | undefined;
      if (pending && typeof pending.catch === "function") {
        pending.catch((error: unknown) => {
          console.warn(`[uniview plugin] ${what} did not reach the host:`, error);
        });
      }
    } catch (error) {
      console.warn(`[uniview plugin] ${what} did not reach the host:`, error);
    }
  }

  /** Forward a plugin-side error to the host's reportError RPC. */
  function reportErrorToHost(error: unknown): void {
    console.error("[uniview plugin]", error);
    const channel = rpc;
    if (!channel) return;
    const payload =
      error instanceof Error
        ? { message: error.message, ...(error.stack ? { stack: error.stack } : {}) }
        : { message: String(error) };
    pushToHost("reportError", () => channel.getAPI().reportError(payload));
  }

  interface GlobalErrorTarget {
    addEventListener?: (type: string, listener: (event: unknown) => void) => void;
    removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
  }

  /**
   * Node/Deno/Bun's `process`, reached through globalThis so no Node-only
   * import creeps into the Worker/browser build.
   */
  interface NodeProcessLike {
    on: (event: string, listener: (value: unknown) => void) => unknown;
    off?: (event: string, listener: (value: unknown) => void) => unknown;
    removeListener?: (event: string, listener: (value: unknown) => void) => unknown;
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
  // Node hands the error/reason itself to the listener, not a browser event
  // object wrapping it — unwrapping would throw away the stack.
  const onProcessError = (error: unknown) => {
    reportErrorToHost(error);
  };

  /**
   * A browser/Worker has addEventListener; a plugin running under Node, Deno or
   * Bun (the bridge/WebSocket case) does not, and used to get no global error
   * capture at all because the optional call silently did nothing.
   */
  function hasEventTarget(): boolean {
    return typeof globalTarget.addEventListener === "function";
  }

  function getNodeProcess(): NodeProcessLike | undefined {
    return (globalThis as unknown as { process?: NodeProcessLike }).process;
  }

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
    // The environment signal is module-level, so on the main thread the next
    // plugin in this process would inherit this one's dark mode and accent
    // color. The host re-seeds it on initialize().
    resetHostEnvironment();
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
        const channel = rpc;
        if (!channel) return;
        trackStats(mutations);
        pushToHost("applyMutations", () =>
          channel.getAPI().applyMutations(mutations),
        );
      });

      // No full-tree backstop: the reconciler now emits a setRoot mutation
      // whenever the plugin's top-level element attaches to (or leaves) the
      // synthetic container, so the host seeds and stays in sync from
      // mutations alone. syncTree() remains the explicit full-tree recovery
      // path if a host detects drift.
    } else {
      // Full tree mode (default)
      setUpdateCallback(() => {
        const channel = rpc;
        if (!handlerRegistry || !channel) return;

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
        pushToHost("updateTree", () =>
          channel.getAPI().updateTree(serializedTree),
        );
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
      const channel = rpc;
      if (!channel || !handlerRegistry) return;

      const currentRoot = getRootNode();
      if (!currentRoot || currentRoot.children.length === 0) return;

      const serializedTree = serializeTree(
        currentRoot.children[0],
        handlerRegistry,
      ) as UINode | null;

      trackStats(serializedTree);
      pushToHost("updateTree", () => channel.getAPI().updateTree(serializedTree));
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
      if (hasEventTarget()) {
        globalTarget.addEventListener?.("error", onGlobalError);
        globalTarget.addEventListener?.("unhandledrejection", onUnhandledRejection);
      } else {
        // Note: listening for "uncaughtException" also stops Node from exiting
        // on one — deliberate, and the same contract the browser path has: the
        // host is told the plugin crashed and decides what to do about it.
        const proc = getNodeProcess();
        proc?.on("uncaughtException", onProcessError);
        proc?.on("unhandledRejection", onProcessError);
      }
    },
    stop() {
      if (hasEventTarget()) {
        globalTarget.removeEventListener?.("error", onGlobalError);
        globalTarget.removeEventListener?.("unhandledrejection", onUnhandledRejection);
      } else {
        const proc = getNodeProcess();
        const off = proc?.off ?? proc?.removeListener;
        off?.call(proc, "uncaughtException", onProcessError);
        off?.call(proc, "unhandledRejection", onProcessError);
      }
      // Full teardown so a stopped runtime leaves no live reactive root.
      resetState();
      rpc?.destroy();
      rpc = null;
    },
  };
}
