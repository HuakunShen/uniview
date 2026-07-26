/**
 * Step 04 — Serializing the tree: live host instances -> a JSON-safe `UINode`,
 * and how a function prop becomes a `HandlerId`.
 *
 * Step 03 built a real `HostConfig` and watched React grow a tree of host
 * instances. Those instances are *not* the wire format, and the gap between
 * them is bigger than it looks:
 *
 *   ┌──────────────────────────────┐        ┌────────────────────────────────┐
 *   │  InternalNode (plugin side)  │        │  UINode (the wire)             │
 *   │  - parent back-pointer       │  ===>  │  - no cycles                   │
 *   │  - live child references     │        │  - JSONValue props only        │
 *   │  - props exactly as React    │        │  - `_onClickHandlerId` strings │
 *   │    handed them over:         │        │  - survives structured clone,  │
 *   │    functions, React elements │        │    a socket, and a Swift       │
 *   │    holding fibers, undefined │        │    decoder with no JS runtime  │
 *   └──────────────────────────────┘        └────────────────────────────────┘
 *
 * Two things make that arrow non-trivial, and this file demonstrates both by
 * running into them:
 *
 *   1. The obvious `JSON.stringify(instance.props)` THROWS. React puts the
 *      element's `children` into props, those children are React elements, and
 *      in development each one carries an `_owner` pointing at the fiber that
 *      created it — which points back at the whole fiber tree. Section 2 does
 *      it anyway and prints the real error.
 *
 *   2. `onClick` is a function, and no boundary in Uniview's list carries a
 *      function: structured clone throws `DataCloneError`, `JSON.stringify`
 *      silently drops it, and AppKit has no JS runtime to receive it at all.
 *      So the function does not travel. What travels is a *name* for it — a
 *      `HandlerId` string — while the closure stays in a registry on the
 *      plugin side. The host sends the name back; the plugin runs the closure.
 *
 * That second idea is the load-bearing one. It is why the plugin can move into
 * a Web Worker (step 13) or another process (step 14) without the tree
 * changing shape, and why a host with no JavaScript at all (step 10) can still
 * have working buttons.
 *
 * A registry only works if it is also a *release* mechanism. A registry that
 * only grows is a leak that pins every closure — and every variable those
 * closures captured — for the life of the plugin. Sections 6-8 re-render,
 * remove a node and unmount, printing the registry size at each stage next to
 * a naive counter-based registry running side by side, so the difference is a
 * number rather than an assertion.
 */

import { createContext, createElement, useState } from "react"
import ReactReconciler from "react-reconciler"
import type { HostConfig, ReactContext } from "react-reconciler"
import {
  ConcurrentRoot,
  DefaultEventPriority,
  NoEventPriority,
} from "react-reconciler/constants"

// ---------------------------------------------------------------------------
// 1. The protocol, copied forward from step 01
// ---------------------------------------------------------------------------
// Every step stands alone (see learn/RULES.md), so the contract is re-declared
// here rather than imported. Unchanged from steps 01 and 03.

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

/** Step 03's printer, unchanged. */
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

// -- New in step 04: the event half of the protocol ---------------------------
// Copied from packages/protocol/src/events.ts. Note that `HandlerId` is just a
// string: the protocol deliberately does not care how ids are minted, only that
// the same string means the same closure on both sides.

export type HandlerId = string

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
 * The payload an `onKeyDown` handler receives — deliberately a field-for-field
 * subset of the DOM's `KeyboardEvent`. The same plugin tree renders on a web
 * host, where `onKeyDown` is handed the real thing; a native host that invented
 * its own field names would mean one tree that reads its keys two different
 * ways depending on who renders it.
 *
 * Every field is a `JSONValue`. That is not a coincidence: the payload has to
 * make the same trip back that the tree made outbound.
 */
export interface KeyDownEvent {
  key: string
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  repeat: boolean
}

/** `onClick` -> `_onClickHandlerId`. */
const handlerIdProp = (eventProp: EventPropName): string => `_${eventProp}HandlerId`

