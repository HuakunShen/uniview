/**
 * Step 15 — What comes BACK across the boundary, and what must never cross it.
 *
 * Stage D closes here. Steps 12/13/14 carried the tree OUTWARD — main thread,
 * Worker, socket — and priced each transport. This step turns around and looks
 * at the return path, which has two lanes and only two:
 *
 *   1. EVENTS, plugin-ward, over RPC. `executeHandler(handlerId, args)`. A
 *      click, a submit, a change. The user pressed something and expects the
 *      plugin's logic to run; the round trip is the *point*, and it is
 *      affordable because it happens once per intent.
 *
 *   2. ENVIRONMENT, plugin-ward, as STATE. `setEnvironment(env)`. Dark mode,
 *      accent color, reduced motion. Not a stream of events — a value the
 *      plugin reads and subscribes to, pushed when it changes.
 *
 * And a third lane that does not exist, which is the actual subject:
 *
 *   3. HOVER, FOCUS, SCROLL, KEY REPEAT, POINTER POSITION — nothing. These
 *      never cross. `CLAUDE.md` states it as one of the two constraints the
 *      prime directive implies:
 *
 *        "High-frequency interaction is local, never RPC. Scrolling, typing,
 *         hover and focus are handled natively and must never stream per-event
 *         across the transport. This is why style variants (`dark:`, `hover:`,
 *         `focus:`) travel *with* the node and are resolved by the host,
 *         instead of being pushed to the plugin for a re-render: a round trip
 *         per mouse-enter is wasteful locally and fatal when the plugin runs on
 *         another machine."
 *
 * The file measures that sentence. One realistic interaction — a mouse crossing
 * a six-row list (40 pointer samples at 60 fps), settling on a row, a focus
 * change, then one real click — is processed under three policies and across
 * the three transports steps 12-14 built. The gap between the first row and the
 * last row of section 3's table is the lesson.
 *
 * Three findings from the real source are taught as findings, not smoothed over.
 * All three are verifiable in the repository today:
 *
 *   FINDING 1 — `PluginController` has no `setEnvironment`, in ANY TS runtime.
 *     `packages/protocol/src/rpc.ts:37` declares `setEnvironment` on
 *     `HostToPluginAPI`, and both TS runtimes implement it
 *     (`react-runtime/src/runtime.ts:191`, `solid-runtime/src/runtime.ts:210`).
 *     But `packages/host-sdk/src/types.ts` — the interface every host codes
 *     against — does not mention it, and none of the three controllers
 *     (`main.ts`, `worker.ts`, `websocket.ts`) exposes it. The only caller in
 *     the repository is Swift: `UniviewBridge/PluginConnection.swift:101`. A
 *     TypeScript host that wants dark mode has to reach around the seam. On the
 *     main thread that means importing `setHostEnvironment` from
 *     `@uniview/react-runtime` and calling it out of band; through a Worker it
 *     means reaching into the RPC channel the controller owns. Section 5
 *     builds the main-thread half and shows exactly what it costs.
 *
 *   FINDING 2 — the main-thread controller performs no handshake at all.
 *     `worker.ts:96` and `websocket.ts:87` both call
 *     `api.initialize({ protocolVersion: PROTOCOL_VERSION, props })`.
 *     `controllers/main.ts` calls `createElement` + `render` directly: no
 *     `initialize`, no version check, and — because `initialize` is also where
 *     the environment is SEEDED (`runtime.ts:141`, `if (req.env) …`) — no way
 *     to be dark on the first frame. Note also that neither the Worker nor the
 *     WebSocket controller actually PASSES `env` to `initialize`, though the
 *     field exists and is validated (`validators.ts:52`); only the Swift host
 *     seeds it (`Shell.swift:131`). Section 5 prints the light-then-dark flash
 *     this produces.
 *
 *   FINDING 3 — `EventPropName` is a subset, and the renderer does not enforce
 *     it. `packages/protocol/src/events.ts:11` lists eleven event props; there
 *     is no `onMouseMove`, no `onScroll`, no `onPointerMove`, no `onDrag`. But
 *     `react-renderer`'s `serializeProps` matches `/^on[A-Z]/`
 *     (`serialization/serialize-props.ts:50`), not `EVENT_PROPS` — so a plugin
 *     that writes `onMouseMove` DOES get a `_onMouseMoveHandlerId` in the tree.
 *     It is the hosts that never bind it: their `EVENT_MAP` has ten entries and
 *     `extractEventName` returns `null` for anything outside `EVENT_PROPS`.
 *     Section 2 shows the handler id that is minted and then ignored. The one
 *     entry in `EVENT_PROPS` that CAN fire at pointer rate is `onWheel` — and
 *     no host in the repository binds it, and `serializeHandlerArgs` has no
 *     case for it. Section 2 shows what would happen if one did.
 */

import type { ComponentType, ReactElement } from "react"
import {
  createElement,
  createContext,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react"
import ReactReconciler from "react-reconciler"
import type { HostConfig, ReactContext } from "react-reconciler"
import {
  ConcurrentRoot,
  DefaultEventPriority,
  NoEventPriority,
} from "react-reconciler/constants"

// ===========================================================================
// 1. The protocol, carried forward from steps 01/04/05/12
// ===========================================================================
//
// Steps never import each other (learn/RULES.md), so the contract is
// re-declared. Nothing in this section has changed since step 12.

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

const utf8 = (value: string): number => new TextEncoder().encode(value).length

// ===========================================================================
// 2. NEW — the event vocabulary: eleven props, and everything that is missing
// ===========================================================================
//
// Copied from packages/protocol/src/events.ts. The interesting thing about this
// list is what is NOT in it, so read the absences first.

/** Verbatim from packages/protocol/src/events.ts:11 — all eleven entries. */
export type EventPropName =
  | "onClick"
  | "onChange"
  | "onInput"
  | "onSubmit"
  | "onFocus"
  | "onBlur"
  | "onKeyDown"
  | "onKeyUp"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onWheel"

/** Verbatim from packages/protocol/src/events.ts:47. Used for runtime checking. */
const EVENT_PROPS: readonly EventPropName[] = [
  "onClick",
  "onChange",
  "onInput",
  "onSubmit",
  "onFocus",
  "onBlur",
  "onKeyDown",
  "onKeyUp",
  "onMouseEnter",
  "onMouseLeave",
  "onWheel",
] as const

/**
 * Props a React author will absolutely reach for and which the protocol has no
 * word for. Every one of them fires at pointer or key-repeat rate.
 */
const NOT_IN_THE_PROTOCOL = [
  "onMouseMove",
  "onPointerMove",
  "onMouseOver",
  "onMouseOut",
  "onScroll",
  "onDrag",
  "onDragOver",
  "onTouchMove",
] as const

const HANDLER_ID_PREFIX_LENGTH = 1
const HANDLER_ID_SUFFIX_LENGTH = 9

const isHandlerIdProp = (propName: string): boolean =>
  propName.startsWith("_") && propName.endsWith("HandlerId")

/** Verbatim from packages/protocol/src/events.ts:84. Returns null off-list. */
function extractEventName(handlerIdProp: string): EventPropName | null {
  if (!isHandlerIdProp(handlerIdProp)) return null
  const eventName = handlerIdProp.slice(HANDLER_ID_PREFIX_LENGTH, -HANDLER_ID_SUFFIX_LENGTH)
  if (EVENT_PROPS.includes(eventName as EventPropName)) return eventName as EventPropName
  return null
}

/**
 * The payload an `onKeyDown` handler receives, verbatim from
 * packages/protocol/src/events.ts:35 — and its doc comment is the design:
 *
 *   "Deliberately a subset of the DOM's `KeyboardEvent`, field for field: the
 *    same plugin tree renders on a web host, where `onKeyDown` is handed the
 *    real thing. A native host that invented its own field names would mean one
 *    tree that reads its keys two different ways depending on who renders it."
 */
export interface KeyDownEvent {
  key: string
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  repeat: boolean
}

// --- serializeHandlerArgs, carried forward from step 08 --------------------
//
// packages/host-svelte/src/event-handlers.ts, whose file comment explains why
// it exists: "DOM Event objects are not structured-cloneable."
//
//   onClick, onFocus, onBlur, onMouseEnter, onMouseLeave  ->  []
//   onInput, onChange                                     ->  [target.value]
//   onKeyDown, onKeyUp                                    ->  [{key, code, …}]
//   anything else                                         ->  args.filter(isJsonValue)

const EVENT_ONLY_HANDLER_NAMES = new Set([
  "onClick",
  "onFocus",
  "onBlur",
  "onMouseEnter",
  "onMouseLeave",
])

function serializeHandlerArgs(eventName: string, args: unknown[]): JSONValue[] {
  if (args.length === 0) return []
  if (EVENT_ONLY_HANDLER_NAMES.has(eventName) && looksLikeDomEvent(args[0])) return []
  if ((eventName === "onInput" || eventName === "onChange") && looksLikeDomEvent(args[0])) {
    return [readTargetValue(args[0])]
  }
  if ((eventName === "onKeyDown" || eventName === "onKeyUp") && looksLikeKeyboardEvent(args[0])) {
    return [serializeKeyboardEvent(args[0])]
  }
  return args.filter(isJsonValue)
}

function looksLikeDomEvent(
  value: unknown,
): value is { type?: unknown; target?: unknown; preventDefault?: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    ("target" in value ||
      "currentTarget" in value ||
      "preventDefault" in value ||
      typeof (value as { type?: unknown }).type === "string")
  )
}

