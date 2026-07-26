import type { ReactElement, ComponentType } from "react";
import { createElement } from "react";
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
  createRenderer,
  render,
  unmount,
  serializeTree,
  HandlerRegistry,
  MutationCollector,
  type RenderBridge,
} from "@uniview/react-renderer";

interface RendererHandle extends RenderBridge {
  _container?: unknown;
}

export interface PluginRuntimeOptions<T extends Transport<RPCMessage>> {
  App: ComponentType<unknown>;
  transport: T;
  mode?: UpdateMode;
  /**
   * Enable benchmark stats (globalThis.__uniview_stats). Costs an extra
   * JSON.stringify of every payload per update — keep off in production.
   */
  debug?: boolean;
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

function assertProtocolVersion(protocolVersion: number): void {
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `Protocol version mismatch: host=${protocolVersion}, plugin=${PROTOCOL_VERSION}`,
    );
  }
}

export function createPluginRuntime<T extends Transport<RPCMessage>>(
  options: PluginRuntimeOptions<T>,
  createChannel: (
    transport: T,
    expose: HostToPluginAPI,
  ) => RPCChannel<HostToPluginAPI, PluginToHostAPI>,
): PluginRuntime {
  const { App, transport, mode = "full", debug = false } = options;

  let bridge: RendererHandle | null = null;
  let currentElement: ReactElement | null = null;
  let handlerRegistry: HandlerRegistry | null = null;
  let mutationCollector: MutationCollector | null = null;
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

  function resetRuntimeState() {
    if (bridge) {
      // Unmount the previous root: without this a re-initialize (host
      // reconnect) leaked a live React tree whose effects kept running.
      unmount(bridge);
    }
    bridge = null;
    currentElement = null;
    mutationCollector = null;
    handlerRegistry?.clear();
    handlerRegistry = null;
    // The environment store is module-level, so on the main thread the next
    // plugin in this process would inherit this one's dark mode and accent
    // color. The host re-seeds it on initialize().
    resetHostEnvironment();
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

  const pluginAPI: HostToPluginAPI = {
    async initialize(req) {
      assertProtocolVersion(req.protocolVersion);
      resetRuntimeState();

      // Seed the environment BEFORE the first render, so a plugin that keys off
      // `useColorScheme()` doesn't paint a light tree, ship it to the host, and
      // then repaint dark a round trip later.
      if (req.env) setHostEnvironment(req.env);

      handlerRegistry = new HandlerRegistry();
      bridge = createRenderer();
      // React render/commit errors -> host reportError (previously they
      // only hit the worker/process console; the host showed stale UI
      // with no indication the plugin had crashed).
      bridge.onError = reportErrorToHost;

      if (mode === "incremental") {
        // Set up mutation collection
        mutationCollector = new MutationCollector(handlerRegistry);
        bridge.mutationCollector = mutationCollector;

        bridge.subscribeMutations((mutations: Mutation[]) => {
          if (!rpc) return;
          trackStats(mutations);
          rpc.getAPI().applyMutations(mutations);
        });

      } else {
        // Full tree mode (default)
        bridge.subscribe(() => {
          if (!bridge || !handlerRegistry || !rpc) return;

          const serializedTree = serializeTree(
            bridge.rootInstance,
            handlerRegistry,
          ) as UINode | null;

          trackStats(serializedTree);
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

    async setEnvironment(env) {
      // No render call here on purpose: the store notifies its subscribers, and
      // only the components that actually read `useColorScheme()` re-render.
      setHostEnvironment(env);
    },

    async executeHandler(handlerId, args) {
      if (!handlerRegistry) return;
      await handlerRegistry.execute(handlerId, ...args);
    },

    async syncTree() {
      if (!bridge || !handlerRegistry || !rpc) return;

      const serializedTree = serializeTree(
        bridge.rootInstance ?? null,
        handlerRegistry,
      ) as UINode | null;

      trackStats(serializedTree);
      rpc.getAPI().updateTree(serializedTree);
    },

    async destroy() {
      resetRuntimeState();
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
      // Full teardown: unmount the tree (effect cleanups) before dropping
      // the channel, so a stopped runtime leaves nothing running.
      resetRuntimeState();
      rpc?.destroy();
      rpc = null;
    },
  };
}
