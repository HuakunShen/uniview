import type { Component } from "solid-js";
import { WorkerChildIO, RPCChannel } from "kkrpc/browser";
import type { HostToPluginAPI, PluginToHostAPI } from "@uniview/protocol";
import { createSolidPluginRuntime } from "./runtime";

export function startSolidWorkerPlugin(opts: {
  App: Component;
  updateMode?: "full" | "incremental";
}): void {
  const io = new WorkerChildIO();
  const runtime = createSolidPluginRuntime(
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