function looksLikeKeyboardEvent(value: unknown): value is {
  key?: unknown
  code?: unknown
  altKey?: unknown
  ctrlKey?: unknown
  metaKey?: unknown
  shiftKey?: unknown
} {
  return looksLikeDomEvent(value) && ("key" in value || "code" in value)
}

function readTargetValue(event: { target?: unknown }): JSONValue {
  const target = event.target
  if (target !== null && typeof target === "object" && "value" in target) {
    const value = (target as { value?: unknown }).value
    return isJsonValue(value) ? value : null
  }
  return null
}

function serializeKeyboardEvent(event: {
  key?: unknown
  code?: unknown
  altKey?: unknown
  ctrlKey?: unknown
  metaKey?: unknown
  shiftKey?: unknown
}): JSONValue {
  return {
    key: typeof event.key === "string" ? event.key : "",
    code: typeof event.code === "string" ? event.code : "",
    altKey: event.altKey === true,
    ctrlKey: event.ctrlKey === true,
    metaKey: event.metaKey === true,
    shiftKey: event.shiftKey === true,
  }
}

function isJsonValue(value: unknown): value is JSONValue {
  if (value === null) return true
  const valueType = typeof value
  if (valueType === "string" || valueType === "number" || valueType === "boolean") return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (valueType !== "object") return false
  return Object.values(value as Record<string, unknown>).every(isJsonValue)
}

// ===========================================================================
// 3. NEW — HostEnvironment: state, not events
// ===========================================================================
//
// packages/protocol/src/environment.ts, verbatim, and its doc comment is the
// clearest statement of this step's thesis:
//
//   "What the plugin knows about the machine it is being displayed on.
//
//    This is *state*, not events. React Native draws the same line: a view is a
//    declarative host component, but 'is the system in dark mode' is a value you
//    read (`Appearance.getColorScheme()`) and subscribe to. It never belongs in
//    the UI tree, and it never belongs in the plugin's own props — the host owns
//    it.
//
//    Note what is deliberately NOT solved here. `bg-card` does not consult this:
//    semantic color tokens travel to the host as names and are resolved
//    natively, per view, so they change with the appearance without a re-render
//    or a round trip. This is for the decisions only the plugin can make — which
//    chart palette, which illustration, whether to animate at all."

export type ColorScheme = "light" | "dark"

export interface HostEnvironment {
  /** Dark or light, as the *host* resolves it — a window may override the system. */
  colorScheme: ColorScheme
  /** The user's accent color, if the platform has one (macOS: `controlAccentColor`). */
  accentColor?: string
  /** The user asked for less motion. Honour it: skip the animation, don't shorten it. */
  reduceMotion?: boolean
  /** The user asked for higher contrast. */
  highContrast?: boolean
  /** Whether the application is frontmost. */
  active?: boolean
}

const DEFAULT_HOST_ENVIRONMENT: HostEnvironment = { colorScheme: "light" }

// --- the plugin-side store, from packages/react-runtime/src/environment.ts --
//
// A MODULE-LEVEL store, not a React context. The real file says why:
//
//   "A module-level store rather than a React context, which is how React Native
//    does it (`Appearance` is a singleton) and for the same reason: a plugin owns
//    its entire runtime — one Worker, one process, one React root — so there is
//    no second environment to be in, and no provider anyone can forget to mount."
//
// Hold on to that premise. It is exactly true in a Worker and exactly true over
// a socket. On the MAIN THREAD it is false, and section 5.3 demonstrates the
// consequence.

let currentEnvironment: HostEnvironment = DEFAULT_HOST_ENVIRONMENT
const environmentListeners = new Set<() => void>()
/** Teaching apparatus: how many times the store actually notified. */
let environmentNotifications = 0

function shallowEqual(a: HostEnvironment, b: HostEnvironment): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof HostEnvironment>
  for (const key of keys) if (a[key] !== b[key]) return false
  return true
}

/**
 * Merge in what the host pushed. Called by the runtime, not by plugin code.
 *
 * The no-op guard is load-bearing and the real file explains why: "hosts re-send
 * the whole environment on events like window activation, and
 * `useSyncExternalStore` would re-render the entire tree on each one if the
 * object were rebuilt every time."
 */
function setHostEnvironment(patch: Partial<HostEnvironment>): void {
  const next: HostEnvironment = { ...currentEnvironment, ...patch }
  if (shallowEqual(next, currentEnvironment)) return
  currentEnvironment = next
  environmentNotifications += 1
  for (const listener of environmentListeners) listener()
}

function subscribeEnvironment(listener: () => void): () => void {
  environmentListeners.add(listener)
  return () => {
    environmentListeners.delete(listener)
  }
}

const environmentSnapshot = (): HostEnvironment => currentEnvironment

/** Read the environment outside React — RN's `Appearance.getColorScheme()`. */
const getHostEnvironment = (): HostEnvironment => currentEnvironment

/** The full host environment, re-rendering the component when it changes. */
function useHostEnvironment(): HostEnvironment {
  return useSyncExternalStore(subscribeEnvironment, environmentSnapshot, environmentSnapshot)
}

/**
 * "You do not need this to make `bg-card` or `text-foreground` correct — those
 *  are resolved natively, per view. Reach for it when the plugin has to *decide*
 *  something: which chart palette, which illustration, which of two icons."
 *  (packages/react-runtime/src/environment.ts:65)
 */
function useColorScheme(): ColorScheme {
  return useHostEnvironment().colorScheme
}

// ===========================================================================
// 4. Plugin side, carried forward from step 12
// ===========================================================================
//
// HandlerRegistry, serializeProps, serializeTree, MutationCollector,
// RenderBridge and the HostConfig are step 12's with the commentary trimmed.
// Diff this section against step 12 and you should find no behavioural change.

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

/**
 * Step 04's prop serializer, and FINDING 3 lives on one line of it: the test is
 * `/^on[A-Z]/`, not `EVENT_PROPS.includes(key)`. `onMouseMove` passes.
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

// --- the HostConfig, step 12's, verbatim -----------------------------------

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

/** Teaching apparatus: how many React commits the measured window produced. */
let commitCount = 0

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
    throw new Error("[step15] plugin root must be a single element")
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
    commitCount += 1
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
// 5. Host side: MutableTree, carried forward from steps 02/12
// ===========================================================================

class MutableTree {
  private tree: UINode | null = null
  private nodeIndex: Map<string, UINode> = new Map()
  private parentIndex: Map<string, string> = new Map()

  init(tree: UINode | null): void {
    this.tree = tree
    this.rebuildIndex()
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
    if (insertIndex === -1) insertIndex = parent.children.length
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
    if (!node) return
    this.replaceNode(mutation.nodeId, { ...node, text: mutation.text })
  }

  private applySetProps(mutation: SetPropsMutation): void {
    const node = this.nodeIndex.get(mutation.nodeId)
    if (!node) return
    this.replaceNode(mutation.nodeId, { ...node, props: mutation.props })
  }
}

