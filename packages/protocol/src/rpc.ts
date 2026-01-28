import type { JSONValue, UINode } from "./tree";
import type { HandlerId } from "./events";

/**
 * API that the host exposes to the plugin
 * The plugin calls these methods to communicate with the host
 */
export interface HostToPluginAPI {
  /**
   * Initialize the plugin with the given props
   * Host should call this after establishing connection
   */
  initialize(req: {
    protocolVersion: number;
    props?: JSONValue;
  }): Promise<void>;

  /**
   * Update the plugin's props
   * Triggers a re-render in the plugin
   */
  updateProps(props: JSONValue): Promise<void>;

  /**
   * Execute an event handler in the plugin
   * Called when user interacts with the host UI
   */
  executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>;

  /**
   * Destroy the plugin and clean up resources
   */
  destroy(): Promise<void>;
}

/**
 * API that the plugin exposes to the host
 * The host receives these calls from the plugin
 */
export interface PluginToHostAPI {
  /**
   * Update the UI tree
   * Called after every React render in the plugin
   */
  updateTree(tree: UINode | null): void;

  /**
   * Log a message from the plugin
   * Allows plugins to write to host console
   */
  log(level: "log" | "info" | "warn" | "error", args: JSONValue[]): void;

  /**
   * Report an error from the plugin
   * For uncaught exceptions and critical errors
   */
  reportError(err: { message: string; stack?: string }): void;
}

/**
 * Combined RPC contract for both directions
 */
export interface UnviewRpcContract {
  hostToPlugin: HostToPluginAPI;
  pluginToHost: PluginToHostAPI;
}
