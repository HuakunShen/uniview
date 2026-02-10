import { RPCChannel, WebSocketClientIO } from "kkrpc/browser";
import type {
	UINode,
	JSONValue,
	HostToPluginAPI,
	PluginToHostAPI,
	HandlerId,
	Mutation,
} from "@uniview/protocol";
import { PROTOCOL_VERSION } from "@uniview/protocol";
import type { PluginController, HostMode } from "../types";
import { MutableTree, type TreeUpdate } from "../mutable-tree";

export interface WebSocketControllerOptions {
	serverUrl: string;
	pluginId: string;
	initialProps?: JSONValue;
}

export function createWebSocketController(
	opts: WebSocketControllerOptions,
): PluginController {
	const { serverUrl, pluginId, initialProps } = opts;

	let io: WebSocketClientIO | null = null;
	let rpc: RPCChannel<PluginToHostAPI, HostToPluginAPI> | null = null;
	let mutableTree = new MutableTree();
	let connected = false;
	let lastError: string | undefined;
	const subscribers = new Set<(update: TreeUpdate) => void>();

	const hostAPI: PluginToHostAPI = {
		updateTree(newTree: UINode | null) {
			mutableTree.init(newTree);
			subscribers.forEach((cb) => cb({ type: "full", tree: newTree }));
		},
		applyMutations(mutations: Mutation[]) {
			mutableTree.apply(mutations);
			subscribers.forEach((cb) =>
				cb({ type: "mutations", mutations }),
			);
		},
		log(level, args) {
			console[level]("[Plugin WS]", ...args);
		},
		reportError(err) {
			lastError = err.message;
			console.error("[Plugin WS Error]", err.message, err.stack);
		},
	};

	return {
		async connect() {
			try {
				const url = `${serverUrl}/host/${pluginId}`;
				io = new WebSocketClientIO({ url });

				rpc = new RPCChannel<PluginToHostAPI, HostToPluginAPI>(io, {
					expose: hostAPI,
				});

				connected = true;
				lastError = undefined;

				const api = rpc.getAPI();
				await api.initialize({
					protocolVersion: PROTOCOL_VERSION,
					props: initialProps,
				});
			} catch (err) {
				lastError = err instanceof Error ? err.message : String(err);
				connected = false;
				throw err;
			}
		},

		async disconnect() {
			if (rpc) {
				try {
					const api = rpc.getAPI();
					await api.destroy();
				} catch {}
			}
			if (io) {
				io.destroy();
				io = null;
			}
			rpc = null;
			connected = false;
			mutableTree = new MutableTree();
		},

		async updateProps(props: JSONValue) {
			if (!rpc) return;
			const api = rpc.getAPI();
			await api.updateProps(props);
		},

		async reload() {
			await this.disconnect();
			await this.connect();
		},

		getTree() {
			return mutableTree.getRoot();
		},

		subscribe(cb: (update: TreeUpdate) => void) {
			subscribers.add(cb);
			return () => {
				subscribers.delete(cb);
			};
		},

		async execute(handlerId: HandlerId, args?: JSONValue[]) {
			if (!rpc) return;
			const api = rpc.getAPI();
			await api.executeHandler(handlerId, args ?? []);
		},

		getStatus(): { mode: HostMode; connected: boolean; lastError?: string } {
			return {
				mode: "websocket",
				connected,
				lastError,
			};
		},
	};
}