// ===========================================================================
// 6. The boundary, carried forward from step 12 — now with latency
// ===========================================================================
//
// Step 12's `Boundary` did the transport's real work and counted bytes. This
// one adds the thing a Worker does not have and a socket does: a one-way delay
// that actually elapses. `busyWaitUs` burns wall-clock time on purpose, because
// a `setTimeout` would let the measured window include the event loop's own
// scheduling and turn a latency measurement into a timer-resolution
// measurement.

function busyWaitUs(microseconds: number): void {
  if (microseconds <= 0) return
  const end = performance.now() + microseconds / 1000
  while (performance.now() < end) {
    /* spin */
  }
}

/**
 * A LAN round trip is ~0.4 ms; another machine over the internet is 20-40 ms.
 * The socket boundary below uses the LAN figure, halved into two one-way legs,
 * so that section 3's table finishes in well under a second. Section 3 also
 * prints an EXTRAPOLATED column at 20 ms — clearly labelled, because it is
 * arithmetic on the measured event counts, not a measurement.
 */
const LAN_ONE_WAY_US = 200

class Boundary {
  bytes = 0
  crossings = 0
  latencyMs = 0

  constructor(
    readonly name: string,
    private readonly kind: "none" | "clone" | "json",
    private readonly oneWayUs = 0,
  ) {}

  cross<T>(payload: T): T {
    this.crossings += 1
    if (this.oneWayUs > 0) {
      busyWaitUs(this.oneWayUs)
      this.latencyMs += this.oneWayUs / 1000
    }
    switch (this.kind) {
      case "none":
        return payload
      case "clone": {
        const copy = structuredClone(payload)
        this.bytes += utf8(JSON.stringify(payload))
        return copy
      }
      case "json": {
        const text = JSON.stringify(payload)
        this.bytes += utf8(text)
        return JSON.parse(text) as T
      }
    }
  }
}

const mainBoundary = (): Boundary => new Boundary("main thread (step 12)", "none")
const workerBoundary = (): Boundary => new Boundary("Web Worker (step 13)", "clone")
const socketBoundary = (): Boundary =>
  new Boundary("WebSocket, LAN (step 14)", "json", LAN_ONE_WAY_US)

// ===========================================================================
// 7. The seam — PluginController, plus the member the real one does not have
// ===========================================================================

export type HostMode = "worker" | "websocket" | "main"

/**
 * `packages/host-sdk/src/types.ts`, member for member — EXCEPT `setEnvironment`.
 *
 * FINDING 1: the real `PluginController` has no such member. `setEnvironment` is
 * declared on the RPC contract (`packages/protocol/src/rpc.ts:37`) and
 * implemented by both TS runtimes, but no TypeScript controller surfaces it and
 * no TypeScript host calls it; the only caller in the repository is Swift
 * (`UniviewBridge/PluginConnection.swift:101`). It is added here because this
 * step is about the environment channel and the channel needs a mouth — and
 * because putting it here makes the gap visible: section 5 removes it again and
 * shows what a real main-thread host has to do instead.
 */
export interface PluginController {
  connect(): Promise<void>
  disconnect(): Promise<void>
  updateProps(props: JSONValue): Promise<void>
  executeHandler(handlerId: HandlerId, args?: JSONValue[]): Promise<void>
  /** NOT on packages/host-sdk/src/types.ts. See finding 1. */
  setEnvironment(env: Partial<HostEnvironment>): Promise<void>
  destroy(): Promise<void>
  syncTree(): Promise<void>
  getStatus(): { mode: HostMode; connected: boolean; lastError?: string }
  getTree(): UINode | null
  subscribe(cb: (tree: UINode | null) => void): () => void
}

export interface ControllerOptions {
  App: ComponentType<unknown>
  initialProps?: JSONValue
  /**
   * The machine's state at connect time, mirroring `initialize`'s `env` field
   * (`packages/protocol/src/rpc.ts:19`). FINDING 2: the real main-thread
   * controller has no `initialize` at all, so it has nowhere to put this.
   */
  env?: Partial<HostEnvironment>
  boundary?: Boundary
}

interface ControllerStats {
  handlerCalls: number
  mutationsBack: number
  environmentPushes: number
  commits: number
}

/**
 * One controller, parameterised by boundary. Step 12's `createMainController`
 * with `boundary` promoted from a teaching knob to the thing that distinguishes
 * the three runtimes — which is exactly what steps 13 and 14 established.
 */
export function createController(
  opts: ControllerOptions,
): PluginController & { stats: ControllerStats } {
  const { App, initialProps, env, boundary = mainBoundary() } = opts

  let bridge: RenderBridge | null = null
  let currentElement: ReactElement | null = null
  let handlerRegistry: HandlerRegistry | null = null
  let tree: UINode | null = null
  let mutableTree = new MutableTree()
  let connected = false
  const subscribers = new Set<(tree: UINode | null) => void>()
  const stats: ControllerStats = {
    handlerCalls: 0,
    mutationsBack: 0,
    environmentPushes: 0,
    commits: 0,
  }

  const notify = (next: UINode | null): void => {
    subscribers.forEach((cb) => void cb(next))
  }

  return {
    stats,

    async connect() {
      handlerRegistry = new HandlerRegistry()
      bridge = createRenderBridge()

      // `initialize`'s env seeding, from react-runtime/src/runtime.ts:138-141:
      //   "Seed the environment BEFORE the first render, so a plugin that keys
      //    off `useColorScheme()` doesn't paint a light tree, ship it to the
      //    host, and then repaint dark a round trip later."
      if (env) setHostEnvironment(env)

      bridge.mutationCollector = new MutationCollector(handlerRegistry)
      bridge.subscribeMutations((mutations: Mutation[]) => {
        stats.mutationsBack += mutations.length
        // The return leg. On the main thread this is the identity function; in
        // a Worker it is a structured clone; over a socket it is a JSON frame
        // plus a network hop.
        tree = mutableTree.applyMutations(boundary.cross(mutations))
        notify(tree)
      })

      currentElement = createElement(App, (initialProps ?? {}) as object)
      const before = commitCount
      render(currentElement, bridge)
      stats.commits += commitCount - before
      connected = true
    },

    async disconnect() {
      if (bridge) unmount(bridge)
      bridge = null
      currentElement = null
      handlerRegistry?.clear()
      handlerRegistry = null
      connected = false
      tree = null
      mutableTree = new MutableTree()
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
      stats.handlerCalls += 1
      // The outbound leg: the JSON-subset args cross first.
      const delivered = boundary.cross(args ?? [])
      const registry = handlerRegistry
      const before = commitCount
      let pending: Promise<unknown> | undefined
      sync.flushSyncFromReconciler(() => {
        pending = registry.execute(handlerId, ...delivered)
      })
      sync.flushPassiveEffects()
      await pending
      stats.commits += commitCount - before
    },

    /**
     * The environment channel. Note what it does NOT do — from
     * react-runtime/src/runtime.ts:191-195:
     *
     *   "No render call here on purpose: the store notifies its subscribers, and
     *    only the components that actually read `useColorScheme()` re-render."
     *
     * The `flushSync` wrapper is the learn harness's stand-in for a browser
     * scheduler (same reason as `render`), not an extra render pass: without a
     * DOM there is no paint to schedule the store's notification against.
     */
    async setEnvironment(next: Partial<HostEnvironment>) {
      stats.environmentPushes += 1
      const delivered = boundary.cross(next)
      const before = commitCount
      sync.flushSyncFromReconciler(() => {
        setHostEnvironment(delivered)
      })
      sync.flushPassiveEffects()
      stats.commits += commitCount - before
    },

    async destroy() {
      await this.disconnect()
      subscribers.clear()
    },

    async syncTree() {
      if (!connected || !bridge || !handlerRegistry) return
      tree = boundary.cross(serializeTree(bridge.rootInstance, handlerRegistry))
      mutableTree.init(tree)
      notify(tree)
    },

    getTree: () => tree,

    subscribe(cb: (tree: UINode | null) => void) {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },

    getStatus: () => ({ mode: "main" as const, connected }),
  }
}

// ===========================================================================
// 8. The host — and the state it keeps to itself
// ===========================================================================
//
// Step 08's recursive host, plus the thing that makes this step's argument:
// a `styleState` set. This is step 16's mechanism in miniature — the real one
// carries a `ResolvedStyle` IR with a `variants` map and the host overlays the
// matching keys (see learn/docs/16-style-ir.md). Here the variants are still
// class strings, which is enough to show WHERE the resolution happens.
//
// The Swift host assembles the same set, per view:
//
//   var state: Set<String> = []
//   state.insert(dark ? "dark" : "light")
//   if isHovered { state.insert("hover") }
//   if isPressed { state.insert("active") }
//   if let responder = window?.firstResponder as? NSView, responder === self {
//       state.insert("focus")
//   }
//   (packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift:32)

