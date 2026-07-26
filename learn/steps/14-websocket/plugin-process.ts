/**
 * Step 14 — the plugin, in its own operating-system process.
 *
 * `main.ts` forks this file. It has its own PID, its own V8 heap, its own React
 * copy, its own module registry and its own event loop. It shares exactly one
 * thing with the host: a TCP connection to 127.0.0.1 on a port it was told
 * about in `process.argv[2]`.
 *
 * Read this file against `packages/react-runtime/src/runtime.ts` (the plugin
 * runtime) and `packages/react-runtime/src/ws-client.ts` (the reconnect loop
 * around it). The structure is theirs:
 *
 *   - `createPluginRuntime` exposes `HostToPluginAPI` on an `RPCChannel` and
 *     calls `PluginToHostAPI` on the other side; so does `pluginAPI` below.
 *   - `createWebSocketPluginClient` opens a `WebSocket`, wraps it in
 *     `webSocketTransport`, and reconnects on `close`; so does `connect()`.
 *
 * ONE DELIBERATE DEVIATION, flagged here and in the doc: the real client calls
 * `runtime.stop()` in its `close` handler (ws-client.ts:79-80) and builds a
 * FRESH runtime on reconnect (ws-client.ts:99-106), so the React tree is
 * unmounted the moment the wire goes. This file keeps the tree mounted across a
 * disconnect. That is the more interesting machine to teach with — a plugin
 * that kept rendering while nobody was listening is precisely the state
 * `syncTree` was written to repair — and it is also what a plugin holding a
 * websocket subscription, a file watcher or a database cursor actually is.
 */

import type { ComponentType, ReactElement } from "react"
import { createElement, createContext, memo, useCallback, useState } from "react"
import ReactReconciler from "react-reconciler"
import type { HostConfig, ReactContext } from "react-reconciler"
import { ConcurrentRoot, DefaultEventPriority, NoEventPriority } from "react-reconciler/constants"
import { WebSocket } from "ws"

import {
  PROTOCOL_VERSION,
  TEXT_NODE_TYPE,
  WireLink,
  epochNow,
  type Hop,
  type HandlerId,
  type HostToPluginAPI,
  type InitializeRequest,
  type JSONValue,
  type Mutation,
  type UINode,
} from "./protocol"

// ===========================================================================
// 1. The renderer — steps 04/05/12, carried forward unchanged
// ===========================================================================
//
// Nothing in this section knows there is a socket. That is the entire payoff of
// Stage D: `serializeProps` turning a function into `_onClickHandlerId` was
// written in step 04 for a Worker that did not exist yet, and it is what makes
// this file runnable on another machine without one line changing.

interface InternalNode {
  type: string
  props: Record<string, unknown>
  children: (InternalNode | TextNode)[]
  id: string
  parent: InternalNode | null
}

interface TextNode {
  _isTextNode: true
  text: string
  id: string
  parent: InternalNode | null
}

const isTextNode = (node: InternalNode | TextNode): node is TextNode => "_isTextNode" in node

let instanceCounter = 0
let textNodeCounter = 0
const generateId = (): string => `node-${instanceCounter++}`
const generateTextNodeId = (): string => `text-${textNodeCounter++}`

type Handler = (...args: unknown[]) => unknown

class HandlerRegistry {
  private handlers = new Map<HandlerId, Handler>()
  private nodeHandlers = new Map<string, Set<HandlerId>>()
  private sweepSeen: Set<string> | null = null

  syncNode(nodeId: string, next: Map<HandlerId, Handler>): void {
    this.sweepSeen?.add(nodeId)
    const prev = this.nodeHandlers.get(nodeId)
    if (prev) {
      for (const id of prev) if (!next.has(id)) this.handlers.delete(id)
    }
    if (next.size === 0) {
      this.nodeHandlers.delete(nodeId)
      return
    }
    const ids = new Set<HandlerId>()
    for (const [id, handler] of next) {
      this.handlers.set(id, handler)
      ids.add(id)
    }
    this.nodeHandlers.set(nodeId, ids)
  }

  releaseNode(nodeId: string): void {
    const ids = this.nodeHandlers.get(nodeId)
    if (!ids) return
    for (const id of ids) this.handlers.delete(id)
    this.nodeHandlers.delete(nodeId)
  }

  beginSweep(): void {
    this.sweepSeen = new Set()
  }

