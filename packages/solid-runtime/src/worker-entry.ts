import type { Component } from "solid-js";
import { WorkerChildIO, RPCChannel } from "kkrpc";
import type { HostToPluginAPI, PluginToHostAPI } from "@uniview/protocol";
import { createSolidPluginRuntime } from "./runtime";

export function startSolidWorkerPlugin(opts: { App: Component }): void {
	const io = new WorkerChildIO();
	const runtime = createSolidPluginRuntime(
		{ App: opts.App, io },
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
