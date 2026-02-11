import type { UINode, HandlerId, JSONValue } from "@uniview/protocol";

export type HostMode = "worker" | "websocket" | "main";

export interface PluginController {
  /**
   * Connect to plugin and start rendering
   */
  connect(): Promise<void>;

  /**
   * Disconnect from plugin and clean up
   */
  disconnect(): Promise<void>;

  /**
   * Update props of plugin component
   */
  updateProps(props: JSONValue): Promise<void>;

  /**
   * Execute an event handler in the plugin
   */
  executeHandler(handlerId: HandlerId, args?: JSONValue[]): Promise<void>;

  /**
   * Destroy plugin and clean up resources
   */
  destroy(): Promise<void>;

  /**
   * Request plugin to send current full tree
   * Used for recovery from drift or explicit sync request
   */
  syncTree(): Promise<void>;

  /**
   * Get current status
   */
  getStatus(): { mode: HostMode; connected: boolean; lastError?: string };

  /**
   * Get current tree
   */
  getTree(): UINode | null;

  /**
   * Subscribe to tree updates
   * Returns unsubscribe function
   */
  subscribe(cb: (tree: UINode | null) => void): () => void;
}

export interface ComponentMetadata {
  version?: string;
  propTypes?: Record<string, unknown>;
}

export interface ComponentRegistry<T = unknown> {
  register(type: string, component: T, metadata?: ComponentMetadata): void;
  get(type: string): T | undefined;
  has(type: string): boolean;
  list(): string[];
  clear(): void;
}