interface HostState {
  hovered: string | null
  focused: string | null
  colorScheme: ColorScheme
}

/** Split "p-2 bg-card hover:bg-muted focus:border-accent" into base + variants. */
function splitVariants(className: string): {
  base: string[]
  variants: Map<string, string[]>
} {
  const base: string[] = []
  const variants = new Map<string, string[]>()
  for (const token of className.split(/\s+/).filter(Boolean)) {
    const colon = token.lastIndexOf(":")
    if (colon === -1) {
      base.push(token)
      continue
    }
    const key = token.slice(0, colon)
    const value = token.slice(colon + 1)
    const bucket = variants.get(key)
    if (bucket) bucket.push(value)
    else variants.set(key, [value])
  }
  return { base, variants }
}

/**
 * The whole of "hover is local", in eight lines. No controller, no boundary, no
 * plugin: a set of strings and a map lookup, on the host's own thread. Section 3
 * times this against the round trip.
 */
function resolveForState(className: string, state: Set<string>): string[] {
  const { base, variants } = splitVariants(className)
  const result = [...base]
  const matching = [...variants.entries()]
    .filter(([key]) => key.split(":").every((part) => state.has(part)))
    .sort((a, b) => a[0].split(":").length - b[0].split(":").length)
  for (const [, tokens] of matching) result.push(...tokens)
  return result
}

interface OutlineHost {
  state: HostState
  /**
   * The handler ids the last render bound, keyed by "<key> <EventPropName>",
   * where <key> is the node's own `id` prop when it has one. A real host keys
   * by DOM element; keying by the plugin's `id` is what lets the test harness
   * below say "click row t3" without knowing generated node ids.
   */
  bindings: Map<string, HandlerId>
  /** Handler ids present in the tree that no host will ever bind (finding 3). */
  unbindable: Map<string, HandlerId>
  render(tree: UINode | null): string[]
  styleState(nodeId: string): Set<string>
}

function createOutlineHost(): OutlineHost {
  const bindings = new Map<string, HandlerId>()
  const unbindable = new Map<string, HandlerId>()

  const host: OutlineHost = {
    state: { hovered: null, focused: null, colorScheme: "light" },
    bindings,
    unbindable,

    styleState(nodeId) {
      const state = new Set<string>([host.state.colorScheme])
      if (host.state.hovered === nodeId) state.add("hover")
      if (host.state.focused === nodeId) state.add("focus")
      return state
    },

    render(tree) {
      bindings.clear()
      unbindable.clear()
      return tree ? renderNode(tree, 0) : ["(no tree)"]
    },
  }

  function renderNode(node: UINode | string, depth: number): string[] {
    const pad = "  ".repeat(depth)
    if (typeof node === "string") return [`${pad}${node}`]
    if (node.type === TEXT_NODE_TYPE) return [`${pad}${node.text ?? ""}`]

    const key = typeof node.props.id === "string" ? node.props.id : node.id
    const parts: string[] = []
    for (const [propName, value] of Object.entries(node.props)) {
      if (isHandlerIdProp(propName)) {
        const eventName = extractEventName(propName)
        if (eventName === null) {
          // FINDING 3, at the exact line it happens. `_onMouseMoveHandlerId` is
          // in the tree; `extractEventName` says it is not an event this
          // protocol knows, and the host's EVENT_MAP has no slot for it. The
          // plugin registered a handler that can never be called. It is filed
          // here so section 6 can print it — a real host silently ignores it.
          const raw = propName.slice(HANDLER_ID_PREFIX_LENGTH, -HANDLER_ID_SUFFIX_LENGTH)
          unbindable.set(`${key} ${raw}`, String(value))
          continue
        }
        bindings.set(`${key} ${eventName}`, String(value))
        continue
      }
      if (propName === "className") {
        // THE line. The variants were shipped with the node; the state is the
        // host's own; the join happens here, with nothing crossing anything.
        parts.push(`class="${resolveForState(String(value), host.styleState(key)).join(" ")}"`)
        continue
      }
      parts.push(`${propName}=${JSON.stringify(value)}`)
    }

    const attrs = parts.length > 0 ? " " + parts.join(" ") : ""
    const childLines = node.children.flatMap((child) => renderNode(child, depth + 1))
    if (childLines.length === 0) return [`${pad}<${node.type}${attrs} />`]
    return [`${pad}<${node.type}${attrs}>`, ...childLines, `${pad}</${node.type}>`]
  }

  return host
}

// ===========================================================================
// 9. The plugin — the same list, written two ways
// ===========================================================================

interface Ticket {
  id: string
  label: string
  open: number
}

const TICKETS: Ticket[] = [
  { id: "t1", label: "#101 Crash on paste", open: 12 },
  { id: "t2", label: "#102 Dark mode flickers", open: 4 },
  { id: "t3", label: "#103 Export hangs at 90%", open: 31 },
  { id: "t4", label: "#104 Duplicate rows after sync", open: 7 },
  { id: "t5", label: "#105 Slow search on large lists", open: 19 },
  { id: "t6", label: "#106 Tooltip clipped in sidebar", open: 2 },
]

/**
 * VERSION A — hover and focus are PLUGIN state.
 *
 * Every one of these props is a real handler id in the serialized tree, and
 * every mouse-enter is therefore an `executeHandler` RPC, a React re-render, a
 * mutation batch and a host repaint. It is also the version a React author will
 * write by default, because it is what React on the web does.
 *
 * `onMouseMove` is here to make finding 3 concrete: `serializeProps` mints
 * `_onMouseMoveHandlerId` for it, and no host will ever call it.
 */
function ListWithPluginHover(): ReturnType<typeof createElement> {
  const [hovered, setHovered] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const onSelect = useCallback((id: string) => setSelected(id), [])

  return createElement(
    "column",
    { className: "p-4 gap-2 bg-card" },
    ...TICKETS.map((ticket) =>
      createElement(
        "row",
        {
          key: ticket.id,
          id: ticket.id,
          className: `p-2 rounded-md ${ticket.id === hovered ? "bg-muted" : ""} ${
            ticket.id === focused ? "border-accent" : ""
          }`.trim(),
          onMouseEnter: () => setHovered(ticket.id),
          onMouseLeave: () => setHovered((h) => (h === ticket.id ? null : h)),
          onFocus: () => setFocused(ticket.id),
          onBlur: () => setFocused((f) => (f === ticket.id ? null : f)),
          onMouseMove: () => {
            /* never called by any host — see finding 3 */
          },
          onClick: () => onSelect(ticket.id),
        },
        `${ticket.label}${selected === ticket.id ? "  [selected]" : ""}`,
      ),
    ),
  )
}

/**
 * VERSION B — hover and focus are STYLE VARIANTS, shipped with the node.
 *
 * `hover:bg-muted` and `focus:border-accent` are strings in `className`. The
 * host owns the pointer and the first responder, so it resolves them itself,
 * per view, at paint time. The only handler left is the one that expresses
 * intent: `onClick`.
 *
 * This is what step 16 formalises as the Style IR — where the variants travel as
 * a structured `variants` map on `_style` rather than as class-string suffixes.
 */
function ListWithHostHover(): ReturnType<typeof createElement> {
  const [selected, setSelected] = useState<string | null>(null)
  const onSelect = useCallback((id: string) => setSelected(id), [])

  return createElement(
    "column",
    { className: "p-4 gap-2 bg-card" },
    ...TICKETS.map((ticket) =>
      createElement(
        "row",
        {
          key: ticket.id,
          id: ticket.id,
          className: "p-2 rounded-md hover:bg-muted focus:border-accent dark:border-zinc-700",
          onClick: () => onSelect(ticket.id),
        },
        `${ticket.label}${selected === ticket.id ? "  [selected]" : ""}`,
      ),
    ),
  )
}

/**
 * The other half of the environment story: a decision only the plugin can make.
 *
 * A chart's series colors are not a semantic token — there is no
 * `NSColor.chartSeries3` for the host to resolve, and the choice of palette is
 * an authoring decision about legibility against a background. So this one DOES
 * read the environment. Note the `bg-card`/`text-foreground` on the same node,
 * which does not.
 */
