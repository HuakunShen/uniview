/**
 * Step 05 — Incremental mutations: from "send the whole tree" to "send what
 * changed", and why the first one is fatal.
 *
 * Step 04 ended with a plugin that could serialize its live host tree into a
 * JSON-safe `UINode`. It re-serialized ALL of it on every commit, which is
 * correct and — the moment the plugin is not in the same JS heap as the host —
 * unusable:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  full mode        updateTree(wholeTree)      O(size of the UI)       │
 *   │  incremental      applyMutations([...])      O(what actually changed)│
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Step 01 printed that comparison as a hypothetical, on a hand-written tree.
 * This step makes it real: a `MutationCollector` is wired into step 04's host
 * config, so the reconciler's own callbacks (`insertBefore`, `removeChild`,
 * `commitTextUpdate`, …) EMIT the six mutation kinds as React commits them.
 *
 * Four things have to be true for that to be a good trade, and each one gets a
 * section below:
 *
 *   1. The mutations must be smaller than the tree, and more so as the UI grows
 *      (sections 2-4, and the table in section 6).
 *   2. The host, fed nothing but those mutations, must end up with EXACTLY the
 *      plugin's tree. Every update is asserted with a deep-equality check.
 *      Drift is the failure mode this whole design exists to avoid, and it is
 *      silent: the host does not know its tree is wrong.
 *   3. Handlers must still be released. In full mode `serializeTree`'s
 *      `beginSweep`/`endSweep` bracket freed the handlers of any node that
 *      vanished, because a whole-tree walk can *see* what is gone. Nothing
 *      walks the whole tree any more, so removal has to say so explicitly —
 *      `MutationCollector.cleanupHandlers`, called from `collectRemoveChild`.
 *      Section 5 runs a registry that skips that call, side by side.
 *   4. When drift happens anyway — a dropped batch, a host that connected late
 *      — there must be a way back. That is `syncTree()`: re-serialize
 *      everything and re-seed the host. Section 7 breaks the stream on purpose
 *      and repairs it.
 */

import { createElement, createContext, memo } from "react"
import ReactReconciler from "react-reconciler"
import type { HostConfig, ReactContext } from "react-reconciler"
import {
  ConcurrentRoot,
  DefaultEventPriority,
  NoEventPriority,
} from "react-reconciler/constants"

// ---------------------------------------------------------------------------
// 1. The protocol, copied forward from steps 01 and 04
// ---------------------------------------------------------------------------
// Every step stands alone (see learn/RULES.md), so the contract is re-declared
// here rather than imported. `UINode` and `JSONValue` are unchanged since step
// 01; the six `Mutation` kinds are step 01's, verbatim, and are the reason this
// step exists at all.

export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue }

const TEXT_NODE_TYPE = "#text"

export interface UINode {
  id: string
  type: string
  props: Record<string, JSONValue>
  children: (UINode | string)[]
  text?: string
}

/** Append a child. A host must treat this as a MOVE when the id already exists. */
export interface AppendChildMutation {
  type: "appendChild"
  parentId: string
  node: UINode
}

/** Insert before a reference node. Also a MOVE when the id already exists. */
export interface InsertBeforeMutation {
  type: "insertBefore"
  parentId: string
  node: UINode
  beforeId: string
}

/** Remove a child, addressed by its own stable id. */
export interface RemoveChildMutation {
  type: "removeChild"
  parentId: string
  nodeId: string
}

/** Change a text node's content, addressed by node id. */
export interface SetTextMutation {
  type: "setText"
  nodeId: string
  text: string
}

/** Replace *all* props of an element node. Full props, not a diff. */
export interface SetPropsMutation {
  type: "setProps"
  nodeId: string
  props: Record<string, JSONValue>
}

/** Set or replace the whole root. First render, and full-root replacements. */
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

export type HandlerId = string

/** Step 04's printer, unchanged. */
function show(node: UINode | string, depth = 0): string {
  const pad = "  ".repeat(depth)
  if (typeof node === "string") return `${pad}"${node}" (legacy bare string)`
  if (node.type === TEXT_NODE_TYPE) return `${pad}#text#${node.id} "${node.text}"`
  const props = Object.entries(node.props)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ")
  return [
    `${pad}<${node.type}#${node.id}${props ? " " + props : ""}>`,
    ...node.children.map((c) => show(c, depth + 1)),
  ].join("\n")
}

/** Byte size on the wire. UTF-8, because that is what a socket actually carries. */
const bytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length

/** How many nodes a serialized subtree contains — the unit of "how much got sent". */
function countNodes(node: UINode | string): number {
  if (typeof node === "string") return 1
  return 1 + node.children.reduce<number>((n, c) => n + countNodes(c), 0)
}

