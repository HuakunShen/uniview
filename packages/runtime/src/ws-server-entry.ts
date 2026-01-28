import type { ComponentType } from "react";
import type { Server as HTTPServer } from "node:http";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { WebSocketServerIO, RPCChannel } from "kkrpc";
import type { HostToPluginAPI, PluginToHostAPI } from "@uniview/protocol";
import { createPluginRuntime } from "./runtime";

export interface WebSocketPluginServerOptions {
  App: ComponentType<unknown>;
  port: number;
}

export interface WebSocketPluginServer {
  close(): Promise<void>;
}

/**
 * @deprecated Use `connectToHostServer` from `@uniview/runtime/ws-client` instead.
 * This server mode will be removed in a future version.
 * See the Bridge architecture for the recommended approach.
 */
export function startWebSocketPluginServer(
  opts: WebSocketPluginServerOptions,
): WebSocketPluginServer {
  const { App, port } = opts;

  const httpServer: HTTPServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });

  console.log(`[WS Server] Starting on port ${port}`);

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WS Server] New connection established");

    // Cast is needed because kkrpc expects browser WebSocket type
    const io = new WebSocketServerIO(ws as unknown as globalThis.WebSocket);

    const runtime = createPluginRuntime({ App, io }, (ioInstance, expose) => {
      const channel = new RPCChannel<
        HostToPluginAPI,
        PluginToHostAPI,
        typeof ioInstance
      >(ioInstance, { expose });
      return channel;
    });

    runtime.start();
    console.log("[WS Server] Plugin runtime started");

    ws.on("close", () => {
      console.log("[WS Server] Connection closed");
      runtime.stop();
    });

    ws.on("error", (err: Error) => {
      console.error("[WS Server] WebSocket error:", err);
    });
  });

  httpServer.listen(port, () => {
    console.log(`[WS Server] Listening on ws://localhost:${port}`);
  });

  return {
    close: () =>
      new Promise((resolve) => {
        wss.close(() => {
          httpServer.close(() => {
            resolve();
          });
        });
      }),
  };
}
