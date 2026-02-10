import type { UINode, HandlerId, JSONValue } from "@uniview/protocol";
import type { TreeUpdate } from "./mutable-tree";

export type HostMode = "worker" | "websocket" | "main";

export interface PluginController {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  updateProps(props: JSONValue): Promise<void>;
  reload(): Promise<void>;

  getTree(): UINode | null;
  subscribe(cb: (update: TreeUpdate) => void): () => void;

  execute(handlerId: HandlerId, args?: JSONValue[]): Promise<void>;

  getStatus(): {
    mode: HostMode;
    connected: boolean;
    lastError?: string;
  };
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
