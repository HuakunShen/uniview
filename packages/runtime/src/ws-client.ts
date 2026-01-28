import type { ComponentType } from "react";
import { ElysiaWebSocketClientIO, RPCChannel } from "kkrpc";
import type { HostToPluginAPI, PluginToHostAPI } from "@uniview/protocol";
import { createPluginRuntime } from "./runtime";

export interface WebSocketPluginClientOptions {
  App: ComponentType<unknown>;
  serverUrl: string;
  pluginId: string;
}

export interface WebSocketPluginClient {
  close(): Promise<void>;
}

export function createWebSocketPluginClient(
  opts: WebSocketPluginClientOptions,
): WebSocketPluginClient {
  const { App, serverUrl, pluginId } = opts;
  const wsUrl = `${serverUrl}/plugins/${pluginId}`;
  const io = new ElysiaWebSocketClientIO(wsUrl);

  const runtime = createPluginRuntime({ App, io }, (ioInstance, expose) => {
    return new RPCChannel<HostToPluginAPI, PluginToHostAPI, typeof ioInstance>(
      ioInstance,
      { expose },
    );
  });

  runtime.start();

  return {
    close: () =>
      new Promise((resolve) => {
        io.destroy();
        resolve();
      }),
  };
}