const LIGHT_SERIES = ["#2563eb", "#dc2626", "#16a34a"]
const DARK_SERIES = ["#60a5fa", "#f87171", "#4ade80"]

function BurndownPanel(): ReturnType<typeof createElement> {
  const scheme = useColorScheme()
  const series = scheme === "dark" ? DARK_SERIES : LIGHT_SERIES
  return createElement(
    "column",
    { className: "p-4 rounded-lg bg-card text-foreground" },
    createElement("chart", {
      id: "burndown",
      series,
      // Chosen by the plugin, from the environment. There is no token for it.
      gridColor: scheme === "dark" ? "#3f3f46" : "#e4e4e7",
      values: TICKETS.map((t) => t.open),
    }),
  )
}

// ===========================================================================
// 10. The interaction sequence
// ===========================================================================
//
// One realistic gesture, described once and replayed under every policy. The
// pointer walks across the list at 60 fps (40 samples, 16 ms apart = 640 ms of
// a person's actual time), which produces six enter/leave transitions as it
// crosses row boundaries; then the keyboard focus moves; then one click.

type InteractionKind = "pointerSample" | "mouseEnter" | "mouseLeave" | "focus" | "blur" | "click"

interface Interaction {
  kind: InteractionKind
  /** Which row it landed on, or null for a sample between rows. */
  rowId: string | null
  /** The event prop a plugin-side implementation would have to receive. */
  eventProp: string | null
}

function buildInteractionSequence(): Interaction[] {
  const events: Interaction[] = []
  // 40 pointer samples crossing rows t1..t4, entering a new row every 8 samples.
  let inside: string | null = null
  for (let sample = 0; sample < 40; sample++) {
    const row = TICKETS[Math.min(Math.floor(sample / 8), 4)]?.id ?? null
    events.push({ kind: "pointerSample", rowId: row, eventProp: "onMouseMove" })
    if (row !== inside) {
      if (inside !== null) {
        events.push({ kind: "mouseLeave", rowId: inside, eventProp: "onMouseLeave" })
      }
      if (row !== null) events.push({ kind: "mouseEnter", rowId: row, eventProp: "onMouseEnter" })
      inside = row
    }
  }
  // The pointer settles. The user tabs from row 2 to the row under the cursor.
  events.push({ kind: "blur", rowId: "t2", eventProp: "onBlur" })
  events.push({ kind: "focus", rowId: inside, eventProp: "onFocus" })
  // And clicks. THIS is the one that must round-trip.
  events.push({ kind: "click", rowId: inside, eventProp: "onClick" })
  return events
}

/**
 * Three policies, each answering "which of those interactions leaves the host?"
 *
 *   A — every interaction is an RPC. The naive port of a web mental model.
 *   B — Uniview's protocol as it stands: `EventPropName` has no `onMouseMove`,
 *       so the 40 samples die in the host. Everything else still round-trips,
 *       because in version A of the plugin hover IS plugin state.
 *   C — B, plus step 16's variants: hover and focus resolve host-side, so only
 *       the click leaves.
 */
type Policy = "A-everything" | "B-protocol-subset" | "C-plus-style-ir"

const POLICY_LABEL: Record<Policy, string> = {
  "A-everything": "A  everything round-trips",
  "B-protocol-subset": "B  EventPropName subset",
  "C-plus-style-ir": "C  + host-side variants",
}

function crossesTheBoundary(policy: Policy, event: Interaction): boolean {
  switch (policy) {
    case "A-everything":
      return true
    case "B-protocol-subset":
      // The protocol has no word for a pointer sample, so the host cannot
      // forward one even if the plugin registered a handler for it.
      return event.kind !== "pointerSample"
    case "C-plus-style-ir":
      return event.kind === "click"
  }
}

interface RunResult {
  policy: Policy
  transport: string
  /** How many interactions became an `executeHandler` call. */
  rpcs: number
  /** How many were resolved by the host alone. */
  localResolutions: number
  /** Wall-clock, measured. */
  totalMs: number
  reactCommits: number
  mutationsBack: number
  bytes: number
  latencyMs: number
}

async function runSequence(
  policy: Policy,
  makeBoundary: () => Boundary,
  transportName: string,
): Promise<RunResult> {
  const boundary = makeBoundary()
  const host = createOutlineHost()
  const App = policy === "C-plus-style-ir" ? ListWithHostHover : ListWithPluginHover
  const controller = createController({
    App: App as ComponentType<unknown>,
    boundary,
  })

  const unsubscribe = controller.subscribe((tree) => void host.render(tree))
  await controller.connect()
  // Rendering once populates `host.bindings` — the host cannot dispatch to a
  // handler id it has not seen in the tree.
  host.render(controller.getTree())

  const sequence = buildInteractionSequence()
  let rpcs = 0
  let localResolutions = 0

  const started = performance.now()
  for (const event of sequence) {
    if (crossesTheBoundary(policy, event) && event.rowId !== null && event.eventProp !== null) {
      const key = `${event.rowId} ${event.eventProp}`
      // Policy A is the counterfactual: a host that binds every `/^on[A-Z]/`
      // handler id it finds, including the ones `extractEventName` rejects. No
      // real host does this — which is the point. Policies B and C only ever
      // look in `bindings`, so a pointer sample finds nothing and stops here.
      const handlerId =
        host.bindings.get(key) ??
        (policy === "A-everything" ? host.unbindable.get(key) : undefined)
      if (handlerId !== undefined) {
        rpcs += 1
        // The DOM event is narrowed BEFORE it crosses (step 08's rule), so the
        // args are `[]` for every event in this sequence — a change or a keydown
        // would carry one string or six fields respectively.
        await controller.executeHandler(handlerId, serializeHandlerArgs(event.eventProp, []))
        continue
      }
    }
    // Resolved locally: flip the host's own state and re-resolve the variants.
    localResolutions += 1
    if (event.kind === "mouseEnter") host.state.hovered = event.rowId
    if (event.kind === "mouseLeave" && host.state.hovered === event.rowId) {
      host.state.hovered = null
    }
    if (event.kind === "focus") host.state.focused = event.rowId
    if (event.kind === "blur" && host.state.focused === event.rowId) host.state.focused = null
    if (event.kind !== "pointerSample") host.render(controller.getTree())
  }
  const totalMs = performance.now() - started

  const stats = controller.stats
  unsubscribe()
  await controller.destroy()

  return {
    policy,
    transport: transportName,
    rpcs,
    localResolutions,
    totalMs,
    reactCommits: stats.commits,
    mutationsBack: stats.mutationsBack,
    bytes: boundary.bytes,
    latencyMs: boundary.latencyMs,
  }
}

// ===========================================================================
// 11. Run it
// ===========================================================================

const pad = (s: string | number, n: number): string => String(s).padStart(n)
const line = (s: string, n: number): string => s + " ".repeat(Math.max(0, n - s.length))

// Warm-up: mount, click, destroy once so that section 3's numbers are
// steady-state rather than a JIT measurement. Printed nowhere.
{
  const warm = createController({ App: ListWithHostHover as ComponentType<unknown> })
  const warmHost = createOutlineHost()
  const un = warm.subscribe((t) => void warmHost.render(t))
  await warm.connect()
  warmHost.render(warm.getTree())
  for (const id of [...warmHost.bindings.values()].slice(0, 3)) {
    await warm.executeHandler(id, [])
  }
  await warm.setEnvironment({ colorScheme: "dark" })
  await warm.setEnvironment({ colorScheme: "light" })
  un()
  await warm.destroy()
}

// --- 11.1 what the protocol has a word for ---------------------------------

console.log("=== 1. The eleven events, and the eight a web author will reach for ===\n")
console.log(`  EVENT_PROPS (${EVENT_PROPS.length}): ${EVENT_PROPS.join(", ")}`)
console.log(`\n  Not in the protocol, at any host: ${NOT_IN_THE_PROTOCOL.join(", ")}`)
console.log(
  "\n  Read the two lists side by side and the rule falls out. Everything in the\n" +
    "  first list fires when a person DECIDES something — click, submit, change,\n" +
    "  a declared key. Everything in the second fires while a person is still\n" +
    "  moving. `onMouseEnter`/`onMouseLeave` are the boundary case and they are\n" +
    "  in, because a transition is discrete even though the motion is not.\n" +
    "\n  One entry does not fit that rule: `onWheel`. It is in EVENT_PROPS, it can\n" +
    "  fire at pointer rate, and no host in the repository binds it — the Svelte,\n" +
    "  React and Vue adapters all use a ten-entry EVENT_MAP with no `wheel`, and\n" +
    "  `serializeHandlerArgs` has no case for it either. It is declared and\n" +
    "  unimplemented, which is the honest reading.",
)

