import type { JSONValue, UINode } from "./tree";
import type { HandlerId } from "./events";
import type { Mutation } from "./mutations";

export interface HostToPluginAPI {
	initialize(req: {
		protocolVersion: number;
		props?: JSONValue;
	}): Promise<void>;
	updateProps(props: JSONValue): Promise<void>;
	executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>;
	destroy(): Promise<void>;
}

export interface PluginToHostAPI {
	updateTree(tree: UINode | null): void;
	applyMutations(mutations: Mutation[]): void;
	log(level: "log" | "info" | "warn" | "error", args: JSONValue[]): void;
	reportError(err: { message: string; stack?: string }): void;
}

export interface UnviewRpcContract {
	hostToPlugin: HostToPluginAPI;
	pluginToHost: PluginToHostAPI;
}
