/**
 * Step 12 — The main-thread controller: the seam, with the boundary removed.
 *
 * Stage D opens here. Stage C varied WHERE the tree is drawn — Svelte, Vue,
 * React, a terminal, AppKit — over one `PluginController`. Stage D varies WHERE
 * THE PLUGIN RUNS, over that same interface: main thread (this step), Web
 * Worker (13), another process over a socket (14).
 *
 * This is implementation #1 of three, and it is the one with nothing in the
 * middle. The plugin's React tree lives in the same JS heap as the host that
 * renders it. `postMessage` is never called. A handler invocation is a direct
 * function call — you can see the host's stack frame from inside the plugin's
 * closure, and this file prints that stack to prove it.
 *
 * Two things make that worth a whole step.
 *
 *   1. THE INTERFACE DOES NOT CHANGE. Same ten members, same `Promise`
 *      returns, same subscribe fan-out. The host code in section 8 is the
 *      step 07/08 host with one line altered (which controller it constructs).
 *      A seam is only real if you can remove everything behind it and the code
 *      above it still compiles — that is what this step demonstrates.
 *
 *   2. IT IS THE BASELINE. Steps 13 and 14 are *costs*, and a cost is only
 *      legible against a zero. So this file does not merely say "no
 *      serialization happens"; it INSTRUMENTS the seam and prints:
 *
 *        - bytes serialized on the hot path                       (0)
 *        - calls to JSON.stringify during a commit                (0)
 *        - handler-invocation latency, performance.now()          (µs)
 *        - object identity across the seam                        (preserved)
 *        - and, for the same payloads, what a structured-clone
 *          boundary and a JSON/socket boundary WOULD have cost.
 *
 *      Those last two columns are the ones steps 13 and 14 fill in for real.
 *
 * Two findings from the real source are taught here as findings, not smoothed
 * over. Both are verifiable in the repository today:
 *
 *   FINDING 1 — `createMainController` is coupled to React.
 *     `packages/host-sdk/src/controllers/main.ts` line 1 imports `react` and
 *     lines 5-12 import `@uniview/react-renderer`; its options take a React
 *     `ComponentType`. `packages/host-sdk/package.json` describes the package
 *     as the "Framework-agnostic host SDK" and then lists
 *     `@uniview/react-renderer` under `dependencies` — not a peer, not
 *     optional. `CLAUDE.md:184` lists "NEVER couple host-sdk to specific
 *     framework - must remain framework-agnostic" as an anti-pattern. There is
 *     no Solid main-thread controller (`packages/solid-runtime/src/` has
 *     `worker-entry.ts` and `ws-client-entry.ts` and nothing else), so a Solid
 *     plugin can only reach a host through a Worker or a socket. Section 9.6
 *     builds both halves and shows the interface is fine while the constructor
 *     is not.
 *
 *   FINDING 2 — main-thread incremental mode keeps a full-tree backstop.
 *     `controllers/main.ts:48-65` subscribes to BOTH channels in incremental
 *     mode: the mutation channel applies the batch, and then the full-tree
 *     channel re-serializes the whole tree and calls `mutableTree.init(...)`
 *     over the top of it. `packages/react-runtime/src/runtime.ts:150-174` — the
 *     Worker/WebSocket path — does not; its incremental branch subscribes to
 *     mutations only. Section 9.4 runs the same interaction with the backstop
 *     on and off and prints the difference in work per commit. The main-thread
 *     controller can afford belt-and-braces precisely because nothing is being
 *     serialized across a boundary. That is this step's thesis, stated as a
 *     design decision someone actually made.
 */

import type { ComponentType, ReactElement } from "react"
import { createElement, createContext, memo, useCallback, useState } from "react"
import ReactReconciler from "react-reconciler"
import type { HostConfig, ReactContext } from "react-reconciler"
import {
  ConcurrentRoot,
  DefaultEventPriority,
  NoEventPriority,
} from "react-reconciler/constants"

// NOTE the path. `solid-js/dist/solid.js` names Solid's CLIENT build
// explicitly; under plain Node a bare `import "solid-js"` resolves through the
// package's "node" export condition to the non-reactive SSR build and every
// signal write below becomes a no-op. Step 06's header explains this at length.
// Only three primitives are needed here — section 9.6 is about the CONTROLLER's
// coupling, not about rebuilding step 06's universal renderer.
import { createRoot, createSignal, createRenderEffect } from "solid-js/dist/solid.js"

// ===========================================================================
// 1. The protocol, carried forward from steps 01/04/05
// ===========================================================================
//
// Steps never import each other (learn/RULES.md), so the contract is
// re-declared. Nothing here has changed since step 05.

/** The only value kinds allowed in props: whatever a Swift decoder can rebuild. */
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue }

/** Reserved node type for text content. Text is a node so mutations can address it. */
const TEXT_NODE_TYPE = "#text"

/** A subset of the real 40-entry `LAYOUT_TAGS`; the host in section 8 needs a floor. */
const LAYOUT_TAGS = ["div", "span", "button", "input", "p", "ul", "li"] as const
type UILayoutTag = (typeof LAYOUT_TAGS)[number]

const isLayoutTag = (type: string): type is UILayoutTag =>
  (LAYOUT_TAGS as readonly string[]).includes(type)

export interface UINode {
  id: string
  type: string
  props: Record<string, JSONValue>
  children: (UINode | string)[]
  text?: string
}

/** A function cannot cross a Worker boundary, so a callback travels as a string. */
export type HandlerId = string

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