  endSweep(): void {
    const seen = this.sweepSeen
    this.sweepSeen = null
    if (!seen) return
    for (const nodeId of [...this.nodeHandlers.keys()]) {
      if (!seen.has(nodeId)) this.releaseNode(nodeId)
    }
  }

  async execute(handlerId: HandlerId, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(handlerId)
    if (!handler) return
    const result = handler(...args)
    if (result instanceof Promise) return await result
    return result
  }

  clear(): void {
    this.handlers.clear()
    this.nodeHandlers.clear()
    this.sweepSeen = null
  }
}

function serializeProps(
  props: Record<string, unknown>,
  registry: HandlerRegistry,
  nodeId: string,
): Record<string, JSONValue> {
  const serializedProps: Record<string, JSONValue> = {}
  const handlers = new Map<HandlerId, Handler>()

  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key" || key === "ref") continue

    if (typeof value === "function") {
      if (/^on[A-Z]/.test(key)) {
        // The handler id is derived from the NODE ID, not from a per-connection
        // table. Section 5 of main.ts leans on that: after the socket drops and
        // a new one is opened, every id the host bound before the outage still
        // resolves, because nothing about it was tied to the connection.
        const handlerId: HandlerId = `${nodeId}:${key}`
        handlers.set(handlerId, value as Handler)
        serializedProps[`_${key}HandlerId`] = handlerId
      }
      continue
    } else if (value === undefined) {
      continue
    } else if (value === null) {
      serializedProps[key] = null
    } else {
      serializedProps[key] = value as JSONValue
    }
  }

  registry.syncNode(nodeId, handlers)
  return serializedProps
}

function serializeTree(
  instance: InternalNode | TextNode | null,
  registry: HandlerRegistry,
): UINode | null {
  registry.beginSweep()
  try {
    return serializeNode(instance, registry)
  } finally {
    registry.endSweep()
  }
}

function serializeNode(
  instance: InternalNode | TextNode | null,
  registry: HandlerRegistry,
): UINode | null {
  if (instance === null) return null

  if (isTextNode(instance)) {
    return {
      id: instance.id,
      type: TEXT_NODE_TYPE,
      props: {},
      children: [],
      text: instance.text,
    }
  }

  const children: (UINode | string)[] = []
  for (const child of instance.children) {
    const serialized = serializeNode(child, registry)
    if (serialized !== null) children.push(serialized)
  }

  return {
    id: instance.id,
    type: instance.type,
    props: serializeProps(instance.props, registry, instance.id),
    children,
  }
}

class MutationCollector {
  private pendingMutations: Mutation[] = []

  constructor(private readonly handlerRegistry: HandlerRegistry) {}

  beginCommit(): void {
    this.pendingMutations = []
  }

  private serializeSubtree(node: InternalNode | TextNode): UINode | null {
    if (isTextNode(node)) {
      return { id: node.id, type: TEXT_NODE_TYPE, props: {}, children: [], text: node.text }
    }
    const serializedChildren: UINode[] = []
    for (const child of node.children) {
      const serializedChild = this.serializeSubtree(child)
      if (serializedChild !== null) serializedChildren.push(serializedChild)
    }
    return {
      id: node.id,
      type: node.type,
      props: serializeProps(node.props, this.handlerRegistry, node.id),
      children: serializedChildren,
    }
  }

  private cleanupHandlers(node: InternalNode | TextNode): void {
    if (isTextNode(node)) return
    this.handlerRegistry.releaseNode(node.id)
    for (const child of node.children) this.cleanupHandlers(child)
  }

  collectAppendChild(parent: InternalNode, child: InternalNode | TextNode): void {
    const serializedChild = this.serializeSubtree(child)
    if (serializedChild === null) return
    this.pendingMutations.push({ type: "appendChild", parentId: parent.id, node: serializedChild })
  }

  collectInsertBefore(
    parent: InternalNode,
    child: InternalNode | TextNode,
    beforeChild: InternalNode | TextNode,
  ): void {
    const serializedChild = this.serializeSubtree(child)
    if (serializedChild === null) return
    this.pendingMutations.push({
      type: "insertBefore",
      parentId: parent.id,
      node: serializedChild,
      beforeId: beforeChild.id,
    })
  }

