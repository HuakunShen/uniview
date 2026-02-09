import type { ComponentType, ReactElement } from "react";
import { createElement } from "react";
import type { UINode, JSONValue, HandlerId } from "@uniview/protocol";
import type { PluginController, HostMode } from "../types";
import { MutableTree, type TreeUpdate } from "../mutable-tree";
import {
	createRenderBridge,
	render,
	serializeTree,
	HandlerRegistry,
} from "@uniview/react-renderer";

export interface MainControllerOptions {
	App: ComponentType<unknown>;
	initialProps?: JSONValue;
}

export function createMainController(
	opts: MainControllerOptions,
): PluginController {
	const { App, initialProps } = opts;

	let bridge: ReturnType<typeof createRenderBridge> | null = null;
	let currentElement: ReactElement | null = null;
	let handlerRegistry: HandlerRegistry | null = null;
	let mutableTree = new MutableTree();
	let connected = false;
	const subscribers = new Set<(update: TreeUpdate) => void>();

	return {
		async connect() {
			handlerRegistry = new HandlerRegistry();
			bridge = createRenderBridge();

			bridge.subscribe(() => {
				if (!bridge || !handlerRegistry) return;

				const tree = serializeTree(
					bridge.rootInstance,
					handlerRegistry,
				) as UINode | null;

				mutableTree.init(tree);
				subscribers.forEach((cb) => cb({ type: "full", tree }));
			});

			currentElement = createElement(App, (initialProps ?? {}) as object);
			render(currentElement, bridge);
			connected = true;
		},

		async disconnect() {
			bridge = null;
			currentElement = null;
			handlerRegistry?.clear();
			handlerRegistry = null;
			connected = false;
			mutableTree = new MutableTree();
		},

		async updateProps(props: JSONValue) {
			if (!bridge || !currentElement) return;

			const newElement = createElement(
				(currentElement as unknown as { type: ComponentType<unknown> }).type,
				(props ?? {}) as object,
			);
			currentElement = newElement;
			render(newElement, bridge);
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
			if (!handlerRegistry) return;
			await handlerRegistry.execute(handlerId, ...(args ?? []));
		},

		getStatus(): { mode: HostMode; connected: boolean; lastError?: string } {
			return {
				mode: "main",
				connected,
			};
		},
	};
}
