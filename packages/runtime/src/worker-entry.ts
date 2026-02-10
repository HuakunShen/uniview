import type { ComponentType } from "react";
import { WorkerChildIO, RPCChannel } from "kkrpc";
import type { HostToPluginAPI, PluginToHostAPI } from "@uniview/protocol";
import { createPluginRuntime } from "./runtime";

export function startWorkerPlugin(opts: {
  App: ComponentType<unknown>;
  updateMode?: "full" | "incremental";
}): void {
  const io = new WorkerChildIO();
  const runtime = createPluginRuntime(
    { App: opts.App, io, updateMode: opts.updateMode },
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