/** `_onClickHandlerId` -> true. How a host finds the callable props on a node. */
const isHandlerIdProp = (propName: string): boolean =>
  propName.startsWith("_") && propName.endsWith("HandlerId")

const HANDLER_ID_PREFIX_LENGTH = 1
const HANDLER_ID_SUFFIX_LENGTH = 9 // "HandlerId".length

/** `_onClickHandlerId` -> "onClick", or null if it is not an event the protocol knows. */
function extractEventName(prop: string): EventPropName | null {
  if (!isHandlerIdProp(prop)) return null
  const eventName = prop.slice(HANDLER_ID_PREFIX_LENGTH, -HANDLER_ID_SUFFIX_LENGTH)
  return EVENT_PROPS.includes(eventName as EventPropName)
    ? (eventName as EventPropName)
    : null
}

// ---------------------------------------------------------------------------
// 2. The live host tree, copied forward from step 03
// ---------------------------------------------------------------------------
// `InternalNode` is what `createInstance` returns. It has a `parent`
// back-pointer, so the tree contains a cycle before we even get to React's own
// props — walking it with `JSON.stringify` could never work.

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

interface RenderBridge {
  rootInstance: InternalNode | null
}

let instanceCounter = 0
let textNodeCounter = 0
const generateId = (): string => `node-${instanceCounter++}`
const generateTextNodeId = (): string => `text-${textNodeCounter++}`

// ---------------------------------------------------------------------------
// 3. NEW: the handler registry
// ---------------------------------------------------------------------------
// This is the whole answer to "a function prop cannot cross the boundary".
//
// Handler ids are DETERMINISTIC — `${nodeId}:${propName}` — and that single
// decision buys three things at once:
//
//   - re-rendering a node OVERWRITES its entries instead of appending new ones,
//     so the registry does not grow with render count;
//   - an event that arrives after a re-render (the host is always a little
//     behind) executes the node's *latest* handler, which is the semantics a
//     user expects, rather than a stale closure;
//   - the id is derivable, so nothing has to be kept in sync between the tree
//     and the registry.
//
// Ownership is tracked per node so removal is possible at all: `syncNode`
// replaces a node's full handler set (dropping props that disappeared),
// `releaseNode` frees everything a removed node owned, and a full-tree walk
// brackets itself with `beginSweep`/`endSweep` to release nodes that silently
// left the tree.

type Handler = (...args: unknown[]) => unknown

class HandlerRegistry {
  private handlers = new Map<HandlerId, Handler>()
  private nodeHandlers = new Map<string, Set<HandlerId>>()
  private sweepSeen: Set<string> | null = null

  /**
   * Replace the handler set owned by a node. Ids present before but not in
   * `next` are released; ids in `next` are (re-)registered in place.
   */
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

  /** Release every handler owned by a node. */
  releaseNode(nodeId: string): void {
    const ids = this.nodeHandlers.get(nodeId)
    if (!ids) return
    for (const id of ids) this.handlers.delete(id)
    this.nodeHandlers.delete(nodeId)
  }

