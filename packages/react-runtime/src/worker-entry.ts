import type { ComponentType } from "react";
import { WorkerChildIO, RPCChannel } from "kkrpc";
import type { HostToPluginAPI, PluginToHostAPI, UpdateMode } from "@uniview/protocol";
import { createPluginRuntime } from "./runtime";

export interface StartWorkerPluginOptions {
  App: ComponentType<unknown>;
  mode?: UpdateMode;
}

export function startWorkerPlugin(opts: StartWorkerPluginOptions): void {
  const io = new WorkerChildIO();
  const runtime = createPluginRuntime(
    { App: opts.App, io, mode: opts.mode },
    (ioInstance, expose) => {
      return new RPCChannel<
        HostToPluginAPI,
        PluginToHostAPI,
        typeof ioInstance
      >(ioInstance, { expose });
    },
  );
  runtime.start();
}
