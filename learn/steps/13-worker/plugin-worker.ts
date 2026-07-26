/**
 * Step 13 — the other thread.
 *
 * This file never runs on the main thread. `main.ts` starts it with
 *
 *     new Worker(new URL("./plugin-worker.ts", import.meta.url))
 *
 * from `node:worker_threads`, and from that moment the two files share nothing
 * but `./protocol.ts` — a module each thread loads its OWN copy of. There is no
 * shared heap, no shared global, no closure either side can reach. Everything
 * below is what `packages/react-runtime/src/runtime.ts` and its
 * `worker-entry.ts` do, distilled:
 *
 *   worker-entry.ts   9 lines: make a `workerSelfTransport()`, wrap it in an
 *                     `RPCChannel<HostToPluginAPI, PluginToHostAPI>` that
 *                     exposes the plugin API, start it.
 *   runtime.ts        the plugin API itself: `initialize` (with the protocol
 *                     version assertion), `updateProps`, `executeHandler`,
 *                     `syncTree`, `destroy` — plus the mount that turns a React
 *                     component into `Mutation`s.
 *
 * The renderer half — `HandlerRegistry`, `serializeProps`, `serializeTree`,
 * `MutationCollector`, `RenderBridge`, the `HostConfig` — is step 05's code,
 * carried forward through step 12 unchanged. Diff it against
 * `steps/12-main-thread/main.ts` §3 and the only differences are that step 12's
 * `meter` parameters are gone and three `reportHop()` calls are in.
 *
 * The one line to read this file for is in `MutationCollector.serializeSubtree`
 * / `serializeProps`: a prop whose value is a function becomes a STRING id and
 * the function stays here, in this thread's registry, forever. Step 04 called
 * that "how a function prop becomes a HandlerId" and it looked like a design
 * preference. On this side of a `postMessage` it is the only thing that works —
 * `main.ts` section 3 sends the un-serialized version and prints what the
 * structured-clone algorithm says about it.
 */

import type { ReactElement } from "react"
import { createElement, createContext, memo, useCallback, useState } from "react"
import { parentPort, threadId, isMainThread } from "node:worker_threads"
import ReactReconciler from "react-reconciler"
import type { HostConfig, ReactContext } from "react-reconciler"
import {
  ConcurrentRoot,
  DefaultEventPriority,
  NoEventPriority,
} from "react-reconciler/constants"
import { RPCChannel } from "kkrpc"
import { workerSelfTransport } from "kkrpc/worker"
import type {
  HandlerId,
  HostToPluginAPI,
  JSONValue,
  Mutation,
  PluginToHostAPI,
  UINode,
  UpdateMode,
} from "./protocol"
import { PROTOCOL_VERSION, TEXT_NODE_TYPE } from "./protocol"

// ===========================================================================
// 1. Talking back to the host
// ===========================================================================
//
// `console.log` from a worker thread does reach the terminal in Node, and in a
// browser it reaches the devtools console — but it does not reach the HOST
// PROGRAM, which may be rendering into a canvas, a native window or a terminal
// grid. That is why `PluginToHostAPI` has a `log` member at all:
// "Allows plugins to write to the host console" (packages/protocol/src/rpc.ts).
//
// This file rides that member for its trace hops. Note what that costs: every
// hop the trace records is itself a message on the wire, and section 6 of the
// run prints those bytes in the same table as the real payloads. Instrumenting a
// boundary means crossing it more.

let rpc: RPCChannel<HostToPluginAPI, PluginToHostAPI> | null = null

/** Timestamped note to the host. `performance.now()` is comparable across
 *  threads here because both threads are one process and share a `timeOrigin`. */
function reportHop(what: string): void {
  const t = performance.now()
  if (!rpc) return
  rpc.getAPI().log("info", ["hop", "plugin", what, t])
}

