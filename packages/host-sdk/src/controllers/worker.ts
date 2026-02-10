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
import { MutableTree, type TreeUpdate } from "../mutable-tree";

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
      subscribers.forEach((cb) => cb({ type: "mutations", mutations }));
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

      worker.onerror = (e) => {
        console.error("[Worker Error]", e.message, e);
        lastError = e.message;
      };

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
        mode: "worker",
        connected,
        lastError,
      };
    },
  };
}