// ---------------------------------------------------------------------------
// 2. The live host tree and the handler registry, copied forward from step 04
// ---------------------------------------------------------------------------

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

const isTextNode = (node: InternalNode | TextNode): node is TextNode =>
  "_isTextNode" in node

let instanceCounter = 0
let textNodeCounter = 0
const generateId = (): string => `node-${instanceCounter++}`
const generateTextNodeId = (): string => `text-${textNodeCounter++}`

type Handler = (...args: unknown[]) => unknown

/**
 * Unchanged from step 04. Read `releaseNode` and the sweep pair together: this
 * step is where they stop being two ways of saying the same thing.
 *
 *   - `beginSweep`/`endSweep` are for FULL mode. A whole-tree walk knows what
 *     it visited, so it can infer what left the tree. Nothing tells it.
 *   - `releaseNode` is for INCREMENTAL mode. Nothing walks the whole tree, so
 *     the removal itself is the only place the information exists —
 *     `MutationCollector.collectRemoveChild` calls it, recursively, on the
 *     whole removed subtree.
 *
 * Delete either one and the registry leaks in exactly one of the two modes,
 * silently, forever.
 */
class HandlerRegistry {
  private handlers = new Map<HandlerId, Handler>()
  private nodeHandlers = new Map<string, Set<HandlerId>>()
  private sweepSeen: Set<string> | null = null

