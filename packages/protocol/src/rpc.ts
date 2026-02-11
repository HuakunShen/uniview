import type { JSONValue, UINode } from "./tree";
import type { HandlerId } from "./events";
import type { Mutation } from "./mutations";

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

  /**
   * Update a single list item for benchmarking
   * Designed for testing incremental mode efficiency
   * Triggers setText mutation on specific child by itemId
   */
  updateItem(itemId: string, text: string): Promise<void>;

  /**
   * Request plugin to send current full tree
   * Used for recovery from drift or explicit sync request
   */
  syncTree(): Promise<void>;
}

/**
 * API that the plugin exposes to the host
 * The host receives these calls from the plugin
 */
export interface PluginToHostAPI {
  /**
   * Update UI tree
   * Called after every React render in plugin
   * Used in "full" update mode (default, backward compatible)
   */
  updateTree(tree: UINode | null): void;

  /**
   * Apply incremental mutations to the UI tree
   * Called after every render in "incremental" update mode
   * More efficient than updateTree for large trees with small changes
   */
  applyMutations(mutations: Mutation[]): void;

  /**
   * Log a message from the plugin
   * Allows plugins to write to the host console
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