/** Step 04/05's printer, unchanged. */
function show(node: UINode | string, depth = 0): string {
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

/** How many nodes a serialized subtree contains — the unit of "how much got sent". */
function countNodes(node: UINode | string): number {
  if (typeof node === "string") return 1
  return 1 + node.children.reduce<number>((n, c) => n + countNodes(c), 0)
}

// ===========================================================================
// 2. The instrument: a stringify counter and three boundaries
// ===========================================================================
//
// This section is the one genuinely new mechanism in the file, and it exists
// because "nothing is serialized" is a claim, and a claim in a curriculum needs
// a number under it.
//
// `nativeStringify` is captured BEFORE the patch below, and every printing
// helper in this file uses it. Otherwise the act of printing the measurement
// would corrupt the measurement.

const nativeStringify: typeof JSON.stringify = JSON.stringify

/** UTF-8 byte size, because that is what a socket actually carries. */
const utf8 = (value: string): number => new TextEncoder().encode(value).length

let stringifyArmed = false
let stringifyCalls = 0

/**
 * Global `JSON.stringify` counter. Armed only around the measured window, so
 * the number below is exactly "how many times did a commit reach for the
 * serializer", not "how many times did this file print something".
 *
 * A real runtime does the equivalent deliberately and admits the cost:
 * `@uniview/react-runtime`'s `debug` flag "Costs an extra JSON.stringify of
 * every payload per update — keep off in production."
 * (packages/react-runtime/src/runtime.ts:33)
 */
JSON.stringify = ((value: unknown, replacer?: unknown, space?: unknown): string => {
  if (stringifyArmed) stringifyCalls += 1
  return (nativeStringify as (v: unknown, r?: unknown, s?: unknown) => string)(
    value,
    replacer,
    space,
  )
}) as typeof JSON.stringify

/** Run `fn` with the stringify counter armed, and report how many calls it made. */
function measureStringify<T>(fn: () => T): { result: T; calls: number } {
  const before = stringifyCalls
  stringifyArmed = true
  try {
    const result = fn()
    return { result, calls: stringifyCalls - before }
  } finally {
    stringifyArmed = false
  }
}

/**
 * A boundary is the thing between the plugin and the host. Step 12's is
 * `NONE`: `cross()` returns the very object it was given, so the host and the
 * plugin end up holding the same node — a fact section 9.3 asserts rather than
 * asserts-in-prose.
 *
 * The other two are not used by the controller; they are the counterfactual.
 * Feeding the SAME payload through them is what turns "zero" into a baseline
 * table steps 13 and 14 can extend with their real transports.
 */
class Boundary {
  bytes = 0
  messages = 0

  constructor(
    readonly name: string,
    /** "none" = no boundary at all: the payload is handed over by reference. */
    private readonly kind: "none" | "clone" | "json",
  ) {}

  cross<T>(payload: T): T {
    this.messages += 1
    switch (this.kind) {
      case "none":
        // The entire step, in one statement.
        return payload
      case "clone": {
        const copy = structuredClone(payload)
        // structuredClone has no observable byte count and does NOT use a text
        // serializer, so this line is a MEASUREMENT (via the unpatched
        // stringify) and not work the transport does. That is why the clone row
        // in section 9.3's table reports 0 stringify calls.
        this.bytes += utf8(nativeStringify(payload))
        return copy
      }
      case "json": {
        // Here the stringify IS the transport. The counter sees it.
        const text = JSON.stringify(payload)
        this.bytes += utf8(text)
        return JSON.parse(text) as T
      }
    }
  }
}

const noBoundary = (): Boundary => new Boundary("main thread — no boundary", "none")
const cloneBoundary = (): Boundary => new Boundary("Web Worker — structuredClone", "clone")
const jsonBoundary = (): Boundary => new Boundary("WebSocket — JSON text frame", "json")

/**
 * Everything the seam is asked to do, counted. `MutationCollector`,
 * `serializeTree` and `MutableTree` each take one of these so the numbers come
 * from the real call sites rather than from arithmetic afterwards.
 */
class SeamMeter {
  commits = 0
  mutationsEmitted = 0
  /** Nodes serialized INTO mutations (appendChild/insertBefore/setRoot payloads). */
  nodesIntoMutations = 0
  /** Whole-tree re-serializations — finding 2's backstop, when it is on. */
  fullTreeSerializations = 0
  nodesWalkedFullTree = 0
  /** `MutableTree.rebuildIndex()` runs, one per `init()` or `setRoot`. */
  indexRebuilds = 0
  /** Fan-outs to `subscribe()` callbacks. */
  notifications = 0
  handlerCalls = 0
  handlerLatenciesMs: number[] = []
}

// ===========================================================================
// 3. Plugin side, carried forward from step 05
// ===========================================================================
//
// `HandlerRegistry`, `serializeProps`, `serializeTree`, `MutationCollector`,
// `RenderBridge` and the `HostConfig` are step 05's, with the long commentary
// trimmed and one meter hook added to three of them. Diff this section against
// step 05 and the only differences you should find are `meter` parameters.

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
   * THE line this whole step is about. In Worker mode this is reached by an
   * RPC that crossed a thread; here it is reached by `controller.executeHandler`
   * calling it directly, and `handler(...args)` is a plain call on the caller's
   * own stack. Section 9.2 prints the stack to prove it.
   */
  async execute(handlerId: HandlerId, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(handlerId)
    if (!handler) {
      console.warn(
        `      [plugin] executeHandler: no handler registered for "${handlerId}"`,
      )
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
 * Step 04's prop serializer. Note what it does NOT do: it does not check that
 * the values it lets through are structured-clone-safe or JSON-safe. It cannot
 * — `JSONValue` is a compile-time claim and `value as JSONValue` is where the
 * claim stops being checked. On the main thread nothing ever tests it. Section
 * 9.5 is what happens when something finally does.
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
  meter?: SeamMeter,
): UINode | null {
  if (meter) meter.fullTreeSerializations += 1
  registry.beginSweep()
  try {
    return serializeNode(instance, registry, meter)
  } finally {
    registry.endSweep()
  }
}

function serializeNode(
  instance: InternalNode | TextNode | null,
  registry: HandlerRegistry,
  meter?: SeamMeter,
): UINode | null {
  if (instance === null) return null
  if (meter) meter.nodesWalkedFullTree += 1

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
    const serialized = serializeNode(child, registry, meter)
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

  constructor(
    private readonly handlerRegistry: HandlerRegistry,
    private readonly meter?: SeamMeter,
  ) {}

  beginCommit(): void {
    this.pendingMutations = []
  }

  private serializeSubtree(node: InternalNode | TextNode): UINode | null {
    if (this.meter) this.meter.nodesIntoMutations += 1

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
    if (this.meter) this.meter.mutationsEmitted += mutations.length
    return mutations
  }
}

/**
 * `packages/react-renderer/src/reconciler/bridge.ts`, field for field, plus
 * `onError` — which the real main controller wires to its error subscribers.
 */
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

/** Set by the controller so `resetAfterCommit` can count commits. */
let commitMeter: SeamMeter | null = null

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
    throw new Error("[step12] plugin root must be a single element")
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
    if (commitMeter) commitMeter.commits += 1
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

/** Step 03 explains this seam: the 0.33 runtime and its published types disagree. */
interface SynchronousReconciler {
  flushSyncFromReconciler<Result>(callback: () => Result): Result
  flushPassiveEffects(): boolean
}
const sync = reconciler as typeof reconciler & SynchronousReconciler

type OpaqueRoot = ReturnType<typeof reconciler.createContainer>

const containers = new WeakMap<RenderBridge, OpaqueRoot>()

/**
 * `render(element, bridge)` and `unmount(bridge)` are the two functions the real
 * controller imports from `@uniview/react-renderer` — the import that couples
 * `host-sdk` to React (finding 1). They are reproduced here so section 6 can
 * call exactly what the real file calls.
 *
 * The `flushSyncFromReconciler` wrapper is the learn harness's stand-in for a
 * browser's scheduler, exactly as in step 05's `renderInto`. Without a DOM
 * there is no paint to schedule against and a plain `updateContainer` would
 * leave the commit pending past the end of the process.
 */
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
// 4. Host side, carried forward from steps 02/07
// ===========================================================================
//
// `MutableTree`, unchanged in behaviour, plus one public counter so section 9.4
// can see how many index rebuilds the full-tree backstop costs. Note the two
// places that keep node objects BY REFERENCE (`applyAppendChild`,
// `applyInsertBefore`): on the main thread that means the host ends up holding
// the very object the plugin's collector built. Section 9.3 checks it.

class MutableTree {
  private tree: UINode | null = null
  private nodeIndex: Map<string, UINode> = new Map()
  private parentIndex: Map<string, string> = new Map()
  private readonly onError: (message: string) => void
  /** Teaching apparatus, not on the real class. */
  private readonly meter?: SeamMeter

  constructor(onError: (message: string) => void = (m) => console.error(m), meter?: SeamMeter) {
    this.onError = onError
    this.meter = meter
  }

  init(tree: UINode | null): void {
    this.tree = tree
    this.rebuildIndex()
  }

  getTree(): UINode | null {
    return this.tree
  }

  applyMutations(mutations: Mutation[]): UINode | null {
    for (const mutation of mutations) this.applyMutation(mutation)
    return this.tree ? { ...this.tree } : null
  }

  private applyMutation(mutation: Mutation): void {
    switch (mutation.type) {
      case "setRoot":
        this.tree = mutation.node
        this.rebuildIndex()
        break
      case "appendChild":
        this.applyAppendChild(mutation)
        break
      case "insertBefore":
        this.applyInsertBefore(mutation)
        break
      case "removeChild":
        this.applyRemoveChild(mutation)
        break
      case "setText":
        this.applySetText(mutation)
        break
      case "setProps":
        this.applySetProps(mutation)
        break
    }
  }

  private rebuildIndex(): void {
    if (this.meter) this.meter.indexRebuilds += 1
    this.nodeIndex.clear()
    this.parentIndex.clear()
    if (this.tree) this.indexNode(this.tree, null)
  }

  private indexNode(node: UINode, parentId: string | null): void {
    this.nodeIndex.set(node.id, node)
    if (parentId !== null) this.parentIndex.set(node.id, parentId)
    else this.parentIndex.delete(node.id)
    for (const child of node.children) {
      if (typeof child !== "string") this.indexNode(child, node.id)
    }
  }

  private unindexNode(node: UINode): void {
    this.nodeIndex.delete(node.id)
    this.parentIndex.delete(node.id)
    for (const child of node.children) {
      if (typeof child !== "string") this.unindexNode(child)
    }
  }

  private replaceNode(targetId: string, newNode: UINode): void {
    this.nodeIndex.set(targetId, newNode)

    let childId = targetId
    let childNode = newNode
    while (this.tree && this.tree.id !== childId) {
      const parentId = this.parentIndex.get(childId)
      if (parentId === undefined) return
      const parent = this.nodeIndex.get(parentId)
      if (!parent) return

      const currentChildId = childId
      const newParent: UINode = {
        ...parent,
        children: parent.children.map((child) =>
          typeof child !== "string" && child.id === currentChildId ? childNode : child,
        ),
      }
      this.nodeIndex.set(parentId, newParent)
      childId = parentId
      childNode = newParent
    }

    if (this.tree && this.tree.id === childId) this.tree = childNode
  }

  private detachExistingNode(nodeId: string): void {
    const parentId = this.parentIndex.get(nodeId)
    if (parentId === undefined) return
    const parent = this.nodeIndex.get(parentId)
    if (!parent) return

    const newParent: UINode = {
      ...parent,
      children: parent.children.filter(
        (child) => typeof child === "string" || child.id !== nodeId,
      ),
    }
    this.parentIndex.delete(nodeId)
    this.replaceNode(parentId, newParent)
  }

  private applyAppendChild(mutation: AppendChildMutation): void {
    this.detachExistingNode(mutation.node.id)
    const parent = this.nodeIndex.get(mutation.parentId)
    if (!parent) return

    const newParent: UINode = { ...parent, children: [...parent.children, mutation.node] }
    this.indexNode(mutation.node, mutation.parentId)
    this.replaceNode(mutation.parentId, newParent)
  }

  private applyInsertBefore(mutation: InsertBeforeMutation): void {
    this.detachExistingNode(mutation.node.id)
    const parent = this.nodeIndex.get(mutation.parentId)
    if (!parent) return

    let insertIndex = -1
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i]
      if (typeof child !== "string" && child.id === mutation.beforeId) {
        insertIndex = i
        break
      }
    }
    if (insertIndex === -1) {
      this.onError(
        `[uniview] insertBefore anchor ${mutation.beforeId} not found under ` +
          `${mutation.parentId}; appending instead (tree state diverged)`,
      )
      insertIndex = parent.children.length
    }

    const newChildren = [...parent.children]
    newChildren.splice(insertIndex, 0, mutation.node)
    this.indexNode(mutation.node, mutation.parentId)
    this.replaceNode(mutation.parentId, { ...parent, children: newChildren })
  }

  private applyRemoveChild(mutation: RemoveChildMutation): void {
    const parent = this.nodeIndex.get(mutation.parentId)
    if (!parent) return

    const newChildren = parent.children.filter((child) => {
      if (typeof child === "string") return true
      if (child.id === mutation.nodeId) {
        this.unindexNode(child)
        return false
      }
      return true
    })
    this.replaceNode(mutation.parentId, { ...parent, children: newChildren })
  }

  private applySetText(mutation: SetTextMutation): void {
    const node = this.nodeIndex.get(mutation.nodeId)
    if (!node) {
      this.onError(`[uniview] setText target ${mutation.nodeId} not found (tree diverged)`)
      return
    }
    this.replaceNode(mutation.nodeId, { ...node, text: mutation.text })
  }

  private applySetProps(mutation: SetPropsMutation): void {
    const node = this.nodeIndex.get(mutation.nodeId)
    if (!node) return
    this.replaceNode(mutation.nodeId, { ...node, props: mutation.props })
  }
}

