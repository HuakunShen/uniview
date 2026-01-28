import type { ComponentType } from "react";
import { createWebSocketPluginClient } from "./ws-client";

export interface ConnectToHostServerOptions {
  App: ComponentType<unknown>;
  serverUrl: string;
  pluginId: string;
}

export async function connectToHostServer(
  opts: ConnectToHostServerOptions,
): Promise<void> {
  createWebSocketPluginClient(opts);
}