  collectRemoveChild(parent: InternalNode, child: InternalNode | TextNode): void {
    this.pendingMutations.push({ type: "removeChild", parentId: parent.id, nodeId: child.id })
    this.cleanupHandlers(child)
  }

  collectSetProps(instance: InternalNode): void {
    this.pendingMutations.push({
      type: "setProps",
      nodeId: instance.id,
      props: serializeProps(instance.props, this.handlerRegistry, instance.id),
    })
  }

  collectSetText(textInstance: TextNode): void {
    this.pendingMutations.push({
      type: "setText",
      nodeId: textInstance.id,
      text: textInstance.text,
    })
  }

  collectSetRoot(rootInstance: InternalNode | null): void {
    this.pendingMutations.push({
      type: "setRoot",
      node: rootInstance === null ? null : this.serializeSubtree(rootInstance),
    })
  }

  flushCommit(): Mutation[] {
    const mutations = this.pendingMutations
    this.pendingMutations = []
    return mutations
  }
}

/** `packages/react-renderer/src/reconciler/bridge.ts`, field for field. */
interface RenderBridge {
  rootInstance: InternalNode | null
  mutationCollector: MutationCollector | null
  subscribers: Set<() => void>
  mutationSubscribers: Set<(mutations: Mutation[]) => void>
  subscribe: (callback: () => void) => () => void
  subscribeMutations: (callback: (mutations: Mutation[]) => void) => () => void
  update: () => void
  onError?: (error: unknown) => void
}

function createRenderBridge(): RenderBridge {
  const bridge: RenderBridge = {
    rootInstance: null,
    mutationCollector: null,
    subscribers: new Set(),
    mutationSubscribers: new Set(),
    subscribe(callback: () => void) {
      bridge.subscribers.add(callback)
      return () => {
        bridge.subscribers.delete(callback)
      }
    },
    subscribeMutations(callback: (mutations: Mutation[]) => void) {
      bridge.mutationSubscribers.add(callback)
      return () => {
        bridge.mutationSubscribers.delete(callback)
      }
    },
    update() {
      bridge.subscribers.forEach((callback) => callback())
    },
  }
  return bridge
}

type Type = string
type Props = Record<string, unknown>
type Container = RenderBridge
type Instance = InternalNode
type TextInstance = TextNode
type SuspenseInstance = never
type HydratableInstance = never
type PublicInstance = Instance
type HostContext = Record<string, never>
type ChildSet = never
type TimeoutHandle = ReturnType<typeof setTimeout>
type NoTimeout = -1

let currentUpdatePriority: number = NoEventPriority
let activeContainer: Container | null = null

function detachFromParent(child: Instance | TextInstance): void {
  const prevParent = child.parent
  if (!prevParent) return
  const index = prevParent.children.indexOf(child)
  if (index !== -1) prevParent.children.splice(index, 1)
}

const hostConfig: HostConfig<
  Type,
  Props,
  Container,
  Instance,
  TextInstance,
  SuspenseInstance,
  HydratableInstance,
  never,
  PublicInstance,
  HostContext,
  ChildSet,
  TimeoutHandle,
  NoTimeout,
  null
> = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: false,

  createInstance(type, props): Instance {
    return { type, props: { ...props }, children: [], id: generateId(), parent: null }
  },
  createTextInstance(text): TextInstance {
    return { _isTextNode: true, text, id: generateTextNodeId(), parent: null }
  },
  appendInitialChild(parent, child): void {
    child.parent = parent
    parent.children.push(child)
  },
  appendChild(parent, child): void {
    detachFromParent(child)
    child.parent = parent
    parent.children.push(child)
    activeContainer?.mutationCollector?.collectAppendChild(parent, child)
  },
  appendChildToContainer(container: Container, child: Instance): void {
    container.rootInstance = child
    activeContainer?.mutationCollector?.collectSetRoot(child)
  },
  insertBefore(parent, child, beforeChild): void {
    detachFromParent(child)
    const index = parent.children.indexOf(beforeChild)
    if (index === -1) {
      child.parent = parent
      parent.children.push(child)
      activeContainer?.mutationCollector?.collectAppendChild(parent, child)
      return
    }
    child.parent = parent
    parent.children.splice(index, 0, child)
    activeContainer?.mutationCollector?.collectInsertBefore(parent, child, beforeChild)
  },
  insertInContainerBefore(): void {
    throw new Error("[step14] plugin root must be a single element")
  },
  removeChild(parent, child): void {
    const index = parent.children.indexOf(child)
    if (index !== -1) {
      parent.children.splice(index, 1)
      child.parent = null
      activeContainer?.mutationCollector?.collectRemoveChild(parent, child)
    }
  },
  removeChildFromContainer(container, child): void {
    if (container.rootInstance === child) {
      container.rootInstance = null
      activeContainer?.mutationCollector?.collectSetRoot(null)
    }
  },
  clearContainer(container): void {
    container.rootInstance = null
    activeContainer?.mutationCollector?.collectSetRoot(null)
  },
  commitUpdate(instance, _type, _oldProps, newProps): void {
    instance.props = { ...newProps }
    activeContainer?.mutationCollector?.collectSetProps(instance)
  },
  commitTextUpdate(textInstance, _oldText, newText): void {
    textInstance.text = newText
    activeContainer?.mutationCollector?.collectSetText(textInstance)
  },
  prepareForCommit(container: Container): null {
    activeContainer = container
    container.mutationCollector?.beginCommit()
    return null
  },
  resetAfterCommit(container: Container): void {
    if (container.mutationCollector) {
      const mutations = container.mutationCollector.flushCommit()
      if (mutations.length > 0) {
        container.mutationSubscribers.forEach((cb) => void cb(mutations))
      }
    }
    container.update()
    activeContainer = null
  },

  shouldSetTextContent: () => false,
  getRootHostContext: () => ({}),
  getChildHostContext: (parentHostContext) => parentHostContext,
  finalizeInitialChildren: () => false,
  getPublicInstance: (instance: Instance): PublicInstance => instance,

  preparePortalMount(): void {},
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,

  setCurrentUpdatePriority(newPriority: number): void {
    currentUpdatePriority = newPriority
  },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () =>
    currentUpdatePriority !== NoEventPriority ? currentUpdatePriority : DefaultEventPriority,
  shouldAttemptEagerTransition: () => false,

  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit(): void {},
  suspendInstance(): void {},
  waitForCommitToBeReady: () => null,

  hideInstance(): void {},
  unhideInstance(): void {},
  hideTextInstance(): void {},
  unhideTextInstance(): void {},

  NotPendingTransition: null,
  HostTransitionContext: createContext(null) as unknown as ReactContext<null>,
  resetFormInstance(): void {},
  requestPostPaintCallback(): void {},

  // Required by react-reconciler@0.33 at RUNTIME, not at type-check time.
  trackSchedulerEvent(): void {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,

  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur(): void {},
  afterActiveInstanceBlur(): void {},
  prepareScopeUpdate(): void {},
  getInstanceFromScope: () => null,
  detachDeletedInstance(): void {},
}

const reconciler = ReactReconciler(hostConfig)

interface SynchronousReconciler {
  flushSyncFromReconciler<Result>(callback: () => Result): Result
  flushPassiveEffects(): boolean
}
const sync = reconciler as typeof reconciler & SynchronousReconciler

type OpaqueRoot = ReturnType<typeof reconciler.createContainer>
const containers = new WeakMap<RenderBridge, OpaqueRoot>()

function render(element: ReactElement | null, bridge: RenderBridge): void {
  let container = containers.get(bridge)
  if (container === undefined) {
    container = reconciler.createContainer(
      bridge,
      ConcurrentRoot,
      null,
      false,
      null,
      "",
      bridge.onError ?? console.error,
      bridge.onError ?? console.error,
      bridge.onError ?? console.error,
      bridge.onError ?? console.error,
      null,
    )
    containers.set(bridge, container)
  }
  const root = container
  sync.flushSyncFromReconciler(() => {
    reconciler.updateContainer(element, root, null, () => {})
  })
  sync.flushPassiveEffects()
}

function unmount(bridge: RenderBridge): void {
  const container = containers.get(bridge)
  if (container === undefined) return
  sync.flushSyncFromReconciler(() => {
    reconciler.updateContainer(null, container, null, () => {})
  })
  sync.flushPassiveEffects()
  containers.delete(bridge)
}

// ===========================================================================
// 2. The plugin component — step 12's TicketPanel, plus one button
// ===========================================================================

interface RowData {
  id: string
  label: string
}

const SUBJECTS = [
  "Crash on paste",
  "Dark mode flickers",
  "Export hangs at 90%",
  "Duplicate rows after sync",
]