/** Ship an arbitrary teaching probe result to the host as a JSON payload. */
function reportProbe(name: string, value: JSONValue): void {
  if (!rpc) return
  rpc.getAPI().log("info", ["probe", name, value])
}

// ===========================================================================
// 2. The renderer — step 05's, carried forward through step 12
// ===========================================================================

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

  /**
   * THE line. In step 12 this was reached by a direct function call from the
   * host's own stack. Here it is reached because a `{t:"q", p:["executeHandler"],
   * a:["node-24:onClick", []]}` record was structured-cloned onto this thread and
   * kkrpc looked `executeHandler` up on the exposed object. The `handlerId`
   * argument survived that trip because it is a string; the function it names
   * never left this Map and never could.
   */
  async execute(handlerId: HandlerId, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(handlerId)
    if (!handler) {
      reportHop(`executeHandler: no handler registered for "${handlerId}"`)
      return
    }
    const result = handler(...args)
    if (result instanceof Promise) return await result
    return result
  }

  clear(): void {
    this.handlers.clear()
    this.nodeHandlers.clear()
    this.sweepSeen = null
  }

  get size(): number {
    return this.handlers.size
  }
}

/**
 * Step 04's prop serializer. The `typeof value === "function"` branch is the
 * whole of step 13's thesis, written in step 04: the function is put in a Map on
 * THIS thread and a string takes its place in the payload. `serializedProps` is
 * therefore structured-clone-safe by construction for handlers — and, note, only
 * for handlers. A `Date` or a `Map` in any other prop still gets through the
 * `value as JSONValue` cast, survives structured clone, and would be destroyed by
 * step 14's JSON. Step 12 §9.5 tabulated exactly that.
 */
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
    this.pendingMutations.push({
      type: "appendChild",
      parentId: parent.id,
      node: serializedChild,
    })
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
    this.pendingMutations.push({
      type: "removeChild",
      parentId: parent.id,
      nodeId: child.id,
    })
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

// --- the HostConfig, step 05's, verbatim -----------------------------------

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
    throw new Error("[step13] plugin root must be a single element")
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

/** Step 03's seam: the 0.33 runtime and its published types disagree. */
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
// 3. The plugin — step 12's TicketPanel, plus one button that blocks
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

/** How long the "Recount" button blocks THIS thread. Section 5 of the run. */
const BLOCKING_WORK_MS = 150

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
    reportHop(`closure runs: setRows(rows => rows.filter(r => r.id !== "${id}"))`)
    setRows((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const onRefresh = useCallback(() => {
    // Step 12 captured this stack and found the host's own `dispatchHostEvent`
    // frame on it. Here the same probe is the negative control: the deepest
    // frame below this closure is kkrpc's message dispatch, and everything the
    // host did is on a stack in another thread that this one cannot see.
    reportProbe("pluginStack", new Error("stack probe").stack ?? "")
    reportHop("closure runs: setRefreshes(n => n + 1)")
    setRefreshes((n) => n + 1)
  }, [])

  const onRecount = useCallback(() => {
    // A plugin that blocks. In step 12 this froze the host; here it freezes a
    // thread the host is not on, and section 5 counts the host's timer ticks
    // during it to prove the difference rather than assert it.
    reportHop(`closure runs: blocking recount for ${BLOCKING_WORK_MS} ms`)
    const until = performance.now() + BLOCKING_WORK_MS
    let spins = 0
    while (performance.now() < until) spins++
    reportProbe("blockingSpins", spins)
    setRefreshes((n) => n + 1)
  }, [])

  return createElement(
    "column",
    { gap: 8, padding: 16 },
    createElement("heading", { level: 2 }, title ?? "Open tickets"),
    createElement("label", { id: "status" }, `${rows.length} open · ${refreshes} refreshes`),
    ...rows.map((row) => createElement(Row, { key: row.id, row, onDismiss })),
    createElement("button", { title: "recount", onClick: onRecount }, "Recount"),
    createElement("button", { title: "refresh", onClick: onRefresh }, "Refresh"),
  )
}

// ===========================================================================
// 4. The runtime — packages/react-runtime/src/runtime.ts, distilled
// ===========================================================================

/**
 * runtime.ts:55-61, verbatim in structure. This is the whole handshake on the
 * plugin side: one comparison, and a throw that kkrpc turns into a rejected
 * promise back on the host's `initialize()` call. Step 12's controller has no
 * equivalent because there is nothing to disagree with — host and plugin were
 * compiled together. Here the plugin is a separate module on a separate thread,
 * and in production a separately-deployed script the host fetched by URL.
 */
function assertProtocolVersion(protocolVersion: number): void {
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `Protocol version mismatch: host=${protocolVersion}, plugin=${PROTOCOL_VERSION}`,
    )
  }
}

