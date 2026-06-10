import { RPCChannel } from "kkrpc";
import type { RPCMessage, Transport } from "kkrpc";
import { webSocketClientTransport } from "kkrpc/ws";
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

export interface WebSocketControllerOptions {
  serverUrl: string;
  pluginId: string;
  initialProps?: JSONValue;
}

export function createWebSocketController(
  opts: WebSocketControllerOptions,
): PluginController {
  const { serverUrl, pluginId, initialProps } = opts;

  let transport: Transport<RPCMessage> | null = null;
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
        transport = webSocketClientTransport({ url });

        rpc = new RPCChannel<PluginToHostAPI, HostToPluginAPI>(transport, {
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
        console.error("[WS Host] Connection failed:", err);
        throw err;
      }
    },

    async disconnect() {
      if (rpc) {
        try {
          const api = rpc.getAPI();
          await api.destroy();
        } catch {}
        rpc.destroy();
      }
      rpc = null;
      transport = null;
      connected = false;
      tree = null;
      mutableTree = new MutableTree();
    },

    async updateProps(props: JSONValue) {
      if (!rpc) return;
      const api = rpc.getAPI();
      await api.updateProps(props);
    },

    async executeHandler(handlerId: HandlerId, args?: JSONValue[]) {
      if (!rpc) return;
      const api = rpc.getAPI();
      await api.executeHandler(handlerId, args ?? []);
    },

    async destroy() {
      await this.disconnect();
    },

    async syncTree(): Promise<void> {
      if (!connected || !rpc) return;

      const api = rpc.getAPI();
      await api.syncTree();
    },

    getTree() {
      return tree;
    },

    subscribe(cb: (tree: UINode | null) => void): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
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
