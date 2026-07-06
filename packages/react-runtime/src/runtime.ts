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
  const { App, transport, mode = "full" } = options;

  let bridge: RendererHandle | null = null;
  let currentElement: ReactElement | null = null;
  let handlerRegistry: HandlerRegistry | null = null;
  let mutationCollector: MutationCollector | null = null;
  let rpc: RPCChannel<HostToPluginAPI, PluginToHostAPI> | null = null;

  // Stats tracking
  const stats: Stats = { bytesSent: 0, messagesSent: 0 };
  globalThis.__uniview_stats = stats;

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

  const pluginAPI: HostToPluginAPI = {
    async initialize(req) {
      assertProtocolVersion(req.protocolVersion);
      resetRuntimeState();

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

          // Track stats
          const bytes = JSON.stringify(mutations).length;
          stats.bytesSent += bytes;
          stats.messagesSent++;

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
      if (!bridge || !handlerRegistry || !rpc) return;

      const serializedTree = serializeTree(
        bridge.rootInstance ?? null,
        handlerRegistry,
      ) as UINode | null;

      const bytes = JSON.stringify(serializedTree).length;
      stats.bytesSent += bytes;
      stats.messagesSent++;

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
      globalTarget.addEventListener?.("error", onGlobalError);
      globalTarget.addEventListener?.("unhandledrejection", onUnhandledRejection);
    },
    stop() {
      globalTarget.removeEventListener?.("error", onGlobalError);
      globalTarget.removeEventListener?.("unhandledrejection", onUnhandledRejection);
      // Full teardown: unmount the tree (effect cleanups) before dropping
      // the channel, so a stopped runtime leaves nothing running.
      resetRuntimeState();
      rpc?.destroy();
      rpc = null;
    },
  };
}