  /**
   * Start tracking which nodes a full-tree serialization touches. Nodes not
   * seen by the matching `endSweep` are released — they left the tree without
   * anyone telling the registry.
   */
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
   * The plugin-side end of an event RPC. `handlerId` and `args` both arrived as
   * JSON; the function they name never left this process.
   */
  async execute(handlerId: HandlerId, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(handlerId)
    if (!handler) {
      // Not an error. The host's tree is always slightly behind the plugin's,
      // so a click on a node that has just been removed is a normal race.
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
   * Teaching apparatus: not on the real class, and holding on to what it
   * returns is precisely the leak this whole design exists to avoid. Used once,
   * to prove that a stable id can point at a different function object.
   */
  peek(handlerId: HandlerId): Handler | undefined {
    return this.handlers.get(handlerId)
  }

  get size(): number {
    return this.handlers.size
  }

  /** Teaching apparatus: not on the real class. Lets us print what is in there. */
  describe(): string {
    if (this.handlers.size === 0) return "        (empty)"
    return [...this.handlers.entries()]
      .map(([id, fn]) => `        ${id.padEnd(22)} -> ${fn.name || "(anonymous closure)"}`)
      .join("\n")
  }
}

// -- Teaching apparatus: the design this one is NOT ---------------------------
// Step 01's tree carried `_onClickHandlerId: "h_1"`, and the real protocol's
// `HandlerId` doc comment still describes the format as "h_<counter> or uuid".
// That is the obvious design: mint a fresh id every time you meet a function.
// It is also a leak, because nothing ever tells you an id is dead. We run one
// alongside the real registry and print both sizes, so the difference is a
// number instead of a claim.
const naiveRegistry = new Map<string, Handler>()
let naiveCounter = 0
function naiveRegister(handler: Handler): void {
  naiveRegistry.set(`h_${naiveCounter++}`, handler)
}

// ---------------------------------------------------------------------------
// 4. NEW: serializeProps — where a function becomes a string
// ---------------------------------------------------------------------------

/**
 * Warn once per prop name when a nested function is found inside an object or
 * array prop. It will NOT become a handler id, and it will vanish silently the
 * moment the tree is stringified. Raycast-style `actions={[{ run() {} }]}`
 * arrays are the classic trap; model actions as child elements instead.
 */
const warnedNestedFunctionProps = new Set<string>()

function serializeProps(
  props: Record<string, unknown>,
  registry: HandlerRegistry,
  nodeId: string,
): Record<string, JSONValue> {
  const serializedProps: Record<string, JSONValue> = {}
  // Built fresh per call and handed to the registry in ONE shot. This is what
  // makes "a prop that disappeared is a handler that is released" fall out for
  // free, instead of needing a diff of old props against new props.
  const handlers = new Map<HandlerId, Handler>()

  for (const [key, value] of Object.entries(props)) {
    // React-internal props. `children` is the one that makes the naive
    // `JSON.stringify` throw; `key` and `ref` are React's, not the host's.
    if (key === "children" || key === "key" || key === "ref") continue

    if (typeof value === "function") {
      // Only top-level `on[A-Z]*` props become handler ids. Any other function
      // prop is dropped — there is no way to call it from the other side.
      if (/^on[A-Z]/.test(key)) {
        const handlerId: HandlerId = `${nodeId}:${key}`
        handlers.set(handlerId, value as Handler)
        // Note the regex, not a lookup in EVENT_PROPS: `onWhatever` gets an id
        // too. The protocol's EVENT_PROPS list is the HOST's whitelist of what
        // it knows how to fire — see `extractEventName` below, which returns
        // null for an id prop no host can trigger.
        serializedProps[`_${key}HandlerId`] = handlerId
      }
      continue
    }
    // `undefined` is not a JSON value — drop it. `null` IS a valid JSONValue
    // (`value={null}` clears a controlled input) and must survive.
    else if (value === undefined) {
      continue
    } else if (value === null) {
      serializedProps[key] = null
    } else {
      try {
        let hasNestedFunction = false
        JSON.stringify(value, (_k, v: unknown) => {
          if (typeof v === "function") {
            hasNestedFunction = true
            return undefined
          }
          return v
        })
        if (hasNestedFunction && !warnedNestedFunctionProps.has(key)) {
          warnedNestedFunctionProps.add(key)
          console.warn(
            `[uniview] prop "${key}" contains nested function(s) that will NOT become event ` +
              `handlers — only top-level on[A-Z]* function props are converted to handler ids. ` +
              `Pass callbacks as top-level props or model the data as child elements.`,
          )
        }
        serializedProps[key] = value as JSONValue
      } catch {
        // A value that cannot be stringified at all (a cycle of the author's
        // own making) is skipped rather than allowed to kill the render.
        continue
      }
    }
  }

  registry.syncNode(nodeId, handlers)
  return serializedProps
}

// ---------------------------------------------------------------------------
// 5. serializeTree — step 03's walk, now bracketed by a registry sweep
// ---------------------------------------------------------------------------

function serializeTree(
  instance: InternalNode | TextNode | null,
  registry: HandlerRegistry,
): UINode | null {
  // Without this bracket, full-update mode leaks a handler for every node that
  // ever left the tree: nothing else in this mode reports a removal.
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
    // Text children are explicit nodes with stable ids so mutations can address
    // them (insertBefore anchors, setText). Text nodes carry no props, so they
    // can never own a handler.
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

  // Teaching apparatus, outside the real code path: register the same functions
  // into the counter-based registry described above, so its size can be printed
  // next to the real one.
  for (const [key, value] of Object.entries(instance.props)) {
    if (typeof value === "function" && /^on[A-Z]/.test(key)) naiveRegister(value as Handler)
  }

  // Note what is NOT copied: `parent`. That back-pointer is the reason the live
  // tree is a graph and the serialized tree is a tree.
  return {
    id: instance.id,
    type: instance.type,
    props: serializeProps(instance.props, registry, instance.id),
    children,
  }
}

// ---------------------------------------------------------------------------
// 6. The HostConfig — unchanged from step 03, minus its tracing
// ---------------------------------------------------------------------------
// Step 03 is where this object is explained callback by callback. Nothing here
// knows about serialization: the host config grows a live mutable tree, and
// serialization takes a snapshot of it from the outside. That separation is why
// serialization can be run at whatever moment the transport wants.
//
// One addition for this step: `createInstance` stashes the raw props object
// React handed it, so section 2 of the output can try to stringify it.

const rawPropsAtMount = new Map<string, Record<string, unknown>>()

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
    const instance: Instance = {
      type,
      props: { ...props },
      children: [],
      id: generateId(),
      parent: null,
    }
    // Teaching apparatus only. `{ ...props }` is a SHALLOW copy, so
    // `instance.props.children` is still React's own array of elements — which
    // is exactly the object section 2 fails to stringify.
    if (!rawPropsAtMount.has(instance.id)) {
      rawPropsAtMount.set(instance.id, instance.props)
    }
    return instance
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
  },