interface PluginRuntimeOptions {
  mode?: UpdateMode
}

function createPluginRuntime(options: PluginRuntimeOptions): HostToPluginAPI {
  const { mode = "incremental" } = options

  let bridge: RenderBridge | null = null
  let currentElement: ReactElement | null = null
  let handlerRegistry: HandlerRegistry | null = null
  let mutationCollector: MutationCollector | null = null

  function resetRuntimeState(): void {
    if (bridge) {
      // "Unmount the previous root: without this a re-initialize (host
      // reconnect) leaked a live React tree whose effects kept running."
      // (runtime.ts:92-95)
      unmount(bridge)
    }
    bridge = null
    currentElement = null
    mutationCollector = null
    handlerRegistry?.clear()
    handlerRegistry = null
  }

  /** runtime.ts:104-116 — a plugin-side throw becomes a host-side `reportError`. */
  function reportErrorToHost(error: unknown): void {
    if (!rpc) return
    const payload =
      error instanceof Error
        ? { message: error.message, ...(error.stack ? { stack: error.stack } : {}) }
        : { message: String(error) }
    try {
      void rpc.getAPI().reportError(payload)
    } catch {
      // Channel already gone — nothing more to do.
    }
  }

  return {
    async initialize(req) {
      assertProtocolVersion(req.protocolVersion)
      resetRuntimeState()

      reportHop(
        `initialize(protocolVersion=${req.protocolVersion}) accepted ` +
          `(isMainThread=${isMainThread}, threadId=${threadId})`,
      )
      // Heap isolation, checked rather than asserted: `main.ts` sets
      // `globalThis.__hostSecret` before connecting. A main-thread plugin would
      // read it. This one cannot — a worker gets a fresh global object, and
      // there is no path from here to the host's heap at all.
      reportProbe("hostSecretVisibleToPlugin", String((globalThis as { __hostSecret?: unknown }).__hostSecret))

      handlerRegistry = new HandlerRegistry()
      bridge = createRenderBridge()
      bridge.onError = reportErrorToHost

      if (mode === "incremental") {
        mutationCollector = new MutationCollector(handlerRegistry)
        bridge.mutationCollector = mutationCollector

        // runtime.ts:155-159. Compare with step 12's controller, which ALSO
        // subscribed to the full-tree channel as a backstop. This branch cannot
        // afford that: here "re-serialize the whole tree" means "put the whole UI
        // back on the wire", every commit.
        bridge.subscribeMutations((mutations: Mutation[]) => {
          if (!rpc) return
          reportHop(`${mutations.length} mutation(s) collected -> applyMutations (postMessage)`)
          rpc.getAPI().applyMutations(mutations)
        })
      } else {
        bridge.subscribe(() => {
          if (!bridge || !handlerRegistry || !rpc) return
          const serializedTree = serializeTree(bridge.rootInstance, handlerRegistry)
          rpc.getAPI().updateTree(serializedTree)
        })
      }

      currentElement = createElement(TicketPanel, (req.props ?? {}) as object)
      render(currentElement, bridge)
    },

    async updateProps(props: JSONValue) {
      if (!bridge || !currentElement) return
      const newElement = createElement(
        (currentElement as unknown as { type: typeof TicketPanel }).type,
        (props ?? {}) as object,
      )
      currentElement = newElement
      render(newElement, bridge)
    },

    async executeHandler(handlerId, args) {
      if (!handlerRegistry) return
      reportHop(`executeHandler(${JSON.stringify(handlerId)}) arrived on the worker thread`)
      // The real line is exactly `await handlerRegistry.execute(handlerId, ...args)`
      // (runtime.ts:197-200). The `flushSyncFromReconciler` wrapper is the learn
      // harness's stand-in for a browser scheduler — same as steps 05 and 12 —
      // so the commit the handler's `setState` triggers lands inside this call
      // and its mutations are posted before this RPC's reply is.
      let pending: Promise<unknown> | undefined
      const registry = handlerRegistry
      sync.flushSyncFromReconciler(() => {
        pending = registry.execute(handlerId, ...args)
      })
      sync.flushPassiveEffects()
      await pending
      reportHop("executeHandler returning — reply message posted after the mutations")
    },

    async syncTree() {
      if (!bridge || !handlerRegistry || !rpc) return
      const serializedTree = serializeTree(bridge.rootInstance ?? null, handlerRegistry)
      reportHop(`syncTree -> updateTree (whole tree re-serialized and re-sent)`)
      rpc.getAPI().updateTree(serializedTree)
    },

    async destroy() {
      resetRuntimeState()
    },

    // TEACHING ONLY — see protocol.ts. Real `HostToPluginAPI` has no `echo`.
    // `arrivedAt` is read the instant this body starts running on the worker
    // thread, so `arrivedAt - sentAt` is one crossing: kkrpc encode, postMessage,
    // structured clone, thread wake, kkrpc dispatch.
    async echo(payload, sentAt) {
      const arrivedAt = performance.now()
      return { arrivedAt, sentAt, bounced: payload }
    },
  }
}

