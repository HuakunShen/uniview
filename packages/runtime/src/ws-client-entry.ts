export {
  createWebSocketPluginClient,
  type WebSocketPluginClientOptions,
  type WebSocketPluginClient,
} from "./ws-client";

import type { WebSocketPluginClientOptions } from "./ws-client";
export type ConnectToHostServerOptions = WebSocketPluginClientOptions;

export async function connectToHostServer(
  opts: ConnectToHostServerOptions,
): Promise<void> {
  const { createWebSocketPluginClient } = await import("./ws-client");
  createWebSocketPluginClient(opts);
}