const makeRows = (n: number): RowData[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i + 1}`,
    label: `#${101 + i} ${SUBJECTS[i % SUBJECTS.length]}`,
  }))

/** Hops recorded on THIS side of the wire, shipped to the host via `log`. */
const pluginHops: Hop[] = []
const hop = (what: string): void => {
  pluginHops.push({ at: epochNow(), where: "plugin", what })
}

/** Timers the burst button schedules; cleared on destroy so nothing outlives us. */
const burstTimers = new Set<ReturnType<typeof setTimeout>>()

const Row = memo(function Row({
  row,
  onDismiss,
}: {
  row: RowData
  onDismiss: (id: string) => void
}): ReturnType<typeof createElement> {
  return createElement(
    "row",
    { gap: 4 },
    createElement("label", { id: row.id }, row.label),
    createElement("button", { title: `dismiss ${row.id}`, onClick: () => onDismiss(row.id) }, "x"),
  )
})

function TicketPanel({ title }: { title?: string }): ReturnType<typeof createElement> {
  const [rows, setRows] = useState<RowData[]>(() => makeRows(3))
  const [refreshes, setRefreshes] = useState(0)

  const onDismiss = useCallback((id: string) => {
    hop(`closure runs: setRows(rows => rows.filter(r => r.id !== "${id}"))`)
    setRows((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const onRefresh = useCallback(() => {
    hop("closure runs: setRefreshes(n => n + 1)")
    setRefreshes((n) => n + 1)
  }, [])

  /**
   * Three state updates on the plugin's OWN clock, at +60/+120/+180ms. This is
   * the button `main.ts` presses just before it cuts the wire: a plugin that is
   * not merely echoing host events but is a running program with pending work.
   * Nothing about it is a simulation of failure — it is a poll, a stream, a
   * file watcher. The failure is that the host stops being able to hear it.
   */
  const onBurst = useCallback(() => {
    for (const delay of [60, 120, 180]) {
      const timer = setTimeout(() => {
        burstTimers.delete(timer)
        // Same scheduler stand-in as `render`: without it the commit this
        // setState triggers would sit pending past the end of the tick.
        sync.flushSyncFromReconciler(() => {
          setRefreshes((n) => n + 1)
        })
        sync.flushPassiveEffects()
        // A log line, not a mutation. If the wire is down this is buffered and
        // arrives after the reconnect — which is how `main.ts` gets to print
        // what the plugin was rendering while the host could not hear it.
        log("info", [`background tick: plugin's status label is now "${currentStatusText()}"`])
      }, delay)
      burstTimers.add(timer)
    }
  }, [])

  return createElement(
    "column",
    { gap: 8, padding: 16 },
    createElement("heading", { level: 2 }, title ?? "Open tickets"),
    createElement("label", { id: "status" }, `${rows.length} open · ${refreshes} refreshes`),
    ...rows.map((row) => createElement(Row, { key: row.id, row, onDismiss })),
    createElement("button", { title: "refresh", onClick: onRefresh }, "Refresh"),
    createElement("button", { title: "burst", onClick: onBurst }, "Background burst"),
  )
}

// ===========================================================================
// 3. The runtime — react-runtime/src/runtime.ts, distilled
// ===========================================================================

const serverUrl = process.argv[2]
if (!serverUrl) {
  console.error("[plugin] usage: plugin-process.ts <ws-url>")
  process.exit(2)
}

const RECONNECT_DELAY_MS = 100

let bridge: RenderBridge | null = null
let currentElement: ReactElement | null = null
let handlerRegistry: HandlerRegistry | null = null
let mutationCollector: MutationCollector | null = null
let wire: WireLink | null = null
let socket: WebSocket | null = null
let shuttingDown = false
let connections = 0

/** Mutation frames this process produced with nowhere to put them. */
let droppedMutationFrames = 0
/** Log lines produced while disconnected. Logs buffer; MUTATIONS DO NOT. */
const pendingLogs: [level: "log" | "info" | "warn" | "error", args: JSONValue[]][] = []

/**
 * Fire-and-forget over a socket is not fire-and-forget.
 *
 * `wire.call()` returns a promise that REJECTS when the connection dies with
 * the call still in flight, and an unhandled rejection takes this whole process
 * down — a crash mode `postMessage` simply cannot produce, discovered the
 * normal way: the first draft of this file exited with code 1 in the middle of
 * section 5. So every outbound call attaches a catch, on purpose.
 */
function send(method: string, args: unknown[]): void {
  wire?.call(method, args).catch(() => {})
}

function log(level: "log" | "info" | "warn" | "error", args: JSONValue[]): void {
  if (wire && socket && socket.readyState === WebSocket.OPEN) {
    send("log", [level, args])
    return
  }
  // Buffering a log line is harmless: it is a string, and it means the same
  // thing whenever it arrives. Buffering a MUTATION would not be — a batch is
  // relative to a tree state the host may no longer have, and replaying it
  // after a gap is exactly the corruption step 10's revision guard exists to
  // catch. So the outbox below holds logs only, and lost mutation batches are
  // recovered the one correct way: `syncTree`, a full resend.
  pendingLogs.push([level, args])
}

/**
 * The plugin's own view of what it is currently showing, read straight off the
 * live React instances. Hoisted (a `function` declaration) so `onBurst` above
 * can call it even though `bridge` is declared here.
 */
function currentStatusText(): string {
  const find = (node: InternalNode | TextNode): string | null => {
    if (isTextNode(node)) return null
    if (node.props.id === "status") {
      const first = node.children[0]
      return first !== undefined && isTextNode(first) ? first.text : null
    }
    for (const child of node.children) {
      const hit = find(child)
      if (hit !== null) return hit
    }
    return null
  }
  if (!bridge?.rootInstance) return "(no tree)"
  return find(bridge.rootInstance) ?? "(no status label)"
}

function resetRuntimeState(): void {
  if (bridge) unmount(bridge)
  bridge = null
  currentElement = null
  mutationCollector = null
  handlerRegistry?.clear()
  handlerRegistry = null
  for (const timer of burstTimers) clearTimeout(timer)
  burstTimers.clear()
}

function assertProtocolVersion(protocolVersion: number): void {
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `Protocol version mismatch: host=${protocolVersion}, plugin=${PROTOCOL_VERSION}`,
    )
  }
}

const pluginAPI: HostToPluginAPI = {
  async initialize(req: InitializeRequest): Promise<void> {
    assertProtocolVersion(req.protocolVersion)
    resetRuntimeState()

    handlerRegistry = new HandlerRegistry()
    bridge = createRenderBridge()
    bridge.onError = (error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error))
      send("reportError", [{ message: err.message, ...(err.stack ? { stack: err.stack } : {}) }])
    }

    // Incremental mode. NOTE what is not here, versus the main-thread
    // controller: there is no full-tree backstop subscription. `runtime.ts`'s
    // incremental branch subscribes to mutations ONLY (runtime.ts:150-160),
    // because "re-serialize the whole tree on every commit" over a socket means
    // putting the entire UI on the wire on every keystroke. Step 05's "only
    // send what changed" stops being an optimization here and becomes the
    // reason the transport is usable at all.
    mutationCollector = new MutationCollector(handlerRegistry)
    bridge.mutationCollector = mutationCollector

    bridge.subscribeMutations((mutations: Mutation[]) => {
      hop(`emit applyMutations(${mutations.length}) -> wire`)
      if (!wire) {
        // The commit happened. The batch exists. There is nowhere to put it,
        // and — this is the important part — nothing anywhere raises an error.
        droppedMutationFrames += 1
        return
      }
      const before = wire.framesDropped
      send("applyMutations", [mutations])
      if (wire.framesDropped > before) droppedMutationFrames += 1
    })

    currentElement = createElement(TicketPanel as ComponentType<unknown>, (req.props ?? {}) as object)
    hop("initialize: mounting the React tree")
    render(currentElement, bridge)
  },

  async updateProps(props: JSONValue): Promise<void> {
    if (!bridge || !currentElement) return
    const newElement = createElement(
      (currentElement as unknown as { type: ComponentType<unknown> }).type,
      (props ?? {}) as object,
    )
    currentElement = newElement
    render(newElement, bridge)
  },

  async executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void> {
    if (!handlerRegistry) return
    hop(`executeHandler(${JSON.stringify(handlerId)}) dispatched in PID ${process.pid}`)
    let pending: Promise<unknown> | undefined
    const registry = handlerRegistry
    sync.flushSyncFromReconciler(() => {
      pending = registry.execute(handlerId, ...args)
    })
    sync.flushPassiveEffects()
    await pending
  },

  /**
   * "Request plugin to send current full tree / Used for recovery from drift or
   * explicit sync request" — packages/protocol/src/rpc.ts:50-54.
   *
   * This is the one RPC that exists purely because the transport can fail. On
   * the main thread `syncTree` re-notifies a local variable; here it walks the
   * live React instances, rebuilds the whole `UINode`, and pushes it as
   * `updateTree` — the host's `mutableTree.init(newTree)` then throws away
   * whatever it thought was true.
   */
  async syncTree(): Promise<void> {
    if (!bridge || !handlerRegistry || !wire) return
    const serializedTree = serializeTree(bridge.rootInstance, handlerRegistry)
    hop("syncTree: whole tree re-serialized -> updateTree")
    send("updateTree", [serializedTree])
  },

  async destroy(): Promise<void> {
    resetRuntimeState()
  },
}

