/**
 * Step 13 — the contract, in the one place both threads can see it.
 *
 * Every step before this one re-declared the protocol inside a single `main.ts`,
 * because a step is one process and one file. This step is two threads, and each
 * thread loads its own module graph: `main.ts` runs on the main thread,
 * `plugin-worker.ts` runs on a `node:worker_threads` worker. Nothing is shared
 * between them at runtime — not a heap, not a global, not a closure. The ONLY
 * thing they share is this file, and they share it the way the real system does:
 * as a package of types and constants that both sides import
 * (`@uniview/protocol`), not as objects that travel.
 *
 * That is worth noticing before reading a line of it. `UINode`, `Mutation`,
 * `HandlerId` and the two RPC interfaces below are the entire agreement between a
 * plugin and a host that cannot call each other. Steps 01-05 justified each field
 * on grounds that were, honestly, taken on faith — "a Swift decoder has to be able
 * to rebuild it", "a function cannot cross a Worker boundary". This is the step
 * where the boundary is real and the faith becomes a test: anything in here that
 * is not structured-clone-safe throws today, on the actual thread hop, in
 * `main.ts` section 3.
 */

// ===========================================================================
// The tree — packages/protocol/src/tree.ts
// ===========================================================================

/** The only value kinds allowed in props: whatever a Swift decoder can rebuild. */
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue }

/** Reserved node type for text content. Text is a node so mutations can address it. */
export const TEXT_NODE_TYPE = "#text"

export interface UINode {
  id: string
  type: string
  props: Record<string, JSONValue>
  children: (UINode | string)[]
  text?: string
}

/**
 * `packages/protocol/src/events.ts`: "Handler ID type for event callbacks."
 *
 * It is `string`. That single line is what this whole step is about — read it
 * next to `main.ts` section 3, where a `() => {}` in the same position throws
 * `DataCloneError` on the real thread hop and the string sails through.
 */
export type HandlerId = string

/** `onClick` -> `_onClickHandlerId`, from packages/protocol/src/events.ts. */
export const handlerIdProp = (eventProp: string): string => `_${eventProp}HandlerId`

/** `_onClickHandlerId` -> true. How a host finds the callable props on a node. */
export const isHandlerIdProp = (propName: string): boolean =>
  propName.startsWith("_") && propName.endsWith("HandlerId")

// ===========================================================================
// The mutations — packages/protocol/src/mutations.ts
// ===========================================================================

export interface AppendChildMutation {
  type: "appendChild"
  parentId: string
  node: UINode
}

export interface InsertBeforeMutation {
  type: "insertBefore"
  parentId: string
  node: UINode
  beforeId: string
}

export interface RemoveChildMutation {
  type: "removeChild"
  parentId: string
  nodeId: string
}

export interface SetTextMutation {
  type: "setText"
  nodeId: string
  text: string
}

export interface SetPropsMutation {
  type: "setProps"
  nodeId: string
  props: Record<string, JSONValue>
}

export interface SetRootMutation {
  type: "setRoot"
  node: UINode | null
}

export type Mutation =
  | AppendChildMutation
  | InsertBeforeMutation
  | RemoveChildMutation
  | SetTextMutation
  | SetPropsMutation
  | SetRootMutation

export type UpdateMode = "full" | "incremental"

// ===========================================================================
// The version — packages/protocol/src/version.ts, verbatim value
// ===========================================================================

/**
 * "Protocol version number. Increment this when making breaking changes to the
 * protocol." — packages/protocol/src/version.ts, where the constant is `3`.
 *
 * Step 12 had no use for this: `createMainController` compiles the host and the
 * plugin into one bundle, so there is nothing two versions of. Here the plugin is
 * a separate module loaded onto a separate thread, and in production it is a
 * separately-shipped `.js` file the host fetched over HTTP
 * (`controllers/worker.ts:73-84`). The two can disagree, so the first message on
 * the channel asks.
 */
export const PROTOCOL_VERSION = 3