  appendChildToContainer(container: Container, child: Instance): void {
    container.rootInstance = child
  },

  insertBefore(parent, child, beforeChild): void {
    detachFromParent(child)
    const index = parent.children.indexOf(beforeChild)
    child.parent = parent
    parent.children.splice(index === -1 ? parent.children.length : index, 0, child)
  },

  insertInContainerBefore(): void {
    throw new Error("[step04] plugin root must be a single element")
  },

  removeChild(parent, child): void {
    const index = parent.children.indexOf(child)
    if (index !== -1) {
      parent.children.splice(index, 1)
      child.parent = null
    }
    // NOTE what is deliberately absent: a `registry.releaseNode(child.id)`.
    // In full-tree mode the sweep in `serializeTree` is what frees it, because
    // the host config has no registry reference at all. The real renderer
    // releases here only in incremental mode, from the MutationCollector.
  },

  removeChildFromContainer(container, child): void {
    if (container.rootInstance === child) container.rootInstance = null
  },

  clearContainer(container): void {
    container.rootInstance = null
  },

  commitUpdate(instance, _type, _oldProps, newProps): void {
    // Full props, not a patch — and note that the NEW closures arrive here.
    // Nothing is serialized yet; the props object still holds live functions.
    instance.props = { ...newProps }
  },

  commitTextUpdate(textInstance, _oldText, newText): void {
    textInstance.text = newText
  },

  prepareForCommit: () => null,
  resetAfterCommit(): void {},

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