// ===========================================================================
// 5. The seam itself, carried forward from step 07
// ===========================================================================

export type HostMode = "worker" | "websocket" | "main"

/**
 * `packages/host-sdk/src/types.ts`, member for member. Step 07 introduced it as
 * an interface with a scripted stand-in behind it. This step is the first of
 * three REAL implementations.
 *
 * Read `executeHandler` and `getStatus` together and the design intent is
 * visible: the return type is a `Promise` no matter where the plugin runs, and
 * `getStatus().mode` is the ONLY member that tells a host the difference. Every
 * other member is deliberately silent about it.
 */
export interface PluginController {
  connect(): Promise<void>
  disconnect(): Promise<void>
  updateProps(props: JSONValue): Promise<void>
  executeHandler(handlerId: HandlerId, args?: JSONValue[]): Promise<void>
  destroy(): Promise<void>
  syncTree(): Promise<void>
  getStatus(): { mode: HostMode; connected: boolean; lastError?: string }
  getTree(): UINode | null
  subscribe(cb: (tree: UINode | null) => void): () => void
  subscribeErrors?(cb: (message: string) => void): () => void
}

// ===========================================================================
// 6. NEW — createMainController: the real file, distilled
// ===========================================================================
//
// This is `packages/host-sdk/src/controllers/main.ts` with the same structure:
// a closure over eight locals, returning an object literal that IS the
// `PluginController`. Everything the real one does is here. Two things were
// added, both flagged:
//
//   - `meter` / `boundary`, the instrument from section 2;
//   - `fullTreeBackstop`, a knob the real options object does NOT have. In the
//     real code the backstop is unconditional in incremental mode
//     (controllers/main.ts:57-65), so `fullTreeBackstop: true` is the faithful
//     setting and section 9.4 turns it off only to measure what it costs.

export interface MainControllerOptions {
  App: ComponentType<unknown>
  initialProps?: JSONValue
  mode?: "full" | "incremental"
  /** Teaching knob. Not in `MainControllerOptions` upstream — see finding 2. */
  fullTreeBackstop?: boolean
  meter?: SeamMeter
  boundary?: Boundary
}

