import type { InternalNode } from "./types";

export interface RenderBridge {
  rootInstance: InternalNode | null;
  subscribers: Set<() => void>;
  subscribe: (callback: () => void) => () => void;
  update: () => void;
}

export function createRenderBridge(): RenderBridge {
  const bridge: RenderBridge = {
    rootInstance: null,
    subscribers: new Set(),

    subscribe(callback: () => void) {
      bridge.subscribers.add(callback);
      return () => {
        bridge.subscribers.delete(callback);
      };
    },

    update() {
      bridge.subscribers.forEach((callback) => callback());
    },
  };

  return bridge;
}
