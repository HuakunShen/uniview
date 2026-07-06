import type { ComponentType } from "react";
import { RPCChannel } from "kkrpc";
import { webSocketTransport } from "kkrpc/ws";
import type {
  HostToPluginAPI,
  PluginToHostAPI,
  UpdateMode,
} from "@uniview/protocol";
import { createPluginRuntime, type PluginRuntime } from "./runtime";

export interface WebSocketPluginClientOptions {
  App: ComponentType<unknown>;
  serverUrl: string;
  pluginId: string;
  /** Update mode: "full" sends entire tree, "incremental" sends mutations */
  mode?: UpdateMode;
  /** Reconnection delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Max reconnection attempts (default: Infinity) */
  maxReconnectAttempts?: number;
  /** Enable benchmark stats (globalThis.__uniview_stats) */
  debug?: boolean;
}

export interface WebSocketPluginClient {
  close(): Promise<void>;
}

/**
 * Creates a WebSocket plugin client with automatic reconnection.
 *
 * Unlike Worker mode, WebSocket plugin clients are long-running processes
 * that need to handle connection drops gracefully. This wraps the shared
 * createPluginRuntime — the same implementation Worker mode uses — with a
 * reconnect loop; each (re)connection gets a fresh runtime and the old one
 * is fully stopped (tree unmounted) first.
 *
 * (Previously this file was a hand-copied fork of the runtime that had
 * drifted: incremental mode sent BOTH mutations and a full tree on every
 * commit, and reconnects leaked the old bridge subscriptions.)
 */
export function createWebSocketPluginClient(
  opts: WebSocketPluginClientOptions,
): WebSocketPluginClient {
  const {
    App,
    serverUrl,
    pluginId,
    mode = "full",
    reconnectDelay = 1000,
    maxReconnectAttempts = Infinity,
    debug = false,
  } = opts;

  const wsUrl = `${serverUrl}/plugins/${pluginId}`;
  let closed = false;
  let reconnectAttempts = 0;
  let runtime: PluginRuntime | null = null;

  function connect() {
    if (closed) return;

    console.log(`[Plugin:${pluginId}] Connecting to ${wsUrl}...`);

    const ws = new WebSocket(wsUrl);
    const transport = webSocketTransport(ws);

    ws.addEventListener("open", () => {
      console.log(`[Plugin:${pluginId}] Connected to bridge`);
      reconnectAttempts = 0;
    });

    ws.addEventListener("close", (event) => {
      if (closed) return;

      console.log(
        `[Plugin:${pluginId}] Connection closed (code: ${event.code}, reason: ${event.reason || "none"})`,
      );
      runtime?.stop();
      runtime = null;

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

    runtime = createPluginRuntime(
      { App, transport, mode, debug },
      (transportInstance, expose) =>
        new RPCChannel<HostToPluginAPI, PluginToHostAPI>(transportInstance, {
          expose,
        }),
    );
    void runtime.start();
  }

  connect();

  return {
    close: async () => {
      closed = true;
      runtime?.stop();
      runtime = null;
    },
  };
}
