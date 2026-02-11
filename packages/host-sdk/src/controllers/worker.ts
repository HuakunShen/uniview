import { RPCChannel, WorkerParentIO } from "kkrpc/browser";
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
import { MutableTree } from "../mutable-tree";

export interface WorkerControllerOptions {
  pluginUrl: string;
  initialProps?: JSONValue;
}

export function createWorkerController(
  opts: WorkerControllerOptions,
): PluginController {
  const { pluginUrl, initialProps } = opts;

  let worker: Worker | null = null;
  let rpc: RPCChannel<PluginToHostAPI, HostToPluginAPI> | null = null;
  let tree: UINode | null = null;
  let mutableTree = new MutableTree();
  let connected = false;
  let lastError: string | undefined;
  const subscribers = new Set<(tree: UINode | null) => void>();

  const hostAPI: PluginToHostAPI = {
    updateTree(newTree: UINode | null) {
      tree = newTree;
      mutableTree.init(newTree);
      subscribers.forEach((cb) => void cb(tree));
    },
    applyMutations(mutations: Mutation[]) {
      tree = mutableTree.applyMutations(mutations);
      subscribers.forEach((cb) => void cb(tree));
    },
    log(level, args) {
      console[level]("[Plugin]", ...args);
    },
    reportError(err) {
      lastError = err.message;
      console.error("[Plugin Error]", err.message, err.stack);
    },
  };

  return {
    async connect() {
      const response = await fetch(pluginUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch plugin: ${response.status} ${response.statusText}`,
        );
      }

      const scriptText = await response.text();
      const blob = new Blob([scriptText], { type: "application/javascript" });
      const blobURL = URL.createObjectURL(blob);

      worker = new Worker(blobURL, { type: "module" });
      URL.revokeObjectURL(blobURL);

      const io = new WorkerParentIO(worker);
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
    },

    async disconnect() {
      if (rpc) {
        try {
          const api = rpc.getAPI();
          await api.destroy();
        } catch {}
      }
      if (worker) {
        worker.terminate();
        worker = null;
      }
      rpc = null;
      connected = false;
      tree = null;
      mutableTree = new MutableTree();
    },

    async destroy() {
      await this.disconnect();
    },

    async updateProps(props: JSONValue) {
      if (!rpc) return;
      const api = rpc.getAPI();
      await api.updateProps(props);
    },

    /**
     * Request plugin to send current full tree
     * Used for recovery from drift or explicit sync request
     */
    async syncTree(): Promise<void> {
      if (!connected || !rpc) return;

      const api = rpc.getAPI();
      await api.syncTree();
    },

    /**
     * Get current status
     */
    getTree() {
      return tree;
    },

    subscribe(cb: (tree: UINode | null) => void) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },

    async executeHandler(handlerId: HandlerId, args?: JSONValue[]) {
      if (!rpc) return;
      const api = rpc.getAPI();
      await api.executeHandler(handlerId, args ?? []);
    },

    getStatus(): { mode: HostMode; connected: boolean; lastError?: string } {
      return {
        mode: "worker",
        connected,
        lastError,
      };
    },
  };
}