// --- 11.2 narrowing one event ----------------------------------------------

console.log("\n=== 2. One fat DOM event, narrowed ===\n")

/**
 * A DOM-ish event with the shape that matters: a `target` that points back at a
 * document that points back at the target (a cycle), and methods. This is the
 * thing `serializeHandlerArgs` exists to keep out of the transport.
 */
interface FatDomEvent {
  [key: string]: unknown
  type: string
  key: string
  code: string
  target: Record<string, unknown>
  currentTarget: Record<string, unknown>
  preventDefault: () => void
  stopPropagation: () => void
}

function makeFatKeyEvent(): FatDomEvent {
  const input: Record<string, unknown> = {
    tagName: "INPUT",
    value: "dark mo",
    id: "search",
    className: "w-full",
  }
  const document: Record<string, unknown> = { nodeType: 9, activeElement: input }
  input.ownerDocument = document
  input.parentNode = document // the cycle
  return {
    type: "keydown",
    key: "d",
    code: "KeyD",
    keyCode: 68,
    which: 68,
    charCode: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    location: 0,
    detail: 0,
    bubbles: true,
    cancelable: true,
    composed: true,
    defaultPrevented: false,
    eventPhase: 3,
    isTrusted: true,
    timeStamp: 12034.5,
    view: { window: true },
    target: input,
    currentTarget: input,
    srcElement: input,
    relatedTarget: null,
    preventDefault: () => {},
    stopPropagation: () => {},
  }
}

const fat = makeFatKeyEvent()
const fatFieldCount = Object.keys(fat).length

console.log(`  the event the browser handed the host: ${fatFieldCount} own fields`)

let cloneVerdict = "(cloned fine)"
try {
  structuredClone(fat)
} catch (error) {
  cloneVerdict = error instanceof Error ? `${error.name}` : String(error)
}
let jsonVerdict = "(stringified fine)"
try {
  JSON.stringify(fat)
} catch (error) {
  jsonVerdict = error instanceof Error ? `${error.name}` : String(error)
}
console.log(`    across a Worker  (structuredClone) : ${cloneVerdict}  <- a method`)
console.log(`    across a socket  (JSON.stringify)  : ${jsonVerdict}  <- target -> document -> target`)
console.log(
  "\n  That is the whole reason `serializeHandlerArgs` exists, in the words of the\n" +
    "  real file: \"DOM Event objects are not structured-cloneable.\"\n" +
    "  (packages/host-svelte/src/event-handlers.ts:1)",
)

const narrowedKey = serializeHandlerArgs("onKeyDown", [fat])
const narrowedClick = serializeHandlerArgs("onClick", [fat])
const narrowedChange = serializeHandlerArgs("onChange", [fat])

console.log("\n  what actually crosses, per event name:")
console.log(`    onKeyDown -> ${JSON.stringify(narrowedKey)}`)
console.log(`    onChange  -> ${JSON.stringify(narrowedChange)}`)
console.log(`    onClick   -> ${JSON.stringify(narrowedClick)}   <- nothing at all`)
console.log(
  `\n    ${fatFieldCount} fields in, ${Object.keys(narrowedKey[0] as object).length} out for a keydown; ` +
    `${utf8(JSON.stringify(narrowedKey))} B on the wire.\n` +
    "    The click row is the one people find surprising. A click carries no\n" +
    "    information the plugin could not already know — it knows which node it\n" +
    "    put the handler on — so the argument list is empty and the entire DOM\n" +
    "    event stays on the host's side.",
)

// The same subset, arriving somewhere with no DOM at all.
interface TerminalKeyBinding {
  chord: string
  action: string
}
const TERMINAL_BINDINGS: TerminalKeyBinding[] = [
  { chord: "d", action: "toggle done" },
  { chord: "cmd+k", action: "command palette" },
]

/**
 * A host with no `Event` class, no `window`, no `target`. It receives the same
 * six fields the web host sent and can act on them, which is the point of the
 * subset being a subset of the DOM's shape rather than an invention:
 * `KeyDownEvent`'s doc comment says a native host with its own field names
 * "would mean one tree that reads its keys two different ways depending on who
 * renders it."
 */
function terminalHostReceive(event: KeyDownEvent): string {
  const chord =
    (event.metaKey ? "cmd+" : "") +
    (event.ctrlKey ? "ctrl+" : "") +
    (event.altKey ? "alt+" : "") +
    (event.shiftKey ? "shift+" : "") +
    event.key
  const binding = TERMINAL_BINDINGS.find((b) => b.chord === chord)
  return binding ? `${chord} -> ${binding.action}` : `${chord} -> (unbound, passed through)`
}

const asProtocolPayload = narrowedKey[0] as unknown as KeyDownEvent
console.log(
  `\n  the same six fields, at a host with no DOM (step 11's terminal, step 10's\n` +
    `  AppKit): ${terminalHostReceive(asProtocolPayload)}`,
)

// --- 11.3 the sequence, three policies, three transports -------------------

console.log("\n=== 3. One gesture across a list, priced three ways ===\n")

const sequence = buildInteractionSequence()
const counts = sequence.reduce<Record<string, number>>((acc, e) => {
  acc[e.kind] = (acc[e.kind] ?? 0) + 1
  return acc
}, {})
console.log(
  `  the gesture: ${sequence.length} interactions — ` +
    Object.entries(counts)
      .map(([k, n]) => `${n} ${k}`)
      .join(", "),
)
console.log(
  `  in a person's time that is ${(40 * 16) / 1000}s of mouse movement at 60 fps,\n` +
    "  then a tab, then one click.\n",
)

const TRANSPORTS: [string, () => Boundary][] = [
  ["main thread (12)", mainBoundary],
  ["Web Worker (13)", workerBoundary],
  ["WS, LAN (14)", socketBoundary],
]

const results: RunResult[] = []
for (const policy of ["A-everything", "B-protocol-subset", "C-plus-style-ir"] as Policy[]) {
  for (const [name, make] of TRANSPORTS) {
    results.push(await runSequence(policy, make, name))
  }
}

console.log(
  `  ${line("policy", 26)}${line("transport", 18)}${pad("RPCs", 6)}${pad("local", 7)}` +
    `${pad("commits", 9)}${pad("muts", 6)}${pad("bytes", 8)}${pad("total ms", 10)}`,
)
console.log(`  ${"-".repeat(90)}`)
let lastPolicy: Policy | null = null
for (const r of results) {
  if (lastPolicy !== null && r.policy !== lastPolicy) console.log(`  ${" ".repeat(90)}`.trimEnd())
  lastPolicy = r.policy
  console.log(
    `  ${line(POLICY_LABEL[r.policy], 26)}${line(r.transport, 18)}${pad(r.rpcs, 6)}` +
      `${pad(r.localResolutions, 7)}${pad(r.reactCommits, 9)}${pad(r.mutationsBack, 6)}` +
      `${pad(r.bytes, 8)}${pad(r.totalMs.toFixed(2), 10)}`,
  )
}

const worstA = results.find((r) => r.policy === "A-everything" && r.transport === "WS, LAN (14)")
const bestC = results.find((r) => r.policy === "C-plus-style-ir" && r.transport === "WS, LAN (14)")

console.log(
  `\n  The numbers to read are the first and last rows of the socket column:\n` +
    `    A over a LAN socket : ${worstA?.rpcs} RPCs, ${worstA?.bytes} B, ` +
    `${worstA?.totalMs.toFixed(1)} ms\n` +
    `    C over a LAN socket : ${bestC?.rpcs} RPCs, ${bestC?.bytes} B, ` +
    `${bestC?.totalMs.toFixed(1)} ms\n` +
    `    ratio               : ${((worstA?.totalMs ?? 1) / (bestC?.totalMs ?? 1)).toFixed(0)}x`,
)
console.log(
  "\n  Look at policy A's `commits` column against its `RPCs` column. Most of\n" +
    "  those round trips ended in `setHovered(sameValue)`, React bailed out, and\n" +
    "  nothing re-rendered. The transport was paid in full anyway. A high-frequency\n" +
    "  event is expensive even when the answer is 'nothing changed' — which is\n" +
    "  precisely the case the host can decide for itself.",
)