export function createMainController(opts: MainControllerOptions): PluginController {
  const {
    App,
    initialProps,
    mode = "full",
    fullTreeBackstop = true,
    meter = new SeamMeter(),
    boundary = noBoundary(),
  } = opts

  let bridge: RenderBridge | null = null
  let currentElement: ReactElement | null = null
  let handlerRegistry: HandlerRegistry | null = null
  let mutationCollector: MutationCollector | null = null
  let tree: UINode | null = null
  let mutableTree = new MutableTree(undefined, meter)
  let connected = false
  let lastError: string | undefined
  const subscribers = new Set<(tree: UINode | null) => void>()
  const errorSubscribers = new Set<(message: string) => void>()

  /**
   * The only place a payload changes hands. On the main thread `cross` returns
   * the identical object and `boundary.bytes` stays at 0 forever; steps 13 and
   * 14 replace this one call with structured clone and a socket write, and
   * NOTHING ELSE in this file has to change. That is the whole shape of the
   * seam, in three lines.
   */
  const notify = (next: UINode | null): void => {
    meter.notifications += 1
    const delivered = boundary.cross(next)
    subscribers.forEach((cb) => void cb(delivered))
  }

  return {
    async connect() {
      handlerRegistry = new HandlerRegistry()
      bridge = createRenderBridge()
      bridge.onError = (error: unknown) => {
        lastError = error instanceof Error ? error.message : String(error)
        const message = lastError
        errorSubscribers.forEach((cb) => void cb(message))
      }
      commitMeter = meter

      if (mode === "incremental") {
        mutationCollector = new MutationCollector(handlerRegistry, meter)
        bridge.mutationCollector = mutationCollector

        bridge.subscribeMutations((mutations: Mutation[]) => {
          // A Worker controller would post `mutations` here. This one applies
          // the very array the collector built, with the very node objects
          // inside it.
          hop("controller", `${mutations.length} mutation(s) applied by reference`)
          tree = mutableTree.applyMutations(boundary.cross(mutations))
          notify(tree)
        })

        // FINDING 2. The full-tree channel is subscribed IN ADDITION, so every
        // commit re-serializes the entire tree and overwrites the result of the
        // mutation path above. `react-runtime`'s incremental branch has no
        // equivalent (runtime.ts:150-160) — it cannot afford one, because for
        // it "re-serialize the whole tree" means "put the whole UI on the wire".
        if (fullTreeBackstop) {
          bridge.subscribe(() => {
            if (!bridge || !handlerRegistry) return
            hop("controller", "BACKSTOP: whole tree re-serialized, overwriting the above")
            tree = serializeTree(bridge.rootInstance, handlerRegistry, meter)
            mutableTree.init(tree)
            notify(tree)
          })
        }
      } else {
        bridge.subscribe(() => {
          if (!bridge || !handlerRegistry) return
          tree = serializeTree(bridge.rootInstance, handlerRegistry, meter)
          notify(tree)
        })
      }

      currentElement = createElement(App, (initialProps ?? {}) as object)
      render(currentElement, bridge)
      connected = true
    },

    async disconnect() {
      if (bridge) {
        // "in main-thread mode the plugin runs in the host page — dropping
        // references without unmounting leaked live effects/timers directly
        // into the host for every connect/disconnect cycle."
        // (controllers/main.ts:84-86 — a comment that only makes sense in a
        // controller with no boundary.)
        unmount(bridge)
      }
      bridge = null
      currentElement = null
      handlerRegistry?.clear()
      handlerRegistry = null
      mutationCollector = null
      connected = false
      tree = null
      mutableTree = new MutableTree(undefined, meter)
      commitMeter = null
    },

    async updateProps(props: JSONValue) {
      if (!bridge || !currentElement) return
      const newElement = createElement(
        (currentElement as unknown as { type: ComponentType<unknown> }).type,
        (props ?? {}) as object,
      )
      currentElement = newElement
      render(newElement, bridge)
    },

    async executeHandler(handlerId: HandlerId, args?: JSONValue[]) {
      if (!handlerRegistry) return
      meter.handlerCalls += 1
      hop("controller", "handlerRegistry.execute — a direct call, nothing posted")
      const started = performance.now()
      // The real line is `await handlerRegistry.execute(handlerId, ...)`. The
      // `flushSyncFromReconciler` wrapper is the harness's stand-in for a
      // browser scheduler (same reason as `render` above): it makes the commit
      // that the handler's setState triggers land inside this call instead of a
      // later task. What it does NOT do is make anything synchronous that was
      // not already — `handler(...args)` is a direct call either way. In Worker
      // mode no wrapper can achieve this, because the transport itself is async.
      let pending: Promise<unknown> | undefined
      const registry = handlerRegistry
      sync.flushSyncFromReconciler(() => {
        pending = registry.execute(handlerId, ...(args ?? []))
      })
      sync.flushPassiveEffects()
      await pending
      meter.handlerLatenciesMs.push(performance.now() - started)
    },

    async destroy() {
      await this.disconnect()
      subscribers.clear()
      errorSubscribers.clear()
    },

    async syncTree(): Promise<void> {
      // Note how little this has to do. The Worker controller's `syncTree`
      // is an RPC that makes the plugin re-serialize and push its whole tree
      // back; here the tree is already a local variable.
      if (!connected) return
      notify(tree)
    },

    getTree() {
      return tree
    },

    subscribe(cb: (tree: UINode | null) => void): () => void {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },

    subscribeErrors(cb: (message: string) => void) {
      errorSubscribers.add(cb)
      return () => {
        errorSubscribers.delete(cb)
      }
    },

    getStatus(): { mode: HostMode; connected: boolean; lastError?: string } {
      return {
        mode: "main",
        connected,
        ...(lastError !== undefined ? { lastError } : {}),
      }
    },
  }
}

// ===========================================================================
// 7. NEW — the same controller with the framework lifted out (finding 1)
// ===========================================================================
//
// `createMainController` above is faithful, and being faithful means being
// React-only: `opts.App` is a `ComponentType`, and `createElement` / `render` /
// `MutationCollector` / `serializeTree` all come from the React renderer.
//
// The interface it returns has no such problem. `PluginController` mentions
// `UINode`, `Mutation`, `HandlerId` and nothing else — exactly the protocol.
// So the coupling is not in the seam, it is in the CONSTRUCTOR, and one small
// interface removes it: whatever can mount itself and push mutations at a sink
// can be a main-thread plugin.

/** What the controller actually needs from a plugin. No framework appears here. */
interface PluginSink {
  emitMutations(mutations: Mutation[]): void
  emitTree(tree: UINode | null): void
  reportError(error: unknown): void
}

interface PluginSource {
  readonly framework: string
  mount(sink: PluginSink, props: JSONValue): void
  updateProps(props: JSONValue): void
  executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>
  /** Re-serialize and re-emit everything — the drift escape hatch. */
  syncTree(): void
  unmount(): void
}

export function createMainControllerFromSource(opts: {
  source: PluginSource
  initialProps?: JSONValue
  meter?: SeamMeter
  boundary?: Boundary
}): PluginController {
  const { source, initialProps = null, meter = new SeamMeter(), boundary = noBoundary() } = opts

  let tree: UINode | null = null
  let mutableTree = new MutableTree(undefined, meter)
  let connected = false
  let lastError: string | undefined
  const subscribers = new Set<(tree: UINode | null) => void>()
  const errorSubscribers = new Set<(message: string) => void>()

  const notify = (next: UINode | null): void => {
    meter.notifications += 1
    const delivered = boundary.cross(next)
    subscribers.forEach((cb) => void cb(delivered))
  }

  const sink: PluginSink = {
    emitMutations(mutations) {
      meter.mutationsEmitted += mutations.length
      tree = mutableTree.applyMutations(boundary.cross(mutations))
      notify(tree)
    },
    emitTree(next) {
      tree = boundary.cross(next)
      mutableTree.init(tree)
      notify(tree)
    },
    reportError(error) {
      lastError = error instanceof Error ? error.message : String(error)
      const message = lastError
      errorSubscribers.forEach((cb) => void cb(message))
    },
  }

  return {
    async connect() {
      source.mount(sink, initialProps)
      connected = true
    },
    async disconnect() {
      source.unmount()
      connected = false
      tree = null
      mutableTree = new MutableTree(undefined, meter)
    },
    async updateProps(props: JSONValue) {
      source.updateProps(props)
    },
    async executeHandler(handlerId: HandlerId, args?: JSONValue[]) {
      meter.handlerCalls += 1
      const started = performance.now()
      await source.executeHandler(handlerId, args ?? [])
      meter.handlerLatenciesMs.push(performance.now() - started)
    },
    async destroy() {
      await this.disconnect()
      subscribers.clear()
      errorSubscribers.clear()
    },
    async syncTree() {
      if (!connected) return
      source.syncTree()
    },
    getTree: () => tree,
    subscribe(cb) {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },
    subscribeErrors(cb) {
      errorSubscribers.add(cb)
      return () => {
        errorSubscribers.delete(cb)
      }
    },
    getStatus: () => ({
      mode: "main" as const,
      connected,
      ...(lastError !== undefined ? { lastError } : {}),
    }),
  }
}

