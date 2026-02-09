import type { Component } from "solid-js";
import { createRoot } from "solid-js";
import type { RPCChannel, DestroyableIoInterface } from "kkrpc";
import type {
	JSONValue,
	UINode,
	HostToPluginAPI,
	PluginToHostAPI,
	Mutation,
} from "@uniview/protocol";
import {
	render,
	setUpdateCallback,
	setRootNode,
	getRootNode,
	serializeTree,
	HandlerRegistry,
	resetIdCounter,
	type SolidNode,
} from "@uniview/solid-renderer";

export interface SolidPluginRuntimeOptions<T extends DestroyableIoInterface> {
	App: Component<Record<string, unknown>>;
	io: T;
}

export interface SolidPluginRuntime {
	start(): Promise<void>;
	stop(): void;
}

export function createSolidPluginRuntime<T extends DestroyableIoInterface>(
	opts: SolidPluginRuntimeOptions<T>,
	createChannel: (
		io: T,
		expose: HostToPluginAPI,
	) => RPCChannel<HostToPluginAPI, PluginToHostAPI, T>,
): SolidPluginRuntime {
	const { App, io } = opts;

	let disposeRoot: (() => void) | null = null;
	let handlerRegistry: HandlerRegistry | null = null;
	let rpc: RPCChannel<HostToPluginAPI, PluginToHostAPI, T> | null = null;
	let isFirstRender = true;

	function resetState() {
		if (disposeRoot) {
			disposeRoot();
			disposeRoot = null;
		}
		handlerRegistry?.clear();
		handlerRegistry = null;
		setRootNode(null);
		isFirstRender = true;
	}

	function setupRuntime(props: Record<string, unknown>) {
		handlerRegistry = new HandlerRegistry();
		resetIdCounter();

		const rootNode: SolidNode = {
			_type: "element",
			id: "root",
			type: "div",
			props: {},
			children: [],
			parent: null,
		};
		setRootNode(rootNode);

		setUpdateCallback((mutations: Mutation[]) => {
			if (!handlerRegistry || !rpc) return;

			if (isFirstRender) {
				isFirstRender = false;
				const currentRoot = getRootNode();
				if (!currentRoot || currentRoot.children.length === 0) return;

				handlerRegistry.clear();
				const serializedTree = serializeTree(
					currentRoot.children[0],
					handlerRegistry,
				) as UINode | null;
				rpc.getAPI().updateTree(serializedTree);
			} else {
				rpc.getAPI().applyMutations(mutations);
			}
		});

		disposeRoot = createRoot((dispose) => {
			render(() => App(props), rootNode);
			return dispose;
		});
	}

	const pluginAPI: HostToPluginAPI = {
		async initialize(req) {
			resetState();
			setupRuntime((req.props ?? {}) as Record<string, unknown>);
		},

		async updateProps(props: JSONValue) {
			resetState();
			setupRuntime((props ?? {}) as Record<string, unknown>);
		},

		async executeHandler(handlerId, args) {
			if (!handlerRegistry) return;
			await handlerRegistry.execute(handlerId, ...args);
		},

		async destroy() {
			resetState();
			io.destroy();
		},
	};

	return {
		async start() {
			rpc = createChannel(io, pluginAPI);
		},
		stop() {
			io.destroy();
		},
	};
}
