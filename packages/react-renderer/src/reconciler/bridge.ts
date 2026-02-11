import type { Mutation } from "@uniview/protocol";
import type { InternalNode } from "./types";
import type { MutationCollector } from "../mutation/mutation-collector";

export interface RenderBridge {
  rootInstance: InternalNode | null;
  subscribers: Set<() => void>;
  mutationCollector: MutationCollector | null;
  mutationSubscribers: Set<(mutations: Mutation[]) => void>;
  subscribe: (callback: () => void) => () => void;
  subscribeMutations: (callback: (mutations: Mutation[]) => void) => () => void;
  update: () => void;
}

export function createRenderBridge(): RenderBridge {
  const bridge: RenderBridge = {
    rootInstance: null,
    subscribers: new Set(),
    mutationCollector: null,
    mutationSubscribers: new Set(),

    subscribe(callback: () => void) {
      bridge.subscribers.add(callback);
      return () => {
        bridge.subscribers.delete(callback);
      };
    },

    subscribeMutations(callback: (mutations: Mutation[]) => void) {
      bridge.mutationSubscribers.add(callback);
      return () => {
        bridge.mutationSubscribers.delete(callback);
      };
    },

    update() {
      bridge.subscribers.forEach((callback) => callback());
    },
  };

  return bridge;
}