// ===========================================================================
// The two-way RPC contract — packages/protocol/src/rpc.ts
// ===========================================================================
//
// kkrpc proxies these two interfaces in opposite directions over one channel.
// The host holds a `RPCChannel<PluginToHostAPI, HostToPluginAPI>`; the plugin
// holds a `RPCChannel<HostToPluginAPI, PluginToHostAPI>`. Each side calls
// `rpc.getAPI()` and gets a typed proxy of the OTHER side's interface, where
// every method call is a `postMessage` and every return value is a promise that
// settles when the reply message comes back.

/** API that the host exposes to the plugin — the plugin calls these. */
export interface HostToPluginAPI {
  /** Host calls this first, after establishing the connection. */
  initialize(req: { protocolVersion: number; props?: JSONValue }): Promise<void>
  updateProps(props: JSONValue): Promise<void>
  /** The one round trip this step exists to measure. */
  executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>
  destroy(): Promise<void>
  /** "Request plugin to send current full tree. Used for recovery from drift." */
  syncTree(): Promise<void>
  /**
   * TEACHING ONLY — not in the real `HostToPluginAPI`.
   *
   * Bounces a payload off the worker thread and reports the clock reading at the
   * moment it arrived, so section 4 can price ONE crossing of a REAL thread
   * rather than inferring it from a round trip. `performance.timeOrigin` is
   * identical in a `node:worker_threads` worker and its parent (both threads are
   * one process), which is what makes the subtraction legitimate; `main.ts`
   * prints both origins so you can check rather than trust.
   */
  echo(
    payload: JSONValue,
    sentAt: number,
  ): Promise<{ arrivedAt: number; sentAt: number; bounced: JSONValue }>
}

/** API that the plugin exposes to the host — the host receives these calls. */
export interface PluginToHostAPI {
  /** Full-tree mode: "Called after every React render in plugin." */
  updateTree(tree: UINode | null): void
  /** Incremental mode: step 05's batch, now as a message instead of a callback. */
  applyMutations(mutations: Mutation[]): void
  /** "Allows plugins to write to the host console." Section 2 rides on this. */
  log(level: "log" | "info" | "warn" | "error", args: JSONValue[]): void
  /** "For uncaught exceptions and critical errors." */
  reportError(err: { message: string; stack?: string }): void
}

// ===========================================================================
// Shared teaching helpers
// ===========================================================================

/**
 * Captured before `main.ts` patches the global counter, and used by every
 * printing helper on both threads: measuring a boundary with the same function
 * you are counting calls to would corrupt the measurement.
 */
export const nativeStringify: typeof JSON.stringify = JSON.stringify

/** UTF-8 byte size — what a socket would actually carry (step 14's currency). */
export const utf8 = (value: string): number => new TextEncoder().encode(value).length

/** Step 04/05/12's printer, unchanged. */
export function show(node: UINode | string, depth = 0): string {
  const pad = "  ".repeat(depth)
  if (typeof node === "string") return `${pad}"${node}" (legacy bare string)`
  if (node.type === TEXT_NODE_TYPE) return `${pad}#text#${node.id} "${node.text}"`
  const props = Object.entries(node.props)
    .map(([k, v]) => `${k}=${nativeStringify(v)}`)
    .join(" ")
  return [
    `${pad}<${node.type}#${node.id}${props ? " " + props : ""}>`,
    ...node.children.map((c) => show(c, depth + 1)),
  ].join("\n")
}

/** How many nodes a serialized subtree contains — the unit of "how much crossed". */
export function countNodes(node: UINode | string): number {
  if (typeof node === "string") return 1
  return 1 + node.children.reduce<number>((n, c) => n + countNodes(c), 0)
}

/**
 * One line of the cross-thread trace. Both threads produce these; the plugin's
 * reach the host over the `log` RPC (which is itself two more crossings — see
 * section 6's wire table, where instrumenting the boundary shows up as traffic
 * on the boundary).
 */
export interface Hop {
  t: number
  where: "host" | "controller" | "plugin" | "wire"
  what: string
}