  syncNode(nodeId: string, next: Map<HandlerId, Handler>): void {
    this.sweepSeen?.add(nodeId)

    const prev = this.nodeHandlers.get(nodeId)
    if (prev) {
      for (const id of prev) {
        if (!next.has(id)) this.handlers.delete(id)
      }
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

  /** Release every handler owned by a node (e.g. on removeChild). */
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
    if (!handler) {
      console.warn(
        `      [plugin] executeHandler: no handler registered for "${handlerId}" ` +
          `(node unmounted or event arrived after removal)`,
      )
      return
    }
    const result = handler(...args)
    if (result instanceof Promise) return await result
    return result
  }

  has(handlerId: HandlerId): boolean {
    return this.handlers.has(handlerId)
  }

  /**
   * Drop everything. Step 04's copy left this out because full mode never
   * needs it — a final `serializeTree(null)` sweeps the registry empty.
   * Section 8 is where incremental mode discovers it cannot do that.
   */
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
 * Step 04's `serializeProps`, trimmed: the nested-function warning and the
 * cycle guard are still in the real one (and in step 04's copy) but say nothing
 * new here. Everything load-bearing is unchanged — including the fact that the
 * node's WHOLE handler set is handed to `syncNode` in one shot, which is what
 * makes a disappearing prop release its id for free.
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

/**
 * Full-tree serialization, unchanged from step 04. It has two jobs in this step
 * and both are worth naming: it is the payload full mode would have sent (the
 * number every ratio below is measured against), and it is what `syncTree()`
 * sends to repair a drifted host in section 7.
 */
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

// ---------------------------------------------------------------------------
// 3. NEW: the MutationCollector
// ---------------------------------------------------------------------------
// This is the whole step. It is a *per-commit accumulator*: the host config
// calls `beginCommit()` before React starts mutating the tree, calls one
// `collectX` per reconciler callback while React mutates it, and calls
// `flushCommit()` afterwards to get the batch. One React commit -> one array
// of mutations -> one `applyMutations` RPC.
//
// Note what it does NOT do: it never diffs anything. React already knows what
// changed — that is what a reconciler is — and the collector's only job is to
// write down the calls React was going to make anyway. A collector that diffed
// trees would be doing the reconciler's work a second time.

class MutationCollector {
  private pendingMutations: Mutation[] = []
  private handlerRegistry: HandlerRegistry
  /**
   * Teaching apparatus, not on the real class: a second registry that receives
   * every `syncNode` this collector performs but never a `releaseNode`. It is
   * "incremental mode with `cleanupHandlers` deleted" — section 5 prints its
   * size next to the real one.
   */
  private leakyRegistry: HandlerRegistry | null

  constructor(handlerRegistry: HandlerRegistry, leakyRegistry: HandlerRegistry | null = null) {
    this.handlerRegistry = handlerRegistry
    this.leakyRegistry = leakyRegistry
  }

  /** Start a new commit batch. Called from `prepareForCommit`. */
  beginCommit(): void {
    this.pendingMutations = []
  }

  /**
   * Serialize a node and its entire subtree, registering handlers as it goes.
   *
   * A mutation that inserts a node carries the node's WHOLE subtree, because
   * the host has never seen any of it. That is why `appendChild` of a big
   * subtree is not cheap — it is only cheap *relative to the whole UI*.
   */
  private serializeSubtree(node: InternalNode | TextNode): UINode | null {
    if (isTextNode(node)) {
      return {
        id: node.id,
        type: TEXT_NODE_TYPE,
        props: {},
        children: [],
        text: node.text,
      }
    }

    const serializedChildren: UINode[] = []
    for (const child of node.children) {
      const serializedChild = this.serializeSubtree(child)
      if (serializedChild !== null) serializedChildren.push(serializedChild)
    }

    // Teaching apparatus, outside the real code path: mirror the registration
    // into the leaky registry so section 5 can compare the two.
    if (this.leakyRegistry) serializeProps(node.props, this.leakyRegistry, node.id)

    return {
      id: node.id,
      type: node.type,
      props: serializeProps(node.props, this.handlerRegistry, node.id),
      children: serializedChildren,
    }
  }

  /**
   * Clean up handlers for a removed subtree. THE line that this step is about:
   * in incremental mode this is the only moment anyone learns that a node is
   * gone, so it is the only place its closures can be freed.
   *
   * It recurses, because `removeChild` names one node and unmounts a subtree.
   */
  private cleanupHandlers(node: InternalNode | TextNode): void {
    if (isTextNode(node)) return

    this.handlerRegistry.releaseNode(node.id)

    for (const child of node.children) {
      this.cleanupHandlers(child)
    }
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

    // Clean up handlers for the removed subtree. Full mode has no equivalent
    // call anywhere — it relies on the sweep instead.
    this.cleanupHandlers(child)
  }

  collectSetProps(instance: InternalNode): void {
    if (this.leakyRegistry) serializeProps(instance.props, this.leakyRegistry, instance.id)
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

  /** Hand over the batch and reset. Called from `resetAfterCommit`. */
  flushCommit(): Mutation[] {
    const mutations = this.pendingMutations
    this.pendingMutations = []
    return mutations
  }
}

// ---------------------------------------------------------------------------
// 4. NEW: the render bridge grows a second subscriber list
// ---------------------------------------------------------------------------
// Step 04's bridge was one field (`rootInstance`). The real one is a small
// pub/sub object with TWO channels, because the two modes deliver different
// things: `subscribe` says "a commit happened, go re-serialize" (full mode),
// `subscribeMutations` hands over the batch (incremental mode).

interface RenderBridge {
  rootInstance: InternalNode | null
  mutationCollector: MutationCollector | null
  subscribers: Set<() => void>
  mutationSubscribers: Set<(mutations: Mutation[]) => void>
  subscribe: (callback: () => void) => () => void
  subscribeMutations: (callback: (mutations: Mutation[]) => void) => () => void
  update: () => void
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

// ---------------------------------------------------------------------------
// 5. The HostConfig — step 04's, with one collector call per callback
// ---------------------------------------------------------------------------
// Diff this against step 04's copy: the structure is identical and every method
// grew (at most) one line. That is the point — the reconciler was already
// telling us exactly what changed, callback by callback, and full mode was
// throwing that information away and re-deriving it by walking the tree.
//
// `activeContainer` is the one piece of machinery this needs: the mutation
// callbacks (`appendChild`, `removeChild`, …) are not handed the container, so
// the host config remembers which container the current commit belongs to.

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
  never, // FormInstance
  PublicInstance,
  HostContext,
  ChildSet,
  TimeoutHandle,
  NoTimeout,
  null // TransitionStatus
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
    // Deliberately silent. This runs during the RENDER phase, while a fresh
    // subtree is being built off to the side and is not attached to anything
    // the host knows about. The subtree is captured whole when its root is
    // finally attached — by collectSetRoot or collectAppendChild. Emitting a
    // mutation here would name a parent the host has never seen.
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
    // The first commit's whole tree travels in ONE setRoot mutation. Mount
    // costs the same in both modes; only updates get cheaper.
    activeContainer?.mutationCollector?.collectSetRoot(child)
  },

  insertBefore(parent, child, beforeChild): void {
    detachFromParent(child)
    const index = parent.children.indexOf(beforeChild)
    if (index === -1) {
      // React guarantees the anchor is a child of parent; reaching this means
      // the internal tree already diverged. Append rather than drop the node.
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
    throw new Error("[step05] plugin root must be a single element")
  },

  removeChild(parent, child): void {
    const index = parent.children.indexOf(child)
    if (index !== -1) {
      parent.children.splice(index, 1)
      child.parent = null
      // In step 04 this method had a comment explaining why there was no
      // registry call here. This is that call: collectRemoveChild emits the
      // mutation AND releases the removed subtree's handlers.
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

  // The commit bracket. Everything between these two calls belongs to one
  // batch, which is why a host never sees half of a React commit.
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
    // Full-mode subscribers are notified in BOTH modes: the bridge does not
    // know which one is in use.
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

// ---------------------------------------------------------------------------
// 6. The host side: step 02's MutableTree, verbatim in behaviour
// ---------------------------------------------------------------------------
// Comments trimmed — step 02 is where this class is explained. What matters
// here is that it is the SAME class: the mutations this step's plugin emits are
// fed to the applier step 02 wrote against hand-written mutations, and the two
// halves meet without either knowing about the other.

class MutableTree {
  private tree: UINode | null = null
  private nodeIndex: Map<string, UINode> = new Map()
  private parentIndex: Map<string, string> = new Map()
  private readonly onError: (message: string) => void

  constructor(onError: (message: string) => void = (m) => console.error(m)) {
    this.onError = onError
  }

  init(tree: UINode | null): void {
    this.tree = tree
    this.rebuildIndex()
  }

  getTree(): UINode | null {
    return this.tree
  }

  getNode(id: string): UINode | undefined {
    return this.nodeIndex.get(id)
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
      this.onError(
        `[uniview] setText target ${mutation.nodeId} not found (tree state diverged)`,
      )
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

// ---------------------------------------------------------------------------
// 7. Assertions and reporting
// ---------------------------------------------------------------------------

/** Structural equality, from step 04. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  )
}

function describeMutation(m: Mutation): string {
  switch (m.type) {
    case "setRoot":
      return m.node === null
        ? "setRoot       node=null"
        : `setRoot       node=<${m.node.type}#${m.node.id}> (${countNodes(m.node)} nodes, ${bytes(m.node)} B)`
    case "setText":
      return `setText       ${m.nodeId} = ${JSON.stringify(m.text)}`
    case "setProps":
      return `setProps      ${m.nodeId} ${JSON.stringify(m.props)}`
    case "appendChild":
      return `appendChild   parent=${m.parentId} node=<${m.node.type}#${m.node.id}> (${countNodes(m.node)} nodes)`
    case "insertBefore":
      return `insertBefore  parent=${m.parentId} before=${m.beforeId} node=<${m.node.type}#${m.node.id}> (${countNodes(m.node)} nodes)`
    case "removeChild":
      return `removeChild   parent=${m.parentId} node=${m.nodeId}`
  }
}

let checksRun = 0
let checksPassed = 0
let checksExpectedToFail = 0

// ---------------------------------------------------------------------------
// 8. The plugin: a keyed list, the shape every real UI is made of
// ---------------------------------------------------------------------------

interface RowData {
  id: string
  label: string
}

/**
 * `memo` is not decoration here — it is the difference between a mutation batch
 * proportional to what changed and one proportional to how much of the
 * component tree re-rendered.
 *
 * React 19's reconciler marks a host fiber for update whenever its props OBJECT
 * changes identity, and `createElement` makes a new props object every render.
 * So a non-memoized 100-row list emits ~100 `setProps` mutations for a
 * one-character edit — correct, and nearly as expensive as sending the tree.
 * With `memo` and stable row objects, unchanged rows bail out before reaching
 * the host config, and no mutation is emitted for them at all. Section 6 prints
 * both numbers.
 */
const Row = memo(function Row({ row }: { row: RowData }): ReturnType<typeof createElement> {
  return createElement(
    "row",
    { gap: 4, align: "center" },
    createElement("label", { id: row.id }, row.label),
    createElement(
      "button",
      {
        title: `dismiss ${row.id}`,
        onClick: () => console.log(`      [plugin] dismiss ${row.id}`),
      },
      "x",
    ),
  )
})

function RowList({
  title,
  rows,
}: {
  title: string
  rows: RowData[]
}): ReturnType<typeof createElement> {
  return createElement(
    "column",
    { gap: 8, padding: 16 },
    createElement("heading", { level: 2 }, title),
    ...rows.map((row) => createElement(Row, { key: row.id, row })),
  )
}

/** The same list without `memo`, used only for the comparison in section 6. */
function PlainRow({ row }: { row: RowData }): ReturnType<typeof createElement> {
  return createElement(
    "row",
    { gap: 4, align: "center" },
    createElement("label", { id: row.id }, row.label),
    createElement("button", { title: `dismiss ${row.id}`, onClick: () => {} }, "x"),
  )
}

function PlainRowList({
  title,
  rows,
}: {
  title: string
  rows: RowData[]
}): ReturnType<typeof createElement> {
  return createElement(
    "column",
    { gap: 8, padding: 16 },
    createElement("heading", { level: 2 }, title),
    ...rows.map((row) => createElement(PlainRow, { key: row.id, row })),
  )
}

const SUBJECTS = [
  "Crash on paste",
  "Dark mode flickers",
  "Export hangs at 90%",
  "Duplicate rows after sync",
  "Shortcut conflicts with editor",
  "Slow first paint",
]

const makeRows = (n: number): RowData[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i + 1}`,
    label: `#${101 + i} ${SUBJECTS[i % SUBJECTS.length]}`,
  }))

// ---------------------------------------------------------------------------
// 9. Wire it up
// ---------------------------------------------------------------------------

const reconciler = ReactReconciler(hostConfig)

/** Step 03 explains this seam: the 0.33 runtime and its published types disagree. */
interface SynchronousReconciler {
  flushSyncFromReconciler<Result>(callback: () => Result): Result
  flushPassiveEffects(): boolean
}
const sync = reconciler as typeof reconciler & SynchronousReconciler

type OpaqueRoot = ReturnType<typeof reconciler.createContainer>

function createContainerFor(bridge: RenderBridge): OpaqueRoot {
  return reconciler.createContainer(
    bridge,
    ConcurrentRoot,
    null,
    false,
    null,
    "",
    console.error,
    console.error,
    console.error,
    console.error,
    null,
  )
}

function renderInto(container: OpaqueRoot, element: ReturnType<typeof createElement> | null): void {
  sync.flushSyncFromReconciler(() => {
    reconciler.updateContainer(element, container, null, () => {})
  })
  sync.flushPassiveEffects()
}

// -- the plugin side ----------------------------------------------------------

const registry = new HandlerRegistry()
/** "Incremental mode with cleanupHandlers deleted" — section 5's control group. */
const leakyRegistry = new HandlerRegistry()
const bridge = createRenderBridge()
bridge.mutationCollector = new MutationCollector(registry, leakyRegistry)

// -- the host side ------------------------------------------------------------

const hostErrors: string[] = []
const hostTree = new MutableTree((message) => {
  hostErrors.push(message)
  console.log(`      HOST ERROR  ${message}`)
})

/** Set to true to make the transport swallow exactly one batch (section 7). */
let dropNextBatch = false
let droppedBatch: Mutation[] = []
let lastBatch: Mutation[] = []
let batchesDelivered = 0

// This is the `applyMutations` RPC, minus the RPC. In step 13 the same array
// goes through structured clone; in step 14, through a socket.
bridge.subscribeMutations((mutations) => {
  lastBatch = mutations
  if (dropNextBatch) {
    dropNextBatch = false
    droppedBatch = mutations
    console.log(`      [transport] DROPPED a batch of ${mutations.length} mutations`)
    return
  }
  batchesDelivered += 1
  hostTree.applyMutations(mutations)
})

// The full-mode channel is still connected — the bridge notifies it in both
// modes. Counting commits is all this step uses it for.
let commitCount = 0
bridge.subscribe(() => {
  commitCount += 1
})

const container = createContainerFor(bridge)

/**
 * The plugin's own tree, serialized into a THROWAWAY registry.
 *
 * This is the yardstick every assertion below compares the host against, and
 * the scratch registry is load-bearing: `serializeTree` runs a sweep, so
 * serializing into the live registry would quietly repair exactly the handler
 * bookkeeping section 5 is trying to measure.
 */
const referenceTree = (): UINode | null =>
  serializeTree(bridge.rootInstance, new HandlerRegistry())

function assertInSync(label: string, expectFail = false): void {
  const plugin = referenceTree()
  const host = hostTree.getTree()
  const ok = deepEqual(plugin, host)
  checksRun += 1
  if (ok) checksPassed += 1
  if (expectFail) checksExpectedToFail += 1
  const suffix = expectFail
    ? ok
      ? "   <- UNEXPECTED: the drift demo did not drift"
      : "   <- EXPECTED: this is the drift being demonstrated"
    : ""
  console.log(`  [${ok ? "PASS" : "FAIL"}] host tree === plugin tree  (${label})${suffix}`)
}

function reportUpdate(label: string, mutations: Mutation[]): void {
  const full = referenceTree()
  const mutationBytes = bytes(mutations)
  const fullBytes = bytes(full)
  console.log(`\n  --- ${label} ---`)
  console.log(`  ${mutations.length} mutation(s) emitted by the commit:`)
  for (const m of mutations) console.log(`      ${describeMutation(m)}`)
  console.log(
    `  incremental payload : ${String(mutationBytes).padStart(6)} B` +
      `   (applyMutations)\n` +
      `  full-tree payload   : ${String(fullBytes).padStart(6)} B` +
      `   (updateTree — what step 04 would have sent)\n` +
      `  ratio               : ${(fullBytes / mutationBytes).toFixed(2)}x smaller`,
  )
}

let rows = makeRows(6)
const TITLE = "Open tickets"

// -- 1. Mount -----------------------------------------------------------------

console.log("=== 1. Mount: the first commit is still a whole tree ===")
renderInto(container, createElement(RowList, { title: TITLE, rows }))
reportUpdate("mount (6 rows)", lastBatch)
console.log("\n  the host's tree, built from those two mutations:")
console.log(show(hostTree.getTree() as UINode, 1))
assertInSync("after mount")
console.log(
  "\n  Incremental mode does not make the first frame cheaper — the host has\n" +
    "  nothing, so it must be sent everything. In fact it is very slightly WORSE\n" +
    "  than full mode here (the ratio above is below 1.00x): the batch is an\n" +
    "  array wrapping the same tree, and React clears the container before its\n" +
    "  first append, so the batch opens with a `setRoot node=null` the host\n" +
    "  applies and immediately overwrites. `setRoot` is what makes the host\n" +
    "  self-seeding — no separate handshake, no \"send me the tree first\" round\n" +
    "  trip — and it is the only mutation whose size is a property of the UI\n" +
    "  rather than of the change.",
)

// -- 2. One row's text changes ------------------------------------------------

console.log("\n=== 2. Update A: one row's label changes ===")
rows = rows.map((r, i) => (i === 2 ? { ...r, label: `${r.label} (reopened)` } : r))
renderInto(container, createElement(RowList, { title: TITLE, rows }))
reportUpdate("edit row r3's label", lastBatch)
assertInSync("after the edit")
console.log(
  "\n  One `setText`, plus a `setProps` for each element that actually\n" +
    "  re-rendered. The five untouched rows emitted nothing at all: `memo` let\n" +
    "  them bail out before the reconciler ever reached the host config.",
)

// -- 3. A row is inserted -----------------------------------------------------

console.log("\n=== 3. Update B: a row is inserted in the middle ===")
rows = [
  ...rows.slice(0, 3),
  { id: "r99", label: "#199 Escalation: data loss on quit" },
  ...rows.slice(3),
]
renderInto(container, createElement(RowList, { title: TITLE, rows }))
reportUpdate("insert r99 before r4", lastBatch)
assertInSync("after the insert")
console.log(
  "\n  `insertBefore` carries the new row's WHOLE subtree — the host has never\n" +
    "  seen those nodes — and names its position by the id of the node it goes\n" +
    "  before, never by an index. Step 02 section 4 is why: an index is a\n" +
    "  statement about the host's tree, and the plugin does not have it.",
)

// -- 4. A row is removed ------------------------------------------------------

console.log("\n=== 4. Update C: a row is removed, and its handlers with it ===")

function collectHandlerIds(node: UINode | string, out: string[] = []): string[] {
  if (typeof node === "string") return out
  for (const [key, value] of Object.entries(node.props)) {
    if (key.startsWith("_") && key.endsWith("HandlerId")) out.push(String(value))
  }
  for (const child of node.children) collectHandlerIds(child, out)
  return out
}

const idsBefore = collectHandlerIds(referenceTree() as UINode)
console.log(`  handler ids in the tree before: ${idsBefore.length}`)
console.log(`  registry.size before:           ${registry.size}`)

rows = rows.filter((r) => r.id !== "r5")
renderInto(container, createElement(RowList, { title: TITLE, rows }))
reportUpdate("remove row r5", lastBatch)
assertInSync("after the removal")

const idsAfter = collectHandlerIds(referenceTree() as UINode)
const goneIds = idsBefore.filter((id) => !idsAfter.includes(id))
console.log(`\n  handler ids that left the tree: ${goneIds.join(", ") || "(none)"}`)
for (const id of goneIds) {
  console.log(
    `    registry.has(${JSON.stringify(id)})       = ${registry.has(id)}   <- released by cleanupHandlers`,
  )
  console.log(
    `    leakyRegistry.has(${JSON.stringify(id)})  = ${leakyRegistry.has(id)}   <- the same mode without that call`,
  )
}
console.log(`  registry.size after:       ${registry.size}`)
console.log(`  leakyRegistry.size after:  ${leakyRegistry.size}`)
console.log("\n  a click that arrives for the removed row — the normal host/plugin race:")
await registry.execute(goneIds[0] ?? "node-0:onClick")

// -- 5. Why the sweep is not enough, and neither is releaseNode ---------------

console.log("\n=== 5. Two modes, two release mechanisms, both necessary ===")
console.log(
  `  live registry (incremental, releaseNode on removeChild): ${registry.size}\n` +
    `  same registry with cleanupHandlers removed:              ${leakyRegistry.size}`,
)
console.log(
  "\n  The leaky one is not a strawman: it is this exact file with one line\n" +
    "  deleted from collectRemoveChild. Nothing else in incremental mode ever\n" +
    "  looks at a node again, so nothing else can notice it is gone.",
)
console.log("\n  now run FULL mode's mechanism over the leaky registry — one serializeTree:")
const sweptTree = serializeTree(bridge.rootInstance, leakyRegistry)
console.log(
  `  leakyRegistry.size after the sweep: ${leakyRegistry.size}` +
    `   (walked ${countNodes(sweptTree as UINode)} nodes to learn what one removeChild already knew)`,
)
console.log(
  "\n  That is the trade in one line. The sweep is free of bookkeeping and costs\n" +
    "  a whole-tree walk; releaseNode costs one line at the removal site and no\n" +
    "  walk at all. Full mode already pays for the walk, incremental mode never\n" +
    "  does — so each mode uses the mechanism the other cannot afford.",
)

// -- 6. The ratio, as the list grows -----------------------------------------

console.log("\n=== 6. The same edit, in lists of four sizes ===")

interface Measurement {
  rowCount: number
  mutationCount: number
  mutationBytes: number
  fullBytes: number
}

/**
 * Mount a list of `rowCount` rows in its own container, change ONE row's label,
 * and measure the resulting commit. Real mutations, emitted by React, every
 * time — no arithmetic.
 */
function measureOneEdit(
  component: typeof RowList,
  rowCount: number,
): Measurement {
  const localRegistry = new HandlerRegistry()
  const localBridge = createRenderBridge()
  localBridge.mutationCollector = new MutationCollector(localRegistry)
  let batch: Mutation[] = []
  localBridge.subscribeMutations((m) => {
    batch = m
  })
  const localContainer = createContainerFor(localBridge)

  const initial = makeRows(rowCount)
  renderInto(localContainer, createElement(component, { title: TITLE, rows: initial }))

  const target = Math.floor(rowCount / 2)
  const edited = initial.map((r, i) => (i === target ? { ...r, label: `${r.label}!` } : r))
  renderInto(localContainer, createElement(component, { title: TITLE, rows: edited }))

  const measurement: Measurement = {
    rowCount,
    mutationCount: batch.length,
    mutationBytes: bytes(batch),
    fullBytes: bytes(serializeTree(localBridge.rootInstance, new HandlerRegistry())),
  }
  renderInto(localContainer, null) // unmount, so nothing is left running
  return measurement
}

const SIZES = [5, 25, 100, 400]

console.log("\n  (a) with `memo`ed rows — the batch is bounded by what changed:")
console.log("      rows   mutations   incremental      full tree     ratio")
for (const size of SIZES) {
  const m = measureOneEdit(RowList, size)
  console.log(
    `      ${String(m.rowCount).padStart(4)}   ${String(m.mutationCount).padStart(9)}` +
      `   ${String(m.mutationBytes).padStart(9)} B   ${String(m.fullBytes).padStart(9)} B` +
      `   ${(m.fullBytes / m.mutationBytes).toFixed(1).padStart(6)}x`,
  )
}

console.log("\n  (b) the same edit without `memo` — every re-rendered node emits setProps:")
console.log("      rows   mutations   incremental      full tree     ratio")
for (const size of SIZES) {
  const m = measureOneEdit(PlainRowList, size)
  console.log(
    `      ${String(m.rowCount).padStart(4)}   ${String(m.mutationCount).padStart(9)}` +
      `   ${String(m.mutationBytes).padStart(9)} B   ${String(m.fullBytes).padStart(9)} B` +
      `   ${(m.fullBytes / m.mutationBytes).toFixed(1).padStart(6)}x`,
  )
}

console.log(
  "\n  Step 01 printed this table from a hand-written tree and called it a\n" +
    "  hypothetical. These are React's own mutations, counted and measured.\n" +
    "  Read (a) against (b): incremental mode does not make a plugin fast, it\n" +
    "  makes a plugin's own reconciliation VISIBLE on the wire. A renderer that\n" +
    "  re-renders everything ships a mutation for everything.",
)

// -- 7. Drift, and the way back ----------------------------------------------

console.log("\n=== 7. Drift: what happens when a batch does not arrive ===")
console.log(`  batches delivered so far: ${batchesDelivered}, commits: ${commitCount}`)

dropNextBatch = true
rows = rows.map((r, i) => (i === 0 ? { ...r, label: `${r.label} [P0]` } : r))
renderInto(container, createElement(RowList, { title: TITLE, rows }))
console.log(`  the dropped batch was: ${droppedBatch.map((m) => m.type).join(", ")}`)
assertInSync("immediately after the dropped batch", true)

const droppedSetText = droppedBatch.find((m): m is SetTextMutation => m.type === "setText")
if (droppedSetText) {
  console.log(
    `\n  plugin says ${droppedSetText.nodeId} = ${JSON.stringify(droppedSetText.text)}\n` +
      `  host says   ${droppedSetText.nodeId} = ` +
      `${JSON.stringify(hostTree.getNode(droppedSetText.nodeId)?.text)}`,
  )
}

console.log("\n  the next batch is delivered normally — does that heal it?")
rows = rows.map((r, i) => (i === 4 ? { ...r, label: `${r.label} (closed)` } : r))
renderInto(container, createElement(RowList, { title: TITLE, rows }))
console.log(`  delivered: ${lastBatch.map((m) => m.type).join(", ")}`)
assertInSync("after a further, correctly delivered batch", true)
console.log(
  "  No. Mutations are deltas against a state the host is assumed to have.\n" +
    "  Once that assumption is false, every later batch applies cleanly and\n" +
    "  leaves the host exactly as wrong as before. Nothing detects it: the host\n" +
    "  logged no error, the plugin got no failure, the UI just quietly shows the\n" +
    "  wrong text forever. THIS is why sending the whole tree is the safe design\n" +
    "  and why abandoning it needs a way back.",
)

console.log("\n  the way back — syncTree(): re-serialize everything and re-seed the host")
const fullTree = serializeTree(bridge.rootInstance, registry)
console.log(
  `  plugin -> host: updateTree(${bytes(fullTree)} B, ${countNodes(fullTree as UINode)} nodes)`,
)
hostTree.init(fullTree)
assertInSync("after syncTree()")
console.log(
  "\n  Note which registry that `serializeTree` was given: the LIVE one. A\n" +
    "  full-tree pass re-runs the sweep, so syncTree also reconciles handler\n" +
    "  ownership — the one moment incremental mode gets full mode's mechanism\n" +
    "  for free.",
)

// -- 8. Unmount ---------------------------------------------------------------

console.log("\n=== 8. Unmount: the one release incremental mode cannot infer ===")
renderInto(container, null)
console.log(`  mutations: ${lastBatch.map((m) => describeMutation(m).trim()).join(" | ")}`)
console.log(`  host tree: ${JSON.stringify(hostTree.getTree())}`)
assertInSync("after unmount")
console.log(`\n  registry.size after unmount: ${registry.size}   <- every handler still live`)
console.log(
  "  Tearing down the root is not a `removeChild`: React clears the container,\n" +
    "  the collector emits one `setRoot null`, and no node is ever individually\n" +
    "  removed — so `cleanupHandlers` is never called for any of them. Step 04's\n" +
    "  full mode had no such gap, because `serializeTree(null)` still ran a sweep\n" +
    "  and the sweep saw an empty tree.",
)
registry.clear()
console.log(
  `  registry.clear() -> ${registry.size}. That is why the real class has a\n` +
    "  `clear()` at all, and why the runtime's `resetRuntimeState()` and the main\n" +
    "  controller's `disconnect()` both call it instead of trusting the mutation\n" +
    "  stream to have freed everything.",
)

// -- 9. Summary ---------------------------------------------------------------

console.log("\n=== 9. What this step bought ===")
console.log(
  `  sync checks: ${checksPassed}/${checksRun} PASS ` +
    `(${checksExpectedToFail} deliberate failures in section 7)\n` +
    `  host-side errors logged: ${hostErrors.length}\n` +
    `  commits: ${commitCount}, batches delivered: ${batchesDelivered}\n` +
    "\n  - The reconciler's callbacks ARE the mutation stream. Nothing diffs\n" +
    "    anything; the collector writes down what React was doing anyway.\n" +
    "  - A one-row edit in a 400-row list is a two-order-of-magnitude saving,\n" +
    "    and the saving grows with the UI rather than shrinking.\n" +
    "  - Handler release moved from an inferred sweep to an explicit call at the\n" +
    "    removal site, because no whole-tree walk remains to infer it from — and\n" +
    "    teardown needs a third mechanism again, `clear()`, because a root that\n" +
    "    goes away was never removed child by child.\n" +
    "  - The cost is that the host's tree is now a REPLICA, kept correct by an\n" +
    "    unbroken sequence of deltas, and a replica can drift. `syncTree()` is\n" +
    "    the reset button, and it is why the full-tree path never goes away.\n" +
    "\n  Step 06 hands the same job to Solid's universal renderer — no VDOM, no\n" +
    "  commit phase — and gets identical mutations out the other end.",
)
