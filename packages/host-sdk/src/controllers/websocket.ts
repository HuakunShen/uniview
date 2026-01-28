import { RPCChannel, WebSocketClientIO } from "kkrpc";
import type {
  UINode,
  JSONValue,
  HostToPluginAPI,
  PluginToHostAPI,
  HandlerId,
} from "@uniview/protocol";
import { PROTOCOL_VERSION } from "@uniview/protocol";
import type { PluginController, HostMode } from "../types";

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
  let tree: UINode | null = null;
  let connected = false;
  let lastError: string | undefined;
  const subscribers = new Set<(tree: UINode | null) => void>();

  const hostAPI: PluginToHostAPI = {
    updateTree(newTree: UINode | null) {
      console.log("[WS Host] Received updateTree:", newTree ? "tree" : "null");
      tree = newTree;
      subscribers.forEach((cb) => cb(tree));
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
        console.log("[WS Host] Connecting to:", url);
        io = new WebSocketClientIO({ url });
        console.log("[WS Host] WebSocketClientIO created");

        rpc = new RPCChannel<PluginToHostAPI, HostToPluginAPI>(io, {
          expose: hostAPI,
        });
        console.log(
          "[WS Host] RPC channel created with exposed methods:",
          Object.keys(hostAPI),
        );

        connected = true;
        lastError = undefined;

        console.log("[WS Host] Calling initialize...");
        const api = rpc.getAPI();
        console.log("[WS Host] Got API proxy, calling initialize method...");
        await api.initialize({
          protocolVersion: PROTOCOL_VERSION,
          props: initialProps,
        });
        console.log("[WS Host] Initialize complete!");
      } catch (err) {
        console.error("[WS Host] Connect error:", err);
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
      tree = null;
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
      return tree;
    },

    subscribe(cb: (tree: UINode | null) => void) {
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