// ===========================================================================
// 8. The host — step 07/08's outline host, trimmed
// ===========================================================================
//
// Recursive dispatch, five branches, one registry, `Unknown: <type>` fallback.
// The ONLY line in it that mentions where the plugin runs is the one that says
// it does not care.

interface ComponentMetadata {
  version?: string
}

interface ComponentRegistry<T = unknown> {
  register(type: string, component: T, metadata?: ComponentMetadata): void
  get(type: string): T | undefined
  has(type: string): boolean
  list(): string[]
  clear(): void
}

function createComponentRegistry<T>(): ComponentRegistry<T> {
  const entries = new Map<string, { component: T; metadata?: ComponentMetadata }>()
  return {
    register: (type, component, metadata) => void entries.set(type, { component, metadata }),
    get: (type) => entries.get(type)?.component,
    has: (type) => entries.has(type),
    list: () => Array.from(entries.keys()),
    clear: () => entries.clear(),
  }
}

const handlerEventName = (propKey: string): string | null => {
  const match = /^_on([A-Z][A-Za-z]*)HandlerId$/.exec(propKey)
  return match ? match[1].toLowerCase() : null
}

type OutlineComponent = (node: UINode, attrs: string, childLines: string[]) => string[]

interface OutlineHost {
  name: string
  registry: ComponentRegistry<OutlineComponent>
  render(tree: UINode | null): string[]
  /** The handler ids the last render bound, keyed by "<nodeId> <event>". */
  bindings: Map<string, HandlerId>
  renders: number
}

function createOutlineHost(): OutlineHost {
  const registry = createComponentRegistry<OutlineComponent>()
  const bindings = new Map<string, HandlerId>()

  const container: OutlineComponent = (node, attrs, childLines) => [
    `<${node.type}${attrs}>`,
    ...childLines.map((l) => "  " + l),
    `</${node.type}>`,
  ]
  registry.register("column", container, { version: "1.0.0" })
  registry.register("row", container)
  registry.register("heading", container)
  registry.register("label", container)

  function serializeAttrs(node: UINode): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(node.props)) {
      const event = handlerEventName(key)
      if (event !== null) {
        // The host does not receive a function. It receives a STRING, and binds
        // it to a call back into the controller. That is true on the main
        // thread too, where the function was right there the whole time — the
        // contract does not get relaxed just because the boundary vanished.
        bindings.set(`${node.id} ${event}`, String(value))
        parts.push(`on:${event}=${nativeStringify(value)}`)
        continue
      }
      parts.push(`${key}=${nativeStringify(value)}`)
    }
    return parts.length > 0 ? " " + parts.join(" ") : ""
  }

  function renderNode(node: UINode | string): string[] {
    if (typeof node === "string") return [node]
    if (node.type === TEXT_NODE_TYPE) return [node.text ?? ""]

    const attrs = serializeAttrs(node)
    const childLines = node.children.flatMap(renderNode)

    if (isLayoutTag(node.type)) {
      if (childLines.length === 0) return [`<${node.type}${attrs} />`]
      return [`<${node.type}${attrs}>`, ...childLines.map((l) => "  " + l), `</${node.type}>`]
    }

    const component = registry.get(node.type)
    if (component) return component(node, attrs, childLines)
    return [`Unknown: ${node.type}`]
  }

  const host: OutlineHost = {
    name: "outline host (string tree, recursive)",
    registry,
    bindings,
    renders: 0,
    render(tree) {
      host.renders += 1
      bindings.clear()
      return tree ? renderNode(tree) : ["(no tree)"]
    },
  }
  return host
}

/**
 * The host's event dispatcher. Deliberately a NAMED top-level function so that
 * section 9.2 can look for its frame in a stack captured inside the plugin's
 * closure. In a Worker there is no such frame to find.
 */
async function dispatchHostEvent(
  controller: PluginController,
  handlerId: HandlerId,
  args: JSONValue[] = [],
): Promise<void> {
  await controller.executeHandler(handlerId, args)
}

// ===========================================================================
// 9. The plugin
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

/** Teaching apparatus: the hop recorder. */
interface Hop {
  t: number
  where: "host" | "controller" | "plugin"
  what: string
}
let hops: Hop[] | null = null
let pluginStack: string | null = null

