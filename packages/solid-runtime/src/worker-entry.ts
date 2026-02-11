import type { Component } from "solid-js";
import { WorkerChildIO, RPCChannel } from "kkrpc";
import type { HostToPluginAPI, PluginToHostAPI, UpdateMode } from "@uniview/protocol";
import { createSolidPluginRuntime } from "./runtime";

export interface StartSolidWorkerPluginOptions {
	App: Component;
	mode?: UpdateMode;
}

export function startSolidWorkerPlugin(opts: StartSolidWorkerPluginOptions): void {
	const io = new WorkerChildIO();
	const runtime = createSolidPluginRuntime(
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
