/**
 * WebSocket bridge: pairs one plugin connection with one host connection
 * per pluginId and forwards messages transparently (kkrpc protocol).
 *
 * Built directly on Bun.serve for protocol-level ping/pong access:
 * - Heartbeat: sockets that miss pongs past the timeout are terminated,
 *   so half-open TCP connections can't linger for hours serving a ghost
 *   UI (there was previously no keepalive at all).
 * - Late plugins: hosts used to be rejected instantly ("Plugin not
 *   ready") and — worse — a host's initialize() sent before its plugin
 *   registered was silently dropped, hanging the host forever even after
 *   the plugin arrived. Hosts now wait a bounded time and their messages
 *   are buffered and flushed when the plugin connects.
 */
import { readFile } from "fs/promises";
import { join } from "path";
import type { Server, ServerWebSocket } from "bun";

interface SocketData {
  role: "plugin" | "host";
  pluginId: string;
  lastPong: number;
}

interface Connection {
  pluginWs?: ServerWebSocket<SocketData>;
  hostWs?: ServerWebSocket<SocketData>;
  /** Host->plugin messages buffered while the plugin is not yet connected */
  pendingHostMessages: string[];
  hostWaitTimer?: ReturnType<typeof setTimeout>;
}

export interface BridgeServerOptions {
  port: number;
  /** URL prefix -> directory of plugin bundles, e.g. { react: ".../dist" } */
  pluginDirs?: Record<string, string>;
  /** Interval between protocol pings (default 30s) */
  heartbeatIntervalMs?: number;
  /** Terminate a socket if no pong within this window (default 75s) */
  heartbeatTimeoutMs?: number;
  /** How long a host may wait for its plugin before being closed (default 15s) */
  hostWaitMs?: number;
  /** Cap on buffered host messages while the plugin is absent (default 200) */
  maxBufferedHostMessages?: number;
  quiet?: boolean;
}

export interface BridgeServer {
  server: Server;
  port: number;
  stop(): void;
}

function normalizeMessage(message: string | Buffer | Uint8Array): string {
  let msgStr =
    typeof message === "string" ? message : Buffer.from(message).toString();
  if (!msgStr.endsWith("\n")) msgStr += "\n";
  return msgStr;
}