function hop(where: Hop["where"], what: string): void {
  if (hops !== null) hops.push({ t: performance.now(), where, what })
}

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
    hop("plugin", `closure runs: setRows(rows => rows.filter(r => r.id !== "${id}"))`)
    setRows((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const onRefresh = useCallback(() => {
    // The stack captured here is the proof that no boundary was crossed: it
    // still contains the host's own `dispatchHostEvent` frame.
    pluginStack = new Error("stack probe").stack ?? ""
    hop("plugin", "closure runs: setRefreshes(n => n + 1)")
    setRefreshes((n) => n + 1)
  }, [])

  return createElement(
    "column",
    { gap: 8, padding: 16 },
    createElement("heading", { level: 2 }, title ?? "Open tickets"),
    createElement("label", { id: "status" }, `${rows.length} open · ${refreshes} refreshes`),
    ...rows.map((row) => createElement(Row, { key: row.id, row, onDismiss })),
    createElement("button", { title: "refresh", onClick: onRefresh }, "Refresh"),
  )
}

// ===========================================================================
// 10. A NON-React plugin, for finding 1
// ===========================================================================
//
// Real Solid reactivity — `createSignal` / `createRenderEffect` — driving the
// same protocol. There is no VDOM, no commit phase and no reconciler: a signal
// write re-runs one effect, and that effect pushes one `setText`. Step 06 is
// the full universal renderer; all that is needed here is a plugin that is
// genuinely NOT React, so that section 9.6's question has a real answer.

function createSolidTicketSource(): PluginSource {
  let sink: PluginSink | null = null
  let dispose: (() => void) | null = null
  let setRefreshes: ((n: (prev: number) => number) => void) | null = null
  let currentTitle = "Open tickets"
  let currentTree: UINode | null = null

  const text = (id: string, content: string): UINode => ({
    id,
    type: TEXT_NODE_TYPE,
    props: {},
    children: [],
    text: content,
  })

  const build = (title: string, status: string): UINode => ({
    id: "s-col",
    type: "column",
    props: { gap: 8, padding: 16 },
    children: [
      { id: "s-h", type: "heading", props: { level: 2 }, children: [text("s-h-t", title)] },
      { id: "s-st", type: "label", props: { id: "status" }, children: [text("s-st-t", status)] },
      {
        id: "s-btn",
        type: "button",
        props: { title: "refresh", _onClickHandlerId: "s-btn:onClick" },
        children: [text("s-btn-t", "Refresh")],
      },
    ],
  })

  return {
    framework: "solid",

    mount(nextSink, props) {
      sink = nextSink
      const initial = props !== null && typeof props === "object" && !Array.isArray(props)
        ? props.title
        : undefined
      if (typeof initial === "string") currentTitle = initial

      createRoot((disposeFn: () => void) => {
        dispose = disposeFn
        const [refreshes, setter] = createSignal(0)
        setRefreshes = setter as (n: (prev: number) => number) => void

        let first = true
        createRenderEffect(() => {
          const status = `3 open · ${refreshes()} refreshes`
          if (first) {
            first = false
            currentTree = build(currentTitle, status)
            sink?.emitMutations([{ type: "setRoot", node: currentTree }])
            return
          }
          // Fine-grained: one signal, one text node, one mutation. No tree was
          // walked and nothing was diffed to discover that.
          sink?.emitMutations([{ type: "setText", nodeId: "s-st-t", text: status }])
        })
      })
    },

    updateProps(props) {
      if (props === null || typeof props !== "object" || Array.isArray(props)) return
      const next = props.title
      if (typeof next !== "string" || next === currentTitle) return
      currentTitle = next
      sink?.emitMutations([{ type: "setText", nodeId: "s-h-t", text: next }])
    },

    async executeHandler(handlerId) {
      if (handlerId !== "s-btn:onClick") return
      // Outside a batch, a Solid signal write runs its render effects
      // synchronously — no scheduler wrapper needed, unlike React above.
      setRefreshes?.((n) => n + 1)
    },

    syncTree() {
      if (currentTree) sink?.emitTree(currentTree)
    },

    unmount() {
      dispose?.()
      dispose = null
      sink = null
    },
  }
}

// ===========================================================================
// 11. Run it
// ===========================================================================

const pad = (s: string | number, n: number): string => String(s).padStart(n)
const line = (s: string, n = 74): string => s + " ".repeat(Math.max(0, n - s.length))

/**
 * Warm-up. Every timing below is a first-call timing otherwise: V8 has not
 * compiled `flushSyncFromReconciler`, the reconciler has not allocated its
 * pools, and the "µs" story turns into a milliseconds-of-JIT story. One
 * throwaway mount + click + destroy, printed nowhere, and the numbers that
 * follow are steady-state.
 */
{
  const warmMeter = new SeamMeter()
  const warm = createMainController({
    App: TicketPanel as ComponentType<unknown>,
    mode: "incremental",
    meter: warmMeter,
  })
  const warmHost = createOutlineHost()
  const un = warm.subscribe((t) => void warmHost.render(t))
  await warm.connect()
  for (let i = 0; i < 5; i++) {
    await warm.executeHandler([...warmHost.bindings.values()].at(-1) ?? "", [])
  }
  un()
  await warm.destroy()
}

// --- 11.1 connect ----------------------------------------------------------

console.log("=== 1. connect(): a plugin mounted by a direct function call ===")

const meter = new SeamMeter()
const boundary = noBoundary()
const host = createOutlineHost()

const controller = createMainController({
  App: TicketPanel as ComponentType<unknown>,
  initialProps: { title: "Open tickets" },
  mode: "incremental",
  fullTreeBackstop: true, // the faithful setting — controllers/main.ts:57-65
  meter,
  boundary,
})

let hostLines: string[] = []
let hostTree: UINode | null = null
let hostRenders = 0

const unsubscribe = controller.subscribe((tree) => {
  hop("host", "subscriber fires -> host re-renders")
  hostRenders += 1
  hostTree = tree
  hostLines = host.render(tree)
})

console.log(`  before connect: ${nativeStringify(controller.getStatus())}`)

const connectStats = measureStringify(() => controller.connect())
await connectStats.result

console.log(`  after  connect: ${nativeStringify(controller.getStatus())}`)
console.log(`  JSON.stringify calls during connect(): ${connectStats.calls}`)
console.log(`  bytes pushed across the boundary     : ${boundary.bytes}`)
console.log("\n  the host's rendering:")
for (const l of hostLines) console.log(`    ${l}`)
console.log("\n  the handler ids the host bound (strings, not functions):")
for (const [key, id] of host.bindings) console.log(`    ${line(key, 18)} -> ${id}`)

// --- 11.2 the click, hop by hop -------------------------------------------

console.log("\n=== 2. One click, hop by hop, on one stack ===")

/** The tree as it stood at mount — section 3 measures this exact payload. */
const mountTree: UINode | null = hostTree

// The Refresh button is the LAST bound click handler in the tree.
const refreshId = [...host.bindings.values()].at(-1) ?? ""

hops = []
hop("host", `button "Refresh" clicked -> executeHandler(${nativeStringify(refreshId)})`)

const clickStats = measureStringify(() => {
  const bytesBefore = boundary.bytes
  const promise = dispatchHostEvent(controller, refreshId, [])
  return { promise, bytesBefore }
})
hop("controller", "executeHandler returned (promise still pending)")

// THE demonstration that the interface's `Promise` is a uniformity tax, not a
// statement about this transport: the host has already re-rendered with the new
// text, and we have not awaited anything yet.
const renderedBeforeAwait = hostRenders
const textBeforeAwait = hostLines.find((l) => l.includes("refreshes"))?.trim()
await clickStats.result.promise
hop("host", "await resolves (nothing left to do)")

const trace = hops
hops = null

const t0 = trace[0].t
console.log("  hop trace (t in µs from the click):")
for (const h of trace) {
  console.log(
    `    ${pad(((h.t - t0) * 1000).toFixed(1), 8)} µs  ${line(h.where, 11)}${h.what}`,
  )
}
console.log(
  "\n  Two of those hops are finding 2 showing up in a trace: the mutation batch\n" +
    "  is applied and the host renders, and then the backstop re-serializes the\n" +
    "  whole tree and the host renders AGAIN, off a tree that is equal to the one\n" +
    "  it just drew. Section 4 counts what that costs.",
)
console.log(
  `\n  JSON.stringify calls for the whole round trip : ${clickStats.calls}\n` +
    `  bytes pushed across the boundary              : ${boundary.bytes - clickStats.result.bytesBefore}\n` +
    `  boundary.messages so far                      : ${boundary.messages}` +
    `   (payloads handed over BY REFERENCE)`,
)

console.log("\n  the plugin closure's own stack, captured inside the handler:")
for (const frame of (pluginStack ?? "").split("\n").slice(0, 7)) {
  console.log(`    ${frame.trim()}`)
}
console.log(
  `\n  stack contains the host's dispatchHostEvent frame: ` +
    `${(pluginStack ?? "").includes("dispatchHostEvent")}\n` +
    "  That single boolean is what step 12 is. The plugin's closure ran on the\n" +
    "  host's own stack — no message, no queue, no copy. In steps 13 and 14 that\n" +
    "  frame is in a different thread and a different process respectively, and\n" +
    "  the boolean is necessarily false.",
)

console.log(
  `\n  host re-rendered BEFORE the await resolved: ${renderedBeforeAwait > 1}\n` +
    `  the text it already showed                : ${nativeStringify(textBeforeAwait)}\n` +
    "  `executeHandler` returns a Promise because a Worker controller must. On\n" +
    "  the main thread the entire hop chain completed inside the synchronous part\n" +
    "  of the call; the `await` had nothing left to wait for. Uniformity of the\n" +
    "  interface is bought with a microtask that this transport does not need.",
)

// --- 11.3 identity across the seam, and the baseline table ------------------

console.log("\n=== 3. What crossed the seam (and what it would have cost) ===")

// The mount payload, exactly as the collector emitted it: one `setRoot`
// carrying the whole tree. This is the largest single thing the seam ever
// carries, and it is the payload steps 13 and 14 will pay for at every
// connect.
const capturedBatch: Mutation[] = [{ type: "setRoot", node: mountTree }]

console.log(
  `  controller.getTree() === the tree the host subscriber received : ` +
    `${controller.getTree() === hostTree}`,
)
console.log(
  "  Across structured clone that comparison is false by construction — a\n" +
    "  clone is a different object. Across a socket it is not even expressible.\n" +
    "  Here it is free, which is why the main controller can hand the host its\n" +
    "  own live tree and never think about it again.",
)

const mountBytes = utf8(nativeStringify(mountTree))
const mountNodes = mountTree ? countNodes(mountTree) : 0

console.log("\n  THE BASELINE TABLE — the same mount payload, through three seams.")
console.log("  Steps 13 and 14 extend this with their real transports.\n")
console.log(
  `    ${line("boundary", 32)}${pad("bytes", 8)}${pad("stringify", 11)}${pad("µs/cross", 11)}`,
)
console.log(`    ${"-".repeat(62)}`)

const CROSSINGS = 200
for (const make of [noBoundary, cloneBoundary, jsonBoundary]) {
  // One crossing, counted.
  const counted = make()
  const { calls } = measureStringify(() => counted.cross(capturedBatch))
  // Many crossings, timed, on a fresh boundary so the byte count above stands.
  const timed = make()
  for (let i = 0; i < 20; i++) timed.cross(capturedBatch) // let V8 settle
  const started = performance.now()
  for (let i = 0; i < CROSSINGS; i++) timed.cross(capturedBatch)
  const perCross = ((performance.now() - started) * 1000) / CROSSINGS
  console.log(
    `    ${line(counted.name, 32)}${pad(counted.bytes, 8)}${pad(calls, 11)}` +
      `${pad(perCross.toFixed(2), 11)}`,
  )
}
console.log(
  `\n    payload: one setRoot carrying ${mountNodes} nodes / ${mountBytes} B of JSON.\n` +
    `    µs/cross is the mean of ${CROSSINGS} crossings after a warm-up.\n` +
    "    The clone row reports 0 stringify calls because structuredClone does not\n" +
    "    use a text serializer at all — its `bytes` figure is this file measuring\n" +
    "    it, not the transport doing work. The JSON row's stringify IS the\n" +
    "    transport.\n" +
    "\n    The first row is this step. The other two are what steps 13 and 14 pay\n" +
    "    for the identical UI, at every connect and again at every syncTree — and\n" +
    "    the mount is the SMALL case, because step 05 already made updates\n" +
    "    incremental.",
)

const latencies = meter.handlerLatenciesMs
console.log(
  `\n  handler-invocation latency (performance.now(), ${latencies.length} call(s)): ` +
    `${latencies.map((ms) => `${(ms * 1000).toFixed(1)} µs`).join(", ")}`,
)
console.log(
  "  That number includes the React commit, the mutation collection, the\n" +
    "  MutableTree apply, the full-tree backstop and the host's re-render. It\n" +
    "  contains no transport at all, which is the only reason it can be quoted in\n" +
    "  microseconds.",
)

// --- 11.4 finding 2: the full-tree backstop --------------------------------

console.log("\n=== 4. The full-tree backstop, on and off (finding 2) ===")

interface BackstopRun {
  label: string
  meter: SeamMeter
  finalTree: UINode | null
  hostRenders: number
}

async function runScript(backstop: boolean): Promise<BackstopRun> {
  const m = new SeamMeter()
  const h = createOutlineHost()
  const c = createMainController({
    App: TicketPanel as ComponentType<unknown>,
    initialProps: { title: "Open tickets" },
    mode: "incremental",
    fullTreeBackstop: backstop,
    meter: m,
    boundary: noBoundary(),
  })
  let renders = 0
  const unsub = c.subscribe((t) => {
    renders += 1
    h.render(t)
  })
  await c.connect()
  // Three interactions: refresh, refresh, dismiss the first row.
  const clickIds = [...h.bindings.values()]
  const refresh = clickIds.at(-1) ?? ""
  const firstDismiss = clickIds[0] ?? ""
  await c.executeHandler(refresh, [])
  await c.executeHandler(refresh, [])
  await c.executeHandler(firstDismiss, [])
  const finalTree = c.getTree()
  unsub()
  await c.destroy()
  return { label: backstop ? "backstop ON (real)" : "backstop OFF", meter: m, finalTree, hostRenders: renders }
}

const withBackstop = await runScript(true)
const withoutBackstop = await runScript(false)

const rowsOut: [string, (r: BackstopRun) => number | string][] = [
  ["React commits", (r) => r.meter.commits],
  ["mutations emitted", (r) => r.meter.mutationsEmitted],
  ["nodes serialized into mutations", (r) => r.meter.nodesIntoMutations],
  ["whole-tree re-serializations", (r) => r.meter.fullTreeSerializations],
  ["nodes walked by those", (r) => r.meter.nodesWalkedFullTree],
  ["MutableTree index rebuilds", (r) => r.meter.indexRebuilds],
  ["subscriber notifications", (r) => r.meter.notifications],
  ["host re-renders", (r) => r.hostRenders],
]

console.log(`  ${line("", 34)}${pad("ON (real)", 12)}${pad("OFF", 12)}`)
console.log(`  ${"-".repeat(58)}`)
for (const [label, get] of rowsOut) {
  console.log(`  ${line(label, 34)}${pad(get(withBackstop), 12)}${pad(get(withoutBackstop), 12)}`)
}

/**
 * Structural comparison with ids erased. Node ids are minted from a global
 * counter, so the second run's ids are shifted by the first run's node count —
 * a difference that says nothing about correctness. Everything else must match.
 */
function shape(node: UINode | string | null): unknown {
  if (node === null) return null
  if (typeof node === "string") return node
  const props: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node.props)) {
    props[k] = k.endsWith("HandlerId") ? "<id>" : v
  }
  return {
    type: node.type,
    props,
    text: node.text,
    children: node.children.map((c) => shape(c)),
  }
}

