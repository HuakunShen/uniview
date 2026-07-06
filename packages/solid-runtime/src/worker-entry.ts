import type { Component } from "solid-js";
import { RPCChannel } from "kkrpc";
import { workerSelfTransport } from "kkrpc/worker";
import type { HostToPluginAPI, PluginToHostAPI, UpdateMode } from "@uniview/protocol";
import { createSolidPluginRuntime } from "./runtime";

export interface StartSolidWorkerPluginOptions {
	App: Component;
	mode?: UpdateMode;
	/** Enable benchmark stats (globalThis.__uniview_stats) */
	debug?: boolean
}

export function startSolidWorkerPlugin(opts: StartSolidWorkerPluginOptions): void {
	const transport = workerSelfTransport();
	const runtime = createSolidPluginRuntime(
		{ App: opts.App, transport, mode: opts.mode, debug: opts.debug },
		(transportInstance, expose) => {
			return new RPCChannel<HostToPluginAPI, PluginToHostAPI>(
				transportInstance,
				{ expose },
			);
		},
	);
	runtime.start();
}
