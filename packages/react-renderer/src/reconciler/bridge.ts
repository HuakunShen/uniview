import type { InternalNode } from "./types";
import type { Mutation } from "@uniview/protocol";

export type UpdateCallback = (type: "full", root: InternalNode | null) => void;
export type MutationCallback = (type: "mutations", mutations: Mutation[]) => void;

export interface RenderBridge {
	rootInstance: InternalNode | null;
	subscribers: Set<UpdateCallback | MutationCallback>;
	subscribe: (callback: UpdateCallback | MutationCallback) => () => void;
	update: () => void;
	applyMutations: (mutations: Mutation[]) => void;
}

export function createRenderBridge(): RenderBridge {
	const bridge: RenderBridge = {
		rootInstance: null,
		subscribers: new Set(),

		subscribe(callback: UpdateCallback | MutationCallback) {
			bridge.subscribers.add(callback);
			return () => {
				bridge.subscribers.delete(callback);
			};
		},

		update() {
			bridge.subscribers.forEach((callback) =>
				(callback as UpdateCallback)("full", bridge.rootInstance),
			);
		},

		applyMutations(mutations: Mutation[]) {
			bridge.subscribers.forEach((callback) =>
				(callback as MutationCallback)("mutations", mutations),
			);
		},
	};

	return bridge;
}