const sameTree =
  nativeStringify(shape(withBackstop.finalTree)) ===
  nativeStringify(shape(withoutBackstop.finalTree))
console.log(`\n  both runs ended with the identical tree (ids aside): ${sameTree}`)
console.log(
  "\n  Read the `whole-tree re-serializations` row against `mutations emitted`.\n" +
    "  With the backstop on, incremental mode does everything full mode does AND\n" +
    "  everything incremental mode does — the mutation batch is applied, then\n" +
    "  immediately overwritten by a fresh full serialization, and every subscriber\n" +
    "  is notified twice per commit. It is strictly more work than either mode\n" +
    "  alone.\n" +
    "\n  That is not a bug; it is a trade only this transport can make. The cost is\n" +
    "  CPU inside one heap, and the purchase is that drift is impossible: the\n" +
    "  host's tree is re-seeded from the plugin's live instances on every single\n" +
    "  commit, so a mis-ordered or dropped mutation (step 05 section 7) cannot\n" +
    "  survive one frame. `react-runtime`'s incremental branch has no such\n" +
    "  subscription (runtime.ts:150-160) because there the same code would mean\n" +
    "  putting the whole UI on the wire on every keystroke — which is the exact\n" +
    "  thing step 05 exists to stop doing.",
)

// --- 11.5 what is still required, what became optional ---------------------

console.log("\n=== 5. Still required vs. now unenforced ===")

console.log("\n  STILL REQUIRED — the contract does not relax:")
console.log(
  `    tree contract   the host got UINode/Mutation, not React fibers — ` +
    `${countNodes(controller.getTree() as UINode)} nodes:`,
)
for (const l of show(controller.getTree() as UINode).split("\n").slice(0, 5)) {
  console.log(`                      ${l}`)
}
console.log(`                      ... (truncated)`)
console.log(
  `    handler ids     the host bound ${host.bindings.size} STRING ids and called\n` +
    `                    executeHandler with one. The closure was reachable the\n` +
    `                    whole time and the host still never saw it.\n` +
    `    subscribe       one Set, fanned out per update — the same mechanism that\n` +
    `                    let step 07 hang two hosts off one controller.`,
)

console.log("\n  NOW UNENFORCED — nothing checks these until step 13 does:")

