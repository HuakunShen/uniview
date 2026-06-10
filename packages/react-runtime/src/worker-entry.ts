import type { ComponentType } from "react";
import { RPCChannel } from "kkrpc";
import { workerSelfTransport } from "kkrpc/worker";
import type { HostToPluginAPI, PluginToHostAPI, UpdateMode } from "@uniview/protocol";
import { createPluginRuntime } from "./runtime";

export interface StartWorkerPluginOptions {
  App: ComponentType<unknown>;
  mode?: UpdateMode;
}

export function startWorkerPlugin(opts: StartWorkerPluginOptions): void {
  const transport = workerSelfTransport();
  const runtime = createPluginRuntime(
    { App: opts.App, transport, mode: opts.mode },
    (transportInstance, expose) => {
      return new RPCChannel<HostToPluginAPI, PluginToHostAPI>(
        transportInstance,
        { expose },
      );
    },
  );
  runtime.start();
}