/** Everything the host may call, by name. `p[0]` of an incoming request. */
const exposed: Record<string, (...args: never[]) => unknown> = {
  initialize: (req: InitializeRequest) => pluginAPI.initialize(req),
  updateProps: (props: JSONValue) => pluginAPI.updateProps(props),
  executeHandler: (id: HandlerId, args: JSONValue[]) => pluginAPI.executeHandler(id, args),
  syncTree: () => pluginAPI.syncTree(),
  destroy: () => pluginAPI.destroy(),
  /** Teaching-only: hand the host this process's hop log so it can interleave it. */
  __hops: () => {
    const out = pluginHops.splice(0, pluginHops.length)
    return out as unknown as JSONValue
  },
  /** Teaching-only: how many mutation frames fell on the floor. */
  __drops: () => droppedMutationFrames,
} as unknown as Record<string, (...args: never[]) => unknown>

// ===========================================================================
// 4. The reconnect loop — ws-client.ts:60-107
// ===========================================================================

function connect(): void {
  if (shuttingDown) return

  const ws = new WebSocket(serverUrl)
  socket = ws

  ws.on("open", () => {
    connections += 1
    const link = new WireLink(ws, exposed)
    wire = link
    void (async () => {
      try {
        // AWAIT the first message. A write is not a delivery: during the
        // blackout in main.ts §5 this plugin completes a WebSocket handshake
        // three times and has each connection terminated a millisecond later,
        // and every byte it wrote into those sockets is gone. Only a RESPONSE
        // proves the peer is really there — so the outbox is emptied after the
        // round trip, not after the send.
        await link.call("log", [
          "info",
          [
            `plugin process online: pid=${process.pid} node=${process.version} ` +
              `connection #${connections} to ${serverUrl}`,
          ],
        ])
      } catch {
        // That connection died mid-call. The outbox is untouched.
        return
      }
      if (wire !== link) return
      const buffered = pendingLogs.splice(0, pendingLogs.length)
      for (const [level, args] of buffered) send("log", [level, args])
    })()
  })

  ws.on("close", () => {
    wire?.destroy()
    wire = null
    socket = null
    if (shuttingDown) return
    // ws-client.ts:79-80 calls `runtime.stop()` here. This file does not — see
    // the header. The React tree stays mounted and its timers keep firing.
    setTimeout(connect, RECONNECT_DELAY_MS).unref()
  })

  // A refused connection during the blackout window is an `error` followed by a
  // `close`; the retry is scheduled by the `close` handler above.
  ws.on("error", () => {})
}

function shutdown(code: number): void {
  shuttingDown = true
  resetRuntimeState()
  wire?.destroy()
  wire = null
  try {
    socket?.close()
  } catch {}
  socket = null
  // Give the close frame a tick to leave, then go. Nothing here is unref'd by
  // accident: an orphaned plugin process is a real bug in this architecture,
  // and `main.ts` checks for one at the end.
  setTimeout(() => process.exit(code), 30).unref()
}

process.on("SIGTERM", () => shutdown(0))
process.on("SIGINT", () => shutdown(0))
process.on("message", (message: unknown) => {
  // The host's out-of-band "you may exit now", over the fork IPC channel rather
  // than the socket — because by then the socket is exactly what is being torn
  // down, and a shutdown that depends on the failing transport is not one.
  if (message === "shutdown") shutdown(0)
})

connect()