// The extrapolation. Labelled, because it is arithmetic, not a measurement.
const WAN_ONE_WAY_MS = 20
console.log(
  "\n  EXTRAPOLATED (arithmetic on the measured RPC counts, not a measurement):\n" +
    `  the same gesture with the plugin on another machine, ${WAN_ONE_WAY_MS} ms each way:\n`,
)
console.log(`    ${line("policy", 26)}${pad("RPCs", 6)}${pad("network alone", 16)}`)
console.log(`    ${"-".repeat(48)}`)
const wanSeconds = (rpcs: number): number => (rpcs * 2 * WAN_ONE_WAY_MS) / 1000
for (const policy of ["A-everything", "B-protocol-subset", "C-plus-style-ir"] as Policy[]) {
  const r = results.find((x) => x.policy === policy && x.transport === "WS, LAN (14)")
  console.log(
    `    ${line(POLICY_LABEL[policy], 26)}${pad(r?.rpcs ?? 0, 6)}` +
      `${pad(wanSeconds(r?.rpcs ?? 0).toFixed(2) + " s", 16)}`,
  )
}
console.log(
  `\n  Policy A spends ${wanSeconds(worstA?.rpcs ?? 0).toFixed(2)} s of network on ` +
    `${(40 * 16) / 1000} s of mouse movement. The\n` +
    "  pointer would be rows past where the highlight is, permanently, and the gap\n" +
    "  would grow for as long as the user kept moving. That is what CLAUDE.md means\n" +
    '  by "fatal when the plugin runs on another machine" — not slow, WRONG: the\n' +
    "  UI would be showing a state the user has already left.",
)

// And the local alternative, timed directly.
const HOVER_ITERATIONS = 200_000
const hoverState = new Set<string>(["light", "hover"])
const hoverClass = "p-2 rounded-md hover:bg-muted focus:border-accent dark:border-zinc-700"
for (let i = 0; i < 5_000; i++) resolveForState(hoverClass, hoverState) // settle V8
const hoverStart = performance.now()
let hoverSink = 0
for (let i = 0; i < HOVER_ITERATIONS; i++) {
  hoverSink += resolveForState(hoverClass, hoverState).length
}
const hoverMs = performance.now() - hoverStart
console.log(
  `\n  and the thing policy C does instead of an RPC, timed directly:\n` +
    `    ${HOVER_ITERATIONS.toLocaleString("en-US")} variant resolutions in ${hoverMs.toFixed(1)} ms ` +
    `= ${((hoverMs * 1000) / HOVER_ITERATIONS).toFixed(3)} µs per hover transition\n` +
    `    (checksum ${hoverSink}, so the loop cannot be optimised away)`,
)

// --- 11.4 the environment channel ------------------------------------------

console.log("\n=== 4. The environment channel: state, pushed on change ===\n")

const envBoundary = workerBoundary()
const envHost = createOutlineHost()
const envController = createController({
  App: (() =>
    createElement(
      "column",
      { className: "gap-4" },
      createElement(BurndownPanel, {}),
      createElement(ListWithHostHover, {}),
    )) as ComponentType<unknown>,
  // The seed. `initialize`'s `env` field, so the first frame is already right.
  env: { colorScheme: "light", accentColor: "#3478f6" },
  boundary: envBoundary,
})

let envLines: string[] = []
const unsubEnv = envController.subscribe((tree) => {
  envLines = envHost.render(tree)
})
await envController.connect()
envLines = envHost.render(envController.getTree())

const findLine = (needle: string, lines: string[]): string =>
  lines.find((l) => l.includes(needle))?.trim() ?? "(not found)"

console.log("  connected with env = { colorScheme: 'light' }:")
console.log(`    ${findLine("chart", envLines)}`)
console.log(`    ${findLine("bg-card text-foreground", envLines)}`)
console.log(`    ${findLine('<row id="t1"', envLines)}`)

const commitsBefore = envController.stats.commits
const mutationsBefore = envController.stats.mutationsBack
const bytesBefore = envBoundary.bytes
const notificationsBefore = environmentNotifications

// The host's window went dark. AppKit's `HostEnvironmentObserver` fires here:
// "Calls back whenever anything in the HostEnvironment changes, so a host can
//  push the new value to its plugin. Only fires on a *real* change."
// (packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift:67)
envHost.state.colorScheme = "dark"
await envController.setEnvironment({ colorScheme: "dark" })
envLines = envHost.render(envController.getTree())

console.log("\n  host flips to dark and pushes { colorScheme: 'dark' }:")
console.log(`    ${findLine("chart", envLines)}`)
console.log(`    ${findLine("bg-card text-foreground", envLines)}`)
console.log(`    ${findLine('<row id="t1"', envLines)}`)
console.log(
  `\n    ${envBoundary.bytes - bytesBefore} B crossed, ` +
    `${envController.stats.commits - commitsBefore} React commit(s), ` +
    `${envController.stats.mutationsBack - mutationsBefore} mutation(s) came back.`,
)
console.log(
  "\n  Two different things just happened on two different sides of the boundary.\n" +
    "\n    the chart's series colors  CHANGED, and had to: there is no semantic token\n" +
    "                               for 'series 2 of a burndown'. Picking #60a5fa\n" +
    "                               over #2563eb is an authoring decision about\n" +
    "                               legibility, so the plugin re-rendered.\n" +
    "\n    `bg-card` on the same node DID NOT MOVE. It was already the string\n" +
    "                               \"bg-card\" in the tree; the host resolves it\n" +
    "                               against its own appearance, per view, at paint\n" +
    "                               time. And `dark:border-zinc-700` on the rows\n" +
    "                               resolved from the host's own styleState — the\n" +
    "                               plugin was never asked.",
)

// The no-op push. The real store's shallowEqual guard, measured.
const notificationsBeforeNoop = environmentNotifications
const commitsBeforeNoop = envController.stats.commits
await envController.setEnvironment({ colorScheme: "dark" })
await envController.setEnvironment({ colorScheme: "dark", accentColor: "#3478f6" })
console.log(
  `\n  two more pushes of the SAME environment (hosts re-send it on window\n` +
    `  activation): ${environmentNotifications - notificationsBeforeNoop} store notifications, ` +
    `${envController.stats.commits - commitsBeforeNoop} React commits.\n` +
    "  That is `shallowEqual` in react-runtime/src/environment.ts:39, and the\n" +
    "  comment above it says what it is protecting: `useSyncExternalStore` would\n" +
    "  re-render the entire tree on each one if the object were rebuilt every time.",
)
console.log(
  `\n  environment pushes so far: ${envController.stats.environmentPushes}, ` +
    `store notifications: ${environmentNotifications - notificationsBefore}. ` +
    `Not a stream — a value.`,
)

unsubEnv()
await envController.destroy()

// --- 11.5 the step-12 asymmetry --------------------------------------------

console.log("\n=== 5. What a main-thread host has to do out of band ===\n")

console.log(
  "  Everything above used `controller.setEnvironment(...)`. That method does not\n" +
    "  exist. `packages/host-sdk/src/types.ts` declares ten members and\n" +
    "  `setEnvironment` is not among them; none of the three controllers defines\n" +
    "  it. Here is what each runtime actually has:\n",
)

const asymmetry: [string, string, string, string][] = [
  ["", "main (12)", "worker (13)", "websocket (14)"],
  ["initialize() handshake", "no", "yes", "yes"],
  ["PROTOCOL_VERSION check", "no", "yes", "yes"],
  ["seeds env at connect", "no", "no*", "no*"],
  ["setEnvironment on controller", "no", "no", "no"],
  ["setEnvironment on the wire", "n/a", "yes", "yes"],
]
for (const [label, m, w, s] of asymmetry) {
  console.log(`    ${line(label, 30)}${line(m, 12)}${line(w, 14)}${s}`)
}
console.log(
  "\n    * `initialize`'s request type HAS an `env` field (protocol/src/rpc.ts:19)\n" +
    "      and the schema keeps it (validators.ts:52, with a comment explaining\n" +
    "      that Zod would otherwise strip it). Neither TS controller passes it.\n" +
    "      The only host that does is Swift: Shell.swift:131.",
)