export function createBridgeServer(opts: BridgeServerOptions): BridgeServer {
  const {
    port,
    pluginDirs = {},
    heartbeatIntervalMs = 30_000,
    heartbeatTimeoutMs = 75_000,
    hostWaitMs = 15_000,
    maxBufferedHostMessages = 200,
    quiet = false,
  } = opts;

  const connections = new Map<string, Connection>();
  const log = quiet ? () => {} : console.log;

  function getConnection(pluginId: string): Connection {
    let conn = connections.get(pluginId);
    if (!conn) {
      conn = { pendingHostMessages: [] };
      connections.set(pluginId, conn);
    }
    return conn;
  }

  function cleanupConnection(pluginId: string): void {
    const conn = connections.get(pluginId);
    if (conn && !conn.pluginWs && !conn.hostWs) {
      if (conn.hostWaitTimer) clearTimeout(conn.hostWaitTimer);
      connections.delete(pluginId);
    }
  }

  async function serveFile(dir: string, filename: string): Promise<Response> {
    try {
      const content = await readFile(join(dir, filename));
      return new Response(new Uint8Array(content), {
        headers: {
          "Content-Type": "application/javascript",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  const server = Bun.serve<SocketData, Record<string, never>>({
    port,
    async fetch(req, srv) {
      const url = new URL(req.url);
      const segments = url.pathname.split("/").filter(Boolean);

      if (segments.length === 2) {
        const [head, tail] = segments as [string, string];

        if (head === "plugins" || head === "host") {
          const upgraded = srv.upgrade(req, {
            data: {
              role: head === "plugins" ? ("plugin" as const) : ("host" as const),
              pluginId: tail,
              lastPong: Date.now(),
            },
          });
          if (upgraded) return undefined as unknown as Response;
          return new Response("WebSocket upgrade required", { status: 426 });
        }

        const dir = pluginDirs[head];
        if (dir) {
          return serveFile(dir, tail);
        }
      }

      return new Response("Not found", { status: 404 });
    },

    websocket: {
      open(ws) {
        const { role, pluginId } = ws.data;
        const conn = getConnection(pluginId);

        if (role === "plugin") {
          if (conn.pluginWs) {
            log(`[Bridge] Replacing existing plugin connection: ${pluginId}`);
            conn.pluginWs.close(1000, "Replaced by new connection");
          }
          conn.pluginWs = ws;
          log(`[Bridge] Plugin connected: ${pluginId}`);

          // A host may already be waiting — flush what it sent so far.
          if (conn.hostWaitTimer) {
            clearTimeout(conn.hostWaitTimer);
            conn.hostWaitTimer = undefined;
          }
          if (conn.pendingHostMessages.length > 0) {
            log(
              `[Bridge] Flushing ${conn.pendingHostMessages.length} buffered host message(s): ${pluginId}`,
            );
            for (const msg of conn.pendingHostMessages) {
              ws.send(msg);
            }
            conn.pendingHostMessages = [];
          }
          return;
        }

        // role === "host"
        if (conn.hostWs) {
          log(`[Bridge] Replacing existing host connection: ${pluginId}`);
          conn.hostWs.close(1000, "Replaced by new connection");
        }
        conn.hostWs = ws;
        log(`[Bridge] Host connected: ${pluginId}`);

        if (!conn.pluginWs) {
          // Bounded wait for the plugin instead of rejecting instantly.
          log(`[Bridge] Host waiting for plugin (${hostWaitMs}ms): ${pluginId}`);
          conn.hostWaitTimer = setTimeout(() => {
            conn.hostWaitTimer = undefined;
            if (!conn.pluginWs && conn.hostWs === ws) {
              ws.close(1013, "Plugin not available");
            }
          }, hostWaitMs);
        }
      },

      message(ws, message) {
        const { role, pluginId } = ws.data;
        const conn = connections.get(pluginId);
        if (!conn) return;

        if (role === "plugin") {
          if (conn.hostWs) {
            conn.hostWs.send(normalizeMessage(message));
          }
          return;
        }

        // host -> plugin
        if (conn.pluginWs) {
          conn.pluginWs.send(normalizeMessage(message));
          return;
        }
        // Plugin not here yet — buffer (bounded) so initialize() isn't lost.
        if (conn.pendingHostMessages.length >= maxBufferedHostMessages) {
          ws.close(1013, "Plugin not available (buffer overflow)");
          return;
        }
        conn.pendingHostMessages.push(normalizeMessage(message));
      },

      close(ws) {
        const { role, pluginId } = ws.data;
        const conn = connections.get(pluginId);
        if (!conn) return;

        if (role === "plugin" && conn.pluginWs === ws) {
          conn.pluginWs = undefined;
          log(`[Bridge] Plugin disconnected: ${pluginId}`);
        } else if (role === "host" && conn.hostWs === ws) {
          conn.hostWs = undefined;
          conn.pendingHostMessages = [];
          if (conn.hostWaitTimer) {
            clearTimeout(conn.hostWaitTimer);
            conn.hostWaitTimer = undefined;
          }
          log(`[Bridge] Host disconnected: ${pluginId}`);
        }
        cleanupConnection(pluginId);
      },

      pong(ws) {
        ws.data.lastPong = Date.now();
      },
    },
  });

  // Heartbeat: ping every socket; terminate the ones that stopped ponging.
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const conn of connections.values()) {
      for (const ws of [conn.pluginWs, conn.hostWs]) {
        if (!ws) continue;
        if (now - ws.data.lastPong > heartbeatTimeoutMs) {
          log(
            `[Bridge] Terminating unresponsive ${ws.data.role}: ${ws.data.pluginId}`,
          );
          ws.terminate();
        } else {
          ws.ping();
        }
      }
    }
  }, heartbeatIntervalMs);

  return {
    server,
    port: server.port ?? port,
    stop() {
      clearInterval(heartbeat);
      for (const conn of connections.values()) {
        if (conn.hostWaitTimer) clearTimeout(conn.hostWaitTimer);
        conn.pluginWs?.close(1001, "Bridge shutting down");
        conn.hostWs?.close(1001, "Bridge shutting down");
      }
      connections.clear();
      server.stop(true);
    },
  };
}