const probeRegistry = new HandlerRegistry()
const riskyProps: Record<string, unknown> = {
  title: "Weekly digest",
  updatedAt: new Date("2024-03-01T09:00:00.000Z"),
  retries: NaN,
  seen: new Map([["r1", 2]]),
  onOpen: () => {},
  draft: undefined,
}
const serializedRisky = serializeProps(riskyProps, probeRegistry, "probe") as Record<
  string,
  unknown
>

const describeValue = (v: unknown): string => {
  if (v === undefined) return "(absent)"
  if (v === null) return "null"
  if (v instanceof Date) return `Date(${v.toISOString().slice(0, 10)})`
  if (v instanceof Map) return `Map(size=${v.size})`
  if (typeof v === "number" && Number.isNaN(v)) return "NaN"
  return nativeStringify(v)
}

const viaWorker = structuredClone(serializedRisky)
const viaSocket = JSON.parse(nativeStringify(serializedRisky)) as Record<string, unknown>

console.log(
  `    ${line("prop", 20)}${line("step 12 (main)", 22)}${line("step 13 (clone)", 22)}step 14 (JSON)`,
)
console.log(`    ${"-".repeat(82)}`)
for (const key of ["title", "updatedAt", "retries", "seen", "_onOpenHandlerId", "draft"]) {
  console.log(
    `    ${line(key, 20)}${line(describeValue(serializedRisky[key]), 22)}` +
      `${line(describeValue(viaWorker[key]), 22)}${describeValue(viaSocket[key])}`,
  )
}
let cloneError = "(none)"
try {
  structuredClone({ onOpen: riskyProps.onOpen })
} catch (error) {
  cloneError = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
console.log(
  `\n    and a prop that is still a FUNCTION when it reaches the boundary:\n` +
    `      step 12  works — it is just a property on an object\n` +
    `      step 13  ${cloneError}\n` +
    `      step 14  silently dropped by JSON.stringify`,
)

console.log(
  "\n    Every one of those props type-checks as `JSONValue` — `serializeProps`\n" +
    "    ends with `value as JSONValue`, which is where the claim stops being\n" +
    "    checked. On the main thread nothing ever tests the claim, so a plugin\n" +
    "    can be wrong about it for months and nobody finds out.\n" +
    "\n    Then it is moved. Structured clone preserves Date, Map and NaN and\n" +
    "    THROWS on a function; JSON keeps none of them and drops the function\n" +
    "    without a word. Three transports, three different answers, and the one\n" +
    "    this step builds is the only one that never disagrees with the plugin —\n" +
    "    which is exactly why it cannot be used to validate a plugin.",
)
console.log(
  `\n    async         nothing here needed to be. Every controller method is\n` +
    `                  Promise-returning anyway, and section 2's trace showed the\n` +
    `                  work finishing before the first await.`,
)

// --- 11.6 finding 1: the coupling ------------------------------------------

console.log("\n=== 6. The interface is fine. The constructor is not. (finding 1) ===")

const solidMeter = new SeamMeter()
const solidHost = createOutlineHost()
const solidController = createMainControllerFromSource({
  source: createSolidTicketSource(),
  initialProps: { title: "Open tickets (Solid)" },
  meter: solidMeter,
})

let solidLines: string[] = []
const unsubSolid = solidController.subscribe((t) => {
  solidLines = solidHost.render(t)
})

await solidController.connect()
const solidRefreshId = [...solidHost.bindings.values()].at(-1) ?? ""
await solidController.executeHandler(solidRefreshId, [])
await solidController.updateProps({ title: "Solid, same seam" })

console.log("  a Solid plugin, through the SAME PluginController interface:")
for (const l of solidLines) console.log(`    ${l}`)
console.log(`\n  getStatus() -> ${nativeStringify(solidController.getStatus())}`)
console.log(
  `  the host code above is byte-identical for both plugins: ` +
    `createOutlineHost + subscribe + executeHandler.`,
)

console.log(
  "\n  So what actually blocks a Solid plugin on the main thread today?\n" +
    "\n    createMainController(opts: { App: ComponentType<unknown>, ... })\n" +
    "                                     ^^^^^^^^^^^^^^^^^^^^^^\n" +
    "  A React type, in the signature, of a package whose own description reads\n" +
    '  "Framework-agnostic host SDK for the Uniview plugin system". Below the\n' +
    "  signature it calls createElement(App, props) and render(element, bridge)\n" +
    "  from @uniview/react-renderer, which host-sdk lists under `dependencies` —\n" +
    "  not peerDependencies, not optional. Passing a Solid component is not a\n" +
    "  runtime bug you can catch; it does not type-check, and if it did,\n" +
    "  react-reconciler would be asked to render something that is not a fiber.",
)
console.log(
  "\n  The evidence, all in the repository today:\n" +
    "    packages/host-sdk/src/controllers/main.ts:1     import ... from \"react\"\n" +
    "    packages/host-sdk/src/controllers/main.ts:5-12  import ... from \"@uniview/react-renderer\"\n" +
    "    packages/host-sdk/package.json                 \"Framework-agnostic host SDK\",\n" +
    "                                                   dependencies: @uniview/react-renderer\n" +
    "    packages/solid-runtime/src/                    worker-entry.ts, ws-client-entry.ts\n" +
    "                                                   — and no main-thread entry at all\n" +
    "    CLAUDE.md:184                                  NEVER couple host-sdk to specific\n" +
    "                                                   framework - must remain framework-agnostic\n" +
    "\n  The consequence is concrete and it is a Stage D consequence: a Solid\n" +
    "  plugin can reach a host through a Worker or a WebSocket, and cannot reach\n" +
    "  one on the main thread. The three runtimes are not actually interchangeable\n" +
    "  for both authoring frameworks — which is the one property Stage D claims.\n" +
    "  Section 7's `PluginSource` is 12 lines and mentions no framework; it is\n" +
    "  what the fix looks like, not a redesign.",
)

unsubSolid()
await solidController.destroy()

// --- 11.7 teardown and summary ---------------------------------------------

console.log("\n=== 7. disconnect(), and the baseline steps 13/14 are measured against ===")

await controller.updateProps({ title: "Open tickets (updated)" })
console.log(`  updateProps -> heading text now: ${nativeStringify(hostLines[2]?.trim())}`)

await controller.syncTree()
console.log(`  syncTree()  -> host renders so far: ${hostRenders}`)

unsubscribe()
await controller.destroy()
console.log(`  after destroy(): ${nativeStringify(controller.getStatus())}`)

// Restore the global we patched in section 2, so nothing downstream inherits it.
JSON.stringify = nativeStringify

console.log(
  "\n  THE BASELINE\n" +
    `    bytes serialized on the hot path : ${boundary.bytes}\n` +
    `    payloads handed over by reference: ${boundary.messages}\n` +
    `    JSON.stringify calls, connect    : ${connectStats.calls}\n` +
    `    JSON.stringify calls, full click : ${clickStats.calls}\n` +
    `    handler latency                  : ` +
    `${latencies.map((ms) => `${(ms * 1000).toFixed(1)} µs`).join(", ")}\n` +
    `    host's tree === plugin's tree    : object identity, not deep equality`,
)
console.log(
  "\n  Every one of those numbers is zero or microseconds, and none of them is\n" +
    "  zero by accident — `boundary.cross` is a real call on the real path that\n" +
    "  happens to be the identity function. Step 13 replaces it with structured\n" +
    "  clone and step 14 with a socket write, and the same table is printed again\n" +
    "  with numbers in it. That is the point of building the cheapest one first:\n" +
    "  the Worker's cost is not 'some serialization', it is exactly the delta\n" +
    "  against this page.",
)