  // Required by react-reconciler@0.33; omitting `resolveEventTimeStamp` fails at
  // RUNTIME, not at type-check time, unless the full annotation above is present.
  // Step 03 documents that trap.
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
// 7. The host side of the wire — deliberately given nothing but JSON
// ---------------------------------------------------------------------------

interface HandlerBinding {
  nodeId: string
  event: EventPropName
  handlerId: HandlerId
}

/**
 * What a host does with a serialized tree: find the props that name a callable.
 * Note it needs no knowledge of the plugin, of React, or of what `onClick`
 * does — a `_`-prefixed `HandlerId` prop is a string it can send back.
 */
function findHandlerBindings(node: UINode, out: HandlerBinding[] = []): HandlerBinding[] {
  for (const [key, value] of Object.entries(node.props)) {
    const event = extractEventName(key)
    // `isHandlerIdProp` is true but `extractEventName` is null for an event the
    // protocol does not list — the host would have no way to fire it.
    if (event === null) continue
    out.push({ nodeId: node.id, event, handlerId: String(value) })
  }
  for (const child of node.children) {
    if (typeof child !== "string") findHandlerBindings(child, out)
  }
  return out
}

/** Structural equality, so the round-trip check is a real assertion. */
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

let roundTripsRun = 0
let roundTripsPassed = 0

/**
 * The proof that the output is wire-safe. `JSON.parse(JSON.stringify(x))` is a
 * strictly *weaker* boundary than the ones Uniview actually crosses — structured
 * clone additionally throws on functions instead of dropping them, and a Swift
 * decoder rejects anything it has no type for — so a tree that loses information
 * here would lose it everywhere.
 */
function assertWireSafe(label: string, tree: UINode | null): void {
  roundTripsRun += 1
  const wire = JSON.stringify(tree)
  const back = JSON.parse(wire) as UINode | null
  const ok = deepEqual(tree, back)
  if (ok) roundTripsPassed += 1
  console.log(
    `  [${ok ? "PASS" : "FAIL"}] ${label.padEnd(34)} ` +
      `${String(bytes(tree)).padStart(4)} B survived JSON.parse(JSON.stringify(...)) unchanged`,
  )
}

// ---------------------------------------------------------------------------
// 8. A component with real closures over real state
// ---------------------------------------------------------------------------
// Every render creates BRAND NEW function objects for `onClick` and `onKeyDown`,
// each capturing that render's `count`. That is the normal React idiom and it is
// what makes the registry's replace-in-place behaviour matter: the ids are
// stable while the functions behind them are not.

function Counter(): ReturnType<typeof createElement> {
  const [count, setCount] = useState(0)

  return createElement(
    "column",
    { gap: 8, padding: 16 },
    `Clicked ${count} times`,
    createElement(
      "button",
      {
        title: "increment",
        disabled: false,
        // A JSON-safe array prop: it travels as-is.
        keyDownEvents: ["Enter"],
        // `undefined` is dropped, `null` survives — see serializeProps.
        badge: null,
        tooltip: undefined,
        onClick: () => {
          console.log(`      [plugin] onClick closure ran; it captured count=${count}`)
          setCount(count + 1)
        },
        onKeyDown: (event: KeyDownEvent) => {
          console.log(
            `      [plugin] onKeyDown closure ran with key="${event.key}" ` +
              `(meta=${event.metaKey}); it captured count=${count}`,
          )
          setCount(count + 1)
        },
      },
      "Click me",
    ),
    // Appears only after the first click, and disappears again when it is used.
    // Its handler is what section 7 watches being released.
    count > 0
      ? createElement("button", { title: "reset", onClick: () => setCount(0) }, "Reset")
      : null,
  )
}

// ---------------------------------------------------------------------------
// 9. Drive it
// ---------------------------------------------------------------------------

const reconciler = ReactReconciler(hostConfig)

/** Step 03 explains this seam: the 0.33 runtime and its published types disagree. */
interface SynchronousReconciler {
  flushSyncFromReconciler<Result>(callback: () => Result): Result
  flushPassiveEffects(): boolean
}
const sync = reconciler as typeof reconciler & SynchronousReconciler

const bridge: RenderBridge = { rootInstance: null }
const registry = new HandlerRegistry()

const container = reconciler.createContainer(
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

function render(element: ReturnType<typeof createElement> | null): void {
  sync.flushSyncFromReconciler(() => {
    reconciler.updateContainer(element, container, null, () => {})
  })
  sync.flushPassiveEffects()
}

/**
 * One event arriving from the host. Both arguments came off the wire as JSON;
 * nothing here has a reference to any plugin function.
 */
function dispatchFromHost(handlerId: HandlerId, args: JSONValue[] = []): void {
  console.log(`      [host]   -> executeHandler(${JSON.stringify(handlerId)}, ${JSON.stringify(args)})`)
  sync.flushSyncFromReconciler(() => {
    void registry.execute(handlerId, ...args)
  })
  sync.flushPassiveEffects()
}

const sizes = (): string =>
  `live handlers: ${registry.size}   |   naive h_<counter> registry: ${naiveRegistry.size}`

// -- 1. Mount -----------------------------------------------------------------

console.log("=== 1. Mount: React has grown a tree of host instances ===")
render(createElement(Counter))
const button = bridge.rootInstance?.children.find(
  (c): c is InternalNode => !isTextNode(c) && c.type === "button",
)
console.log(
  `  root <${bridge.rootInstance?.type}>#${bridge.rootInstance?.id} with ` +
    `${bridge.rootInstance?.children.length} children; the button is #${button?.id}.`,
)
console.log("  Nothing has been serialized yet. The props are exactly what React handed over:")
for (const [key, value] of Object.entries(button?.props ?? {})) {
  const kind = Array.isArray(value)
    ? `array(${value.length})`
    : value === null
      ? "null"
      : typeof value
  console.log(`    ${key.padEnd(14)} ${kind}`)
}

// -- 2. The naive attempt -----------------------------------------------------

console.log("\n=== 2. The obvious thing, and why it does not work ===")

const rootRawProps = rawPropsAtMount.get(bridge.rootInstance?.id ?? "") ?? {}
console.log("  (a) JSON.stringify(columnInstance.props) — props still contain React's `children`:")
try {
  JSON.stringify(rootRawProps)
  console.log("      ...it did not throw. (It should have.)")
} catch (error) {
  const err = error as Error
  console.log(`      ${err.name}: ${err.message.split("\n")[0]}`)
  for (const line of err.message.split("\n").slice(1)) {
    if (line.trim().length > 0) console.log(`      ${line}`)
  }
}
console.log(
  "      Read the path V8 printed: `children` is an Array, index 1 of it is a\n" +
    "      React element, and following that element leads (through the elided\n" +
    "      middle) back to `rootInstance` and round to `props` again. In\n" +
    "      development every element carries an `_owner` pointing at the fiber\n" +
    "      that created it; fibers reach the container, the container holds the\n" +
    "      root instance, and the root instance holds these very props.\n" +
    "      `children` is React's bookkeeping, not the host's — the host already\n" +
    "      has real child nodes — so serialization drops it, along with `key`\n" +
    "      and `ref`.",
)

console.log("\n  (b) So drop `children` and stringify what is left:")
const withoutChildren = { ...(button?.props ?? {}) } as Record<string, unknown>
delete withoutChildren.children
console.log(`      ${JSON.stringify(withoutChildren)}`)
console.log(
  "      No throw — and that is worse. `onClick` and `onKeyDown` were silently\n" +
    "      dropped, `tooltip: undefined` vanished, and the resulting node renders\n" +
    "      a button that does nothing at all. Over a Worker's structured clone the\n" +
    "      same props would instead throw DataCloneError. Neither is a UI.",
)

// -- 3. The fix ---------------------------------------------------------------

console.log("\n=== 3. serializeProps: a function becomes a HandlerId ===")
const treeV1 = serializeTree(bridge.rootInstance, registry)
console.log(treeV1 ? show(treeV1, 1) : "  (empty)")
console.log(
  "\n  `onClick` is gone and `_onClickHandlerId` is in its place. The id is\n" +
    "  `${nodeId}:${propName}` — deterministic, so re-rendering this node reuses\n" +
    "  the same id rather than minting a new one.",
)

// -- 3b. The nested-function trap ---------------------------------------------

console.log("\n=== 3b. Only TOP-LEVEL on[A-Z]* props become handlers ===")
console.log('  Serializing a node with `actions={[{ title: "Copy", run() {} }]}`:')
const asideRegistry = new HandlerRegistry()
const asideProps = serializeProps(
  { actions: [{ title: "Copy", run: () => "copied" }], onClick: () => {} },
  asideRegistry,
  "node-aside",
)
console.log(`  serialized: ${JSON.stringify(asideProps)}`)
console.log(
  `  after the wire: ${JSON.stringify(JSON.parse(JSON.stringify(asideProps)))}\n` +
    "  `run` is not in the registry and is not on the wire. It is simply gone —\n" +
    "  hence the one-time warning above. Model actions as child elements.",
)

console.log("\n=== 3c. A prop that disappears releases its id ===")
console.log(
  `  node-aside carried {onClick} above: ${asideRegistry.size} handler in the registry`,
)
serializeProps({ onClick: () => {}, onKeyDown: () => {} }, asideRegistry, "node-aside")
console.log(`  after {onClick, onKeyDown}: ${asideRegistry.size}`)
serializeProps({ onClick: () => {} }, asideRegistry, "node-aside")
console.log(`  after {onClick}:            ${asideRegistry.size}`)
serializeProps({ title: "no handlers left" }, asideRegistry, "node-aside")
console.log(`  after {title}:              ${asideRegistry.size}`)
console.log(
  "  `syncNode` is handed the node's WHOLE handler set each time and diffs it\n" +
    "  against what that node owned before — so removing an `onClick` from a JSX\n" +
    "  element frees its closure without anyone writing release code.",
)

// -- 4. The wire round-trip ---------------------------------------------------

console.log("\n=== 4. Is it actually wire-safe? ===")
assertWireSafe("tree after mount", treeV1)

// -- 5. Calling a handler by id -----------------------------------------------

console.log("\n=== 5. The host calls back, holding nothing but strings ===")
const overTheWire = JSON.parse(JSON.stringify(treeV1)) as UINode
const bindings = findHandlerBindings(overTheWire)
console.log("  what the host found in its JSON copy of the tree:")
for (const b of bindings) {
  console.log(`    ${b.nodeId.padEnd(8)} ${b.event.padEnd(12)} -> ${b.handlerId}`)
}
/** The host's own lookup, given a node and an event it wants to fire. */
function handlerIdFor(node: UINode, event: EventPropName): HandlerId | null {
  const value = node.props[handlerIdProp(event)]
  return typeof value === "string" ? value : null
}

const wireButton = overTheWire.children.find(
  (c): c is UINode => typeof c !== "string" && c.type === "button",
)
console.log(
  `  a direct lookup: props[${JSON.stringify(handlerIdProp("onClick"))}] on ` +
    `#${wireButton?.id} = ${JSON.stringify(wireButton && handlerIdFor(wireButton, "onClick"))}`,
)

console.log("\n  registry on the plugin side:")
console.log(registry.describe())
console.log(`  ${sizes()}`)

console.log("\n  now the host fires a click — by id, over JSON:")
const clickId = wireButton ? handlerIdFor(wireButton, "onClick") : null
const clickHandlerV1 = clickId ? registry.peek(clickId) : undefined
dispatchFromHost(clickId ?? "node-0:onClick")
console.log("  the closure that ran was created during the mount render and still")
console.log("  had `count = 0` captured. That is the whole point: it never left.")

// -- 6. Re-render: same ids, new closures -------------------------------------

console.log("\n=== 6. Re-render: same ids, different closures ===")
const treeV2 = serializeTree(bridge.rootInstance, registry)
console.log(treeV2 ? show(treeV2, 1) : "  (empty)")
console.log("\n  registry after the re-render:")
console.log(registry.describe())
console.log(`  ${sizes()}`)
console.log(
  "  The registry grew by exactly one entry, and it belongs to the node that is\n" +
    "  actually new (node-2, <button title=reset>). node-0's two ids are\n" +
    "  byte-identical to before — but the functions behind them are not:",
)
const clickHandlerV2 = clickId ? registry.peek(clickId) : undefined
console.log(
  `    same id "${clickId}", same function object? ` +
    `${clickHandlerV1 === clickHandlerV2}  (a NEW closure, capturing count=1)`,
)
console.log("\n  so a keystroke arriving now runs the latest closure, not the mounted one:")
const wireButtonV2 = (JSON.parse(JSON.stringify(treeV2)) as UINode).children.find(
  (c): c is UINode => typeof c !== "string" && c.type === "button",
)
dispatchFromHost(
  (wireButtonV2 && handlerIdFor(wireButtonV2, "onKeyDown")) ?? "node-0:onKeyDown",
  [{ key: "Enter", metaKey: false, shiftKey: false, altKey: false, ctrlKey: false, repeat: false }],
)
console.log(
  "  The payload was a plain object matching protocol's KeyDownEvent — a\n" +
    "  field-for-field subset of the DOM KeyboardEvent, so the same plugin code\n" +
    "  works whether a browser or an AppKit host produced the keystroke.",
)

const treeV3 = serializeTree(bridge.rootInstance, registry)
assertWireSafe("tree after two events", treeV3)
console.log(`  ${sizes()}`)

// -- 7. A node leaves the tree ------------------------------------------------

console.log("\n=== 7. Release: the reset button removes itself ===")
console.log(`  before: registry.has("node-2:onClick") = ${registry.has("node-2:onClick")}`)
dispatchFromHost("node-2:onClick")
const treeV4 = serializeTree(bridge.rootInstance, registry)
console.log(treeV4 ? show(treeV4, 1) : "  (empty)")
console.log(`  after:  registry.has("node-2:onClick") = ${registry.has("node-2:onClick")}`)
console.log(`  ${sizes()}`)
console.log(
  "  Nothing told the registry that node-2 was removed. `serializeTree`'s\n" +
    "  beginSweep/endSweep bracket noticed that node-2 was not visited this pass\n" +
    "  and released everything it owned.",
)

console.log("\n  a late event for the released id — the normal host/plugin race:")
dispatchFromHost("node-2:onClick")

// -- 8. Unmount ---------------------------------------------------------------

console.log("\n=== 8. Unmount: everything is released ===")
render(null)
const treeV5 = serializeTree(bridge.rootInstance, registry)
console.log(`  serialized tree: ${JSON.stringify(treeV5)}`)
console.log(`  ${sizes()}`)
console.log(
  "  `serializeTree(null)` still runs the sweep, so an unmount frees every\n" +
    "  closure — and with it every variable those closures captured.\n" +
    `  The naive registry still holds all ${naiveRegistry.size}: ${[...naiveRegistry.keys()].join(", ")}.`,
)

// -- 9. Summary ---------------------------------------------------------------

console.log("\n=== 9. What this step bought ===")
assertWireSafe("final (null) tree", treeV5)
console.log(
  `\n  round-trips: ${roundTripsPassed}/${roundTripsRun} PASS\n` +
    "  - The tree is now JSON: no parent pointers, no React elements, no cycles,\n" +
    "    no functions. It survives structured clone, a socket, and a decoder in a\n" +
    "    language with no JS runtime.\n" +
    "  - Interactivity survived the trip as a string. The host holds ids; the\n" +
    "    plugin holds closures; neither needs the other's memory.\n" +
    "  - Handler lifetime is tied to node lifetime, in both directions: a prop\n" +
    "    that disappears releases its id, and a node that leaves the tree\n" +
    "    releases all of them.\n" +
    "\n  Step 05 stops re-serializing the whole tree on every commit and emits the\n" +
    "  six mutations from step 01 instead — at which point the sweep is no longer\n" +
    "  the thing that frees handlers, and removeChild has to say so explicitly.",
)