console.log(
  "\n  So a main-thread host that wants dark mode reaches around the seam. The\n" +
    "  literal code is `import { setHostEnvironment } from \"@uniview/react-runtime\"`\n" +
    "  followed by a direct call — which works precisely because there is no\n" +
    "  boundary, and which is therefore available on exactly one of the three\n" +
    "  runtimes:",
)

// Housekeeping that is itself a finding. Section 4's controller was destroyed,
// and the environment store is STILL dark: `resetRuntimeState()` unmounts the
// root and clears the handler registry (react-runtime/src/runtime.ts:90-101)
// and deliberately does not touch the environment. Reset it by hand so the
// first-frame demonstration below starts where a fresh page would.
console.log(
  `\n  (the store survived section 4's destroy() — ` +
    `${JSON.stringify(getHostEnvironment())} — resetting it by hand)`,
)
setHostEnvironment({ colorScheme: "light", accentColor: undefined })

const oobHost = createOutlineHost()
const oobController = createController({
  App: BurndownPanel as ComponentType<unknown>,
})
let oobLines: string[] = []
const unsubOob = oobController.subscribe((t) => {
  oobLines = oobHost.render(t)
})
await oobController.connect()
oobLines = oobHost.render(oobController.getTree())
console.log(`\n    first frame (no env seeded)      : ${findLine("chart", oobLines)}`)

// THE out-of-band call. No controller involved. This is the whole of what a
// main-thread host can do, and it is a module-level function in the PLUGIN's
// package being called by HOST code.
sync.flushSyncFromReconciler(() => {
  setHostEnvironment({ colorScheme: "dark" })
})
sync.flushPassiveEffects()
oobLines = oobHost.render(oobController.getTree())
console.log(`    after setHostEnvironment(dark)   : ${findLine("chart", oobLines)}`)

console.log(
  "\n  It works, and three things about it are worth naming.\n" +
    "\n  1. The first frame was WRONG. Finding 2: the main controller has no\n" +
    "     `initialize`, so it has nowhere to seed the environment before the first\n" +
    "     render. The plugin painted a light palette and then repainted dark. In\n" +
    "     a Worker the seed has a place to go — `initialize({ env })` — and\n" +
    "     react-runtime's comment says exactly why it is there: \"so a plugin that\n" +
    "     keys off `useColorScheme()` doesn't paint a light tree, ship it to the\n" +
    "     host, and then repaint dark a round trip later.\"\n" +
    "\n  2. The host now imports from the plugin's runtime package. `@uniview/host-sdk`\n" +
    "     is described as the \"Framework-agnostic host SDK\"; this line makes the\n" +
    "     host depend on `@uniview/react-runtime` — and a Solid plugin would need\n" +
    "     `@uniview/solid-runtime`'s `setHostEnvironment` instead, which is a\n" +
    "     different function in a different package with the same name.\n" +
    "\n  3. The store is module-level, and on the main thread that premise breaks.",
)

// 5.3 — the shared-store demonstration.
const secondHost = createOutlineHost()
const secondController = createController({
  App: BurndownPanel as ComponentType<unknown>,
})
let secondLines: string[] = []
const unsubSecond = secondController.subscribe((t) => {
  secondLines = secondHost.render(t)
})
await secondController.connect()
secondLines = secondHost.render(secondController.getTree())

console.log(
  `\n    a SECOND main-thread plugin mounts in the same page. Nobody pushed an\n` +
    `    environment to it:\n` +
    `      plugin 2's first frame : ${findLine("chart", secondLines)}\n` +
    `      getHostEnvironment()   : ${JSON.stringify(getHostEnvironment())}`,
)
console.log(
  "\n    It inherited plugin 1's dark mode, because `let current` in\n" +
    "    react-runtime/src/environment.ts is one variable per MODULE, and the\n" +
    "    doc comment above it justifies that with a premise: \"a plugin owns its\n" +
    "    entire runtime — one Worker, one process, one React root — so there is no\n" +
    "    second environment to be in.\" That is exactly true in a Worker and over a\n" +
    "    socket. On the main thread it is false, and two plugins in one page share\n" +
    "    one environment whether or not their hosts agree — which matters because\n" +
    "    HostEnvironment.swift is careful to read the appearance PER VIEW: \"a window\n" +
    "    can carry `<Window appearance=\"light\">` while the system is dark, and the\n" +
    "    plugin has to agree with the pixels it actually produced.\"",
)

unsubOob()
await oobController.destroy()
unsubSecond()
await secondController.destroy()

// --- 11.6 the handler nobody will ever call --------------------------------

console.log("\n=== 6. The handler id that is minted and never bound (finding 3) ===\n")

const f3Host = createOutlineHost()
const f3Controller = createController({ App: ListWithPluginHover as ComponentType<unknown> })
const unsubF3 = f3Controller.subscribe((t) => void f3Host.render(t))
await f3Controller.connect()
f3Host.render(f3Controller.getTree())

console.log(`  handler ids in the tree that a host CAN bind : ${f3Host.bindings.size}`)
console.log(`  handler ids in the tree that no host binds   : ${f3Host.unbindable.size}`)
for (const [key, id] of [...f3Host.unbindable].slice(0, 2)) {
  const [row, event] = key.split(" ")
  console.log(`    row ${line(row, 6)}_${line(`${event}HandlerId`, 24)} -> ${id}`)
}
console.log(
  `\n    extractEventName("_onMouseMoveHandlerId") -> ${extractEventName("_onMouseMoveHandlerId")}` +
    `\n    extractEventName("_onClickHandlerId")     -> ${extractEventName("_onClickHandlerId")}`,
)
console.log(
  "\n  `serializeProps` tests `/^on[A-Z]/`, not `EVENT_PROPS.includes(key)`\n" +
    "  (react-renderer/src/serialization/serialize-props.ts:50), so the id is\n" +
    "  minted, serialized, and shipped on every commit. `extractEventName` then\n" +
    "  returns null for it and every host's EVENT_MAP has no slot for it, so it is\n" +
    "  never called. The plugin author gets no warning — the same file DOES warn\n" +
    "  about nested functions inside object props, so the silence here is a gap,\n" +
    "  not a policy.\n" +
    "\n  Which is, read charitably, the protocol enforcing this step's rule the only\n" +
    "  way it can: a pointer-rate event has no name, so it cannot be subscribed to,\n" +
    "  so it cannot become a round trip.",
)

unsubF3()
await f3Controller.destroy()

// --- 11.7 summary ----------------------------------------------------------

console.log("\n=== 7. Stage D, closed ===\n")

const summaryRows: [string, string][] = [
  ["click / submit / change", "round-trips. That is what a handler id is FOR."],
  ["keydown", "round-trips, but only for keys the node DECLARED."],
  ["mouseenter / mouseleave", "may round-trip. Should not, if a variant will do."],
  ["hover / focus / active styling", "never. Resolved host-side, per view (step 16)."],
  ["pointer position, scroll", "never. The protocol has no word for them."],
  ["dark mode, accent, reduce-motion", "pushed as STATE, on change, not as events."],
]
for (const [what, rule] of summaryRows) {
  console.log(`  ${line(what, 34)}${rule}`)
}

console.log(
  "\n  The declare-interest model is the same idea applied to the keyboard, and\n" +
    "  Keyboard.swift states the failure it avoids better than any table can:\n" +
    "\n    \"The alternative — stream every `keyDown` to the plugin and let it decide\n" +
    "     — is the one thing this framework cannot do. A keystroke would cross a\n" +
    "     process boundary (and, in bridge mode, a *network*) before the letter\n" +
    "     appears; and every key the plugin ignored would have been stolen from the\n" +
    "     responder chain on the way, so ⌘C, the arrow keys inside a text field,\n" +
    "     and IME composition would all quietly stop working.\"\n" +
    "    (packages/UniviewAppKit/Sources/UniviewAppKit/Keyboard.swift:13)\n" +
    "\n  Step 16 is the mechanism that makes policy C's row possible: the Style IR,\n" +
    "  where `hover:`/`focus:`/`dark:` travel with the node as a structured\n" +
    "  `variants` map and semantic tokens like `card` arrive as NAMES for the host\n" +
    "  to resolve against its own appearance. This step is the argument for why\n" +
    "  they must.",
)