// ===========================================================================
// 5. worker-entry.ts — nine lines, in real life
// ===========================================================================
//
//   const transport = workerSelfTransport();
//   const runtime = createPluginRuntime({ App, transport, mode, debug },
//     (t, expose) => new RPCChannel<HostToPluginAPI, PluginToHostAPI>(t, { expose }));
//   runtime.start();
//
// The one deviation: `workerSelfTransport()` defaults to `globalThis`, which in
// a BROWSER worker is the `DedicatedWorkerGlobalScope` and has
// `postMessage` / `addEventListener`. Node's worker global does not; the
// equivalent object is `parentPort`, a `MessagePort` that implements exactly the
// `WorkerScopeLike` shape kkrpc asks for (`postMessage`, `addEventListener`,
// `removeEventListener`, `close`). So the scope is passed explicitly. kkrpc,
// the channel, the two proxied interfaces and the structured-clone boundary are
// all the real thing.

const scope = parentPort
if (!scope) throw new Error("[step13] plugin-worker.ts must be run as a worker")

const pluginAPI = createPluginRuntime({ mode: "incremental" })

rpc = new RPCChannel<HostToPluginAPI, PluginToHostAPI>(
  workerSelfTransport(scope as unknown as Parameters<typeof workerSelfTransport>[0]),
  { expose: pluginAPI },
)

/**
 * runtime.ts:224-225 attaches `error` / `unhandledrejection` listeners to the
 * plugin's global scope so that a throw anywhere in the plugin reaches the
 * host's `reportError`. The real code guards with `?.` because not every runtime
 * has them — Node's `globalThis` is one such runtime, so the guard fires and the
 * equivalent here is `process.on(...)`. Same intent, different global.
 */
process.on("uncaughtException", (error) => {
  rpc?.getAPI().reportError({ message: error.message, ...(error.stack ? { stack: error.stack } : {}) })
})
