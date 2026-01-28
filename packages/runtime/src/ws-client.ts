import type { ComponentType, ReactElement } from "react";
import { createElement } from "react";
import { ElysiaWebSocketClientIO, RPCChannel } from "kkrpc";
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

export interface WebSocketPluginClientOptions {
  App: ComponentType<unknown>;
  serverUrl: string;
  pluginId: string;
  /** Reconnection delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Max reconnection attempts (default: Infinity) */
  maxReconnectAttempts?: number;
}

export interface WebSocketPluginClient {
  close(): Promise<void>;
}

interface RendererHandle extends RenderBridge {
  _container?: unknown;
}

/**
 * Creates a WebSocket plugin client with automatic reconnection.
 *
 * Unlike Worker mode, WebSocket plugin clients are long-running processes
 * that need to handle connection drops gracefully. This implementation:
 *
 * 1. Connects to the bridge server
 * 2. Waits for host to connect and call initialize()
 * 3. If connection drops, automatically reconnects
 * 4. State resets on each new connection (host re-initializes)
 */
export function createWebSocketPluginClient(
  opts: WebSocketPluginClientOptions,
): WebSocketPluginClient {
  const {
    App,
    serverUrl,
    pluginId,
    reconnectDelay = 1000,
    maxReconnectAttempts = Infinity,
  } = opts;

  const wsUrl = `${serverUrl}/plugins/${pluginId}`;
  let closed = false;
  let reconnectAttempts = 0;
  let currentIo: ElysiaWebSocketClientIO | null = null;
  let currentRpc: RPCChannel<
    HostToPluginAPI,
    PluginToHostAPI,
    ElysiaWebSocketClientIO
  > | null = null;

  let bridge: RendererHandle | null = null;
  let currentElement: ReactElement | null = null;
  let handlerRegistry: HandlerRegistry | null = null;

  function resetRuntimeState() {
    bridge = null;
    currentElement = null;
    handlerRegistry?.clear();
    handlerRegistry = null;
  }

  function createPluginAPI(): HostToPluginAPI {
    return {
      async initialize(req) {
        resetRuntimeState();

        handlerRegistry = new HandlerRegistry();
        bridge = createRenderer();

        bridge.subscribe(() => {
          if (!bridge || !handlerRegistry || !currentRpc) return;

          const serializedTree = serializeTree(
            bridge.rootInstance,
            handlerRegistry,
          ) as UINode | null;

          currentRpc.getAPI().updateTree(serializedTree);
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
        resetRuntimeState();
      },
    };
  }

  function connect() {
    if (closed) return;

    console.log(`[Plugin:${pluginId}] Connecting to ${wsUrl}...`);

    const io = new ElysiaWebSocketClientIO(wsUrl);
    currentIo = io;

    const ws = (io as unknown as { ws: WebSocket }).ws;

    ws.addEventListener("open", () => {
      console.log(`[Plugin:${pluginId}] Connected to bridge`);
      reconnectAttempts = 0;
    });

    ws.addEventListener("close", (event) => {
      if (closed) return;

      console.log(
        `[Plugin:${pluginId}] Connection closed (code: ${event.code}, reason: ${event.reason || "none"})`,
      );
      resetRuntimeState();
      currentIo = null;
      currentRpc = null;

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(
          `[Plugin:${pluginId}] Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttempts})...`,
        );
        setTimeout(connect, reconnectDelay);
      } else {
        console.log(
          `[Plugin:${pluginId}] Max reconnection attempts reached, giving up`,
        );
      }
    });

    ws.addEventListener("error", (error) => {
      console.error(`[Plugin:${pluginId}] WebSocket error:`, error);
    });

    currentRpc = new RPCChannel<
      HostToPluginAPI,
      PluginToHostAPI,
      ElysiaWebSocketClientIO
    >(io, { expose: createPluginAPI() });
  }

  connect();

  return {
    close: () =>
      new Promise((resolve) => {
        closed = true;
        resetRuntimeState();
        currentIo?.destroy();
        currentIo = null;
        currentRpc = null;
        resolve();
      }),
  };
}
