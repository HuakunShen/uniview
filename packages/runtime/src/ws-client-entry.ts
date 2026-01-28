import {
  createWebSocketPluginClient,
  type WebSocketPluginClientOptions,
} from "./ws-client";

export type ConnectToHostServerOptions = WebSocketPluginClientOptions;

export async function connectToHostServer(
  opts: ConnectToHostServerOptions,
): Promise<void> {
  createWebSocketPluginClient(opts);
}
