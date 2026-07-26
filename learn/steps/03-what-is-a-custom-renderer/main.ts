/**
 * Step 03 — What a "custom renderer" actually is.
 *
 * Steps 01 and 02 wrote `UINode`s and `Mutation`s by hand. Nobody would author
 * a UI that way. Step 03 is where a real React component starts producing that
 * same tree — and the point of the step is *how*, because the answer is not
 * "React was extended". React was already built in two halves:
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │  react-reconciler   — decides WHAT changed.                         │
 *   │                       Fibers, the render/commit split, keys and     │
 *   │                       diffing, hooks (useState / useEffect),        │
 *   │                       lanes and priorities, Suspense.               │
 *   │                       ~30k lines. Ships in the `react-reconciler`   │
 *   │                       package. Knows nothing about any screen.      │
 *   ├─────────────────────────────────────────────────────────────────────┤
 *   │  a HostConfig       — knows HOW to make it real.                    │
 *   │                       ~25 callbacks. "Create a thing of this type." │
 *   │                       "Put this thing inside that thing."           │
 *   │                       "This thing's props changed."                 │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * `react-dom` is not React. `react-dom` is *one HostConfig*, whose
 * `createInstance` happens to call `document.createElement`. `react-native` is
 * another. `react-three-fiber` is another (its instances are THREE.js objects).
 * Uniview's `packages/react-renderer` is another: its `createInstance` returns a
 * plain object, and the tree it grows is serialized to step 01's `UINode`.
 *
 * A "custom renderer" is exactly that object of callbacks. Nothing more.
 *
 * The reconciler never learns what a DOM is. Read the callbacks below: not one
 * of them mentions an element, a document, a window or a style sheet. The words
 * `column` and `button` in this file are *ours*; React treats them as opaque
 * strings it was handed and hands back.
 *
 * WHAT THIS FILE PRINTS, AND WHY IT IS THE LESSON:
 * every tree-shaping callback logs itself as the reconciler calls it, in order,
 * tagged with the phase it was called in. You are watching React drive a host
 * it has never heard of. Then one state update fires, and you watch the *update*
 * path — `commitTextUpdate`, `commitUpdate`, `appendChild` — do the same job
 * incrementally, without re-creating anything that did not change.
 */

import { createContext, createElement, useEffect, useState } from "react"
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
// here rather than imported. It is unchanged from step 01: JSON-only props, a
// stable `id` per node, text as an addressable node instead of a bare string.

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

/** Step 01's pretty-printer, unchanged apart from dropping the tag/primitive note. */
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

// ---------------------------------------------------------------------------
// 2. The host's own node types — what `createInstance` actually returns
// ---------------------------------------------------------------------------
// These mirror packages/react-renderer/src/reconciler/types.ts. They are NOT
// `UINode`: they carry a `parent` back-pointer and hold live child references,
// because the reconciler mutates this tree in place across many commits.
// `UINode` is the serialized *snapshot* taken from it, and only that snapshot
// is allowed to cross a Worker or socket boundary.
//
// This split is the first thing a custom renderer must decide: React's
// instances are yours, they live as long as the mounted component does, and
// they may hold anything at all — a Swift view handle, a THREE.Mesh, a struct.

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

/** The container: what `appendChildToContainer` appends *to*. Uniview calls this the RenderBridge. */
interface RenderBridge {
  rootInstance: InternalNode | null
}

let instanceCounter = 0
let textNodeCounter = 0
const generateId = (): string => `node-${instanceCounter++}`
const generateTextNodeId = (): string => `text-${textNodeCounter++}`

// ---------------------------------------------------------------------------
// 3. The trace — the actual teaching apparatus
// ---------------------------------------------------------------------------

/**
 * React calls the host config in two distinct phases, and knowing which is
 * which explains most of the output below:
 *
 *   render phase  — interruptible, may be thrown away and re-run. This is where
 *                   `createInstance` / `createTextInstance` / `appendInitialChild`
 *                   run, building a detached subtree nobody can see yet.
 *   commit phase  — synchronous and uninterruptible, bracketed by
 *                   `prepareForCommit` / `resetAfterCommit`. This is where the
 *                   new subtree is attached and existing nodes are updated.
 *
 * That is why `appendInitialChild` and `appendChild` are two different
 * callbacks doing the same array push: one runs on a subtree the host has never
 * seen, the other on a subtree that is already live. Uniview's real host config
 * emits a mutation from the second and deliberately not from the first.
 */
let phase: "render" | "commit" = "render"
let stepNumber = 0
const ceremonyCounts = new Map<string, number>()

const neverCalled = new Set<string>()

/** Tree-shaping callbacks. Every one of these is logged as it happens. */
function trace(name: string, detail: string): void {
  stepNumber += 1
  console.log(
    `  ${String(stepNumber).padStart(2)}. [${phase.padEnd(6)}] ${name.padEnd(24)} ${detail}`,
  )
  neverCalled.delete(name)
}

/**
 * Every other callback is bookkeeping React asks about constantly — host
 * context, update priority, "does this type render its children as text?".
 * They never touch the tree, and logging each one would bury the signal, so
 * they are counted and summarized at the end of each trace instead.
 */
function tick(name: string): void {
  ceremonyCounts.set(name, (ceremonyCounts.get(name) ?? 0) + 1)
  neverCalled.delete(name)
}

function beginTrace(title: string): void {
  stepNumber = 0
  ceremonyCounts.clear()
  console.log(`\n=== ${title} ===`)
}

function endTrace(): void {
  const noise = [...ceremonyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name}x${n}`)
    .join(" ")
  console.log(`      (plus ${noise || "nothing"} — bookkeeping, no tree change)`)
}

const label = (node: InternalNode | TextNode): string =>
  isTextNode(node) ? `#text#${node.id} "${node.text}"` : `<${node.type}>#${node.id}`

/**
 * React puts `children` into the props object it hands to `createInstance`, and
 * those children are React elements holding a `_owner` fiber — which points
 * back at the whole fiber tree. `JSON.stringify(props)` on the raw object
 * throws "Converting circular structure to JSON". The real renderer drops
 * `children` / `key` / `ref` for the same reason (`serializeProps`), so both
 * the log line and the serializer below use this.
 */
function ownProps(props: Record<string, unknown>): Record<string, JSONValue> {
  const out: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key" || key === "ref") continue
    // A function is not a JSONValue and cannot cross a Worker boundary. The
    // real renderer turns `onClick` into a `_onClickHandlerId` string here;
    // that is step 13. This step just drops it.
    if (typeof value === "function" || value === undefined) continue
    out[key] = value as JSONValue
  }
  return out
}

// ---------------------------------------------------------------------------
// 4. The HostConfig — the entire "custom renderer"
// ---------------------------------------------------------------------------
// The generic parameters are how React learns your vocabulary. It has no idea
// what an `Instance` is; you tell it, and from then on it only ever hands your
// own objects back to you.

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
  // -- Mode -----------------------------------------------------------------
  // Mutation mode: the host has mutable nodes you can append to and update in
  // place, like the DOM. The alternative, persistence mode, rebuilds a new
  // immutable tree per commit (react-native-fabric); a host that cannot mutate
  // must use it. Uniview's tree is mutable, so: mutation.
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  // `false` because this renderer is not the only React in the process — the
  // *host* app may itself be React (step 09). Uniview's real config sets false
  // for the same reason.
  isPrimaryRenderer: false,

  // -- Creating things (render phase) ---------------------------------------

  /**
   * "Make me a thing of type `type` with these props."
   * react-dom: `document.createElement(type)`. Here: a plain object with an id.
   * React never inspects the return value; it is opaque to the reconciler.
   */
  createInstance(type, props): Instance {
    const instance: Instance = {
      type,
      props: { ...props },
      children: [],
      id: generateId(),
      parent: null,
    }
    trace("createInstance", `${type} -> #${instance.id} ${JSON.stringify(ownProps(props))}`)
    return instance
  },

  /**
   * Same, for a string child. This is where `"Clicked 0 times"` becomes a node
   * with an id — the addressability step 01 argued for. Without an id, a later
   * `setText` would have to say "the second child of n1", which corrupts the
   * wrong child the moment host and plugin trees drift.
   */
  createTextInstance(text): TextInstance {
    const node: TextInstance = {
      _isTextNode: true,
      text,
      id: generateTextNodeId(),
      parent: null,
    }
    trace("createTextInstance", `"${text}" -> #${node.id}`)
    return node
  },

  /**
   * Attach a child to a parent that is still being built and is NOT yet in the
   * live tree. React builds whole subtrees bottom-up during the render phase,
   * then attaches the finished subtree in one move.
   */
  appendInitialChild(parent, child): void {
    trace("appendInitialChild", `${label(child)} -> ${label(parent)}`)
    child.parent = parent
    parent.children.push(child)
  },

  // -- Attaching and moving things (commit phase) ---------------------------

  /**
   * Append into a parent that IS live. Note what the real config documents
   * here: React reuses `appendChild` to *move* an existing keyed child during
   * a reorder. The DOM auto-detaches on insert; an array does not, so a host
   * config that forgets to detach ends up with the child in the array twice.
   */
  appendChild(parent, child): void {
    trace("appendChild", `${label(child)} -> ${label(parent)}`)
    detachFromParent(child)
    child.parent = parent
    parent.children.push(child)
  },

  /** The root landed. In Uniview this is what emits a `setRoot` mutation. */
  appendChildToContainer(container: Container, child: Instance): void {
    trace("appendChildToContainer", `${label(child)} -> container`)
    container.rootInstance = child
  },

  /** Same move hazard as appendChild: detach first, *then* find the anchor index. */
  insertBefore(parent, child, beforeChild): void {
    trace("insertBefore", `${label(child)} before ${label(beforeChild)}`)
    detachFromParent(child)
    const index = parent.children.indexOf(beforeChild)
    child.parent = parent
    parent.children.splice(index === -1 ? parent.children.length : index, 0, child)
  },

  insertInContainerBefore(): void {
    // Unreachable: the protocol tree has exactly one root. The real config
    // throws a readable error here, because leaving the method off entirely
    // made React crash with a bare TypeError.
    throw new Error("[step03] plugin root must be a single element")
  },

  removeChild(parent, child): void {
    trace("removeChild", `${label(child)} from ${label(parent)}`)
    const index = parent.children.indexOf(child)
    if (index !== -1) {
      parent.children.splice(index, 1)
      child.parent = null
    }
  },

  removeChildFromContainer(container, child): void {
    trace("removeChildFromContainer", label(child))
    if (container.rootInstance === child) container.rootInstance = null
  },

  clearContainer(container): void {
    trace("clearContainer", "root := null")
    container.rootInstance = null
  },

  // -- Updating things in place (commit phase) ------------------------------

  /**
   * Props changed on an existing instance. React has already diffed the two
   * element trees and decided this one node needs new props — the host is told
   * *what* to do, never asked to figure out what changed.
   *
   * Note the full `newProps`, not a patch. Uniview's `setProps` mutation is
   * full props for the same reason (step 01): a patch needs a deletion
   * convention that five host adapters would each have to get identically right.
   */
  commitUpdate(instance, _type, oldProps, newProps): void {
    trace(
      "commitUpdate",
      `${label(instance)} ${JSON.stringify(ownProps(oldProps))} -> ${JSON.stringify(ownProps(newProps))}`,
    )
    instance.props = { ...newProps }
  },

  /** A text node's content changed. The node itself is reused — same id, new text. */
  commitTextUpdate(textInstance, oldText, newText): void {
    trace("commitTextUpdate", `#${textInstance.id} "${oldText}" -> "${newText}"`)
    textInstance.text = newText
  },

  // -- Commit-phase brackets ------------------------------------------------

  /**
   * Called once before every batch of mutations. react-dom uses it to remember
   * the current selection and blur state before the DOM moves under the user.
   * Uniview uses it to open a mutation batch (step 05) and to record which
   * container is being committed.
   */
  prepareForCommit(): null {
    phase = "commit"
    trace("prepareForCommit", "--- commit phase begins ---")
    return null
  },

  /** Called once after. Uniview flushes the collected mutations to subscribers here. */
  resetAfterCommit(): void {
    trace("resetAfterCommit", "--- commit phase ends ---")
    phase = "render"
  },

  // -- Bookkeeping React asks about constantly ------------------------------

  /**
   * "Does a node of this type render its children as raw text?" react-dom
   * returns true for e.g. `<textarea>` so React skips creating text instances.
   * A protocol with explicit text nodes always says no.
   */
  shouldSetTextContent: () => false,

  /** "Is there per-subtree host state?" The DOM has one (SVG vs HTML namespace). We have none. */
  getRootHostContext: () => ({}),
  getChildHostContext: (parentHostContext) => parentHostContext,

  /** "Does this instance need a `commitMount` callback after attach?" (Autofocus, in react-dom.) */
  finalizeInitialChildren: () => false,

  /** What `ref={...}` receives. Ours is the instance itself. */
  getPublicInstance: (instance: Instance): PublicInstance => instance,

  preparePortalMount(): void {},
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,

  // Scheduling. React asks the host how urgent the work it is about to do is —
  // in react-dom this is derived from the DOM event being handled (a click is
  // more urgent than a scroll). With no events of our own, everything is
  // default priority.
  setCurrentUpdatePriority(newPriority: number): void {
    currentUpdatePriority = newPriority
  },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () =>
    currentUpdatePriority !== NoEventPriority ? currentUpdatePriority : DefaultEventPriority,
  shouldAttemptEagerTransition: () => false,

  // Suspense-for-data plumbing. A host that must preload an image or a font
  // before a commit is visible implements these; we never suspend a commit.
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit(): void {},
  suspendInstance(): void {},
  waitForCommitToBeReady: () => null,

  // Suspense *visibility*: React hides mounted content while a fallback shows.
  hideInstance(): void {},
  unhideInstance(): void {},
  hideTextInstance(): void {},
  unhideTextInstance(): void {},

  // Form-state / transition plumbing added in React 19.
  NotPendingTransition: null,
  HostTransitionContext: createContext(null) as unknown as ReactContext<null>,
  resetFormInstance(): void {},
  requestPostPaintCallback(): void {},

  // THE TRAP. These three are required by react-reconciler@0.33, exist so React
  // can attribute work to the event that caused it in the Profiler, and are easy
  // to miss because most tutorials and most StackOverflow answers predate them.
  //
  // Delete `resolveEventTimeStamp` and this file still type-checks *if* the
  // config object is written without the 14-parameter `HostConfig<...>`
  // annotation above (a `const hostConfig = {...}` or an `as never`, which is
  // exactly what most examples do — and what steps/00-scaffold-probe/main.ts
  // does). It then dies at RUNTIME on the very first `updateContainer`:
  //
  //     TypeError: resolveEventTimeStamp is not a function
  //         at startUpdateTimerByLane (react-reconciler.development.js:2993)
  //         at updateContainerImpl (react-reconciler.development.js:16923)
  //
  // Verified by deleting the line and running this file. The annotation is
  // therefore not decoration: it is what converts a runtime crash into a
  // compile error.
  trackSchedulerEvent(): void {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,

  // Devtools / scope hooks. All no-ops for a renderer with no real event system.
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur(): void {},
  afterActiveInstanceBlur(): void {},
  prepareScopeUpdate(): void {},
  getInstanceFromScope: () => null,
  detachDeletedInstance(): void {},
}

function detachFromParent(child: Instance | TextInstance): void {
  const prevParent = child.parent
  if (!prevParent) return
  const index = prevParent.children.indexOf(child)
  if (index !== -1) prevParent.children.splice(index, 1)
}

// ---------------------------------------------------------------------------
// 4b. Instrumentation (teaching apparatus, not part of a real renderer)
// ---------------------------------------------------------------------------
// The tree-shaping callbacks above log themselves. Everything else gets counted
// automatically, so the "never called in this run" list at the end is honest —
// including for callbacks whose body is `{}`.

const TRACED = new Set([
  "createInstance",
  "createTextInstance",
  "appendInitialChild",
  "appendChild",
  "appendChildToContainer",
  "insertBefore",
  "removeChild",
  "removeChildFromContainer",
  "clearContainer",
  "commitUpdate",
  "commitTextUpdate",
  "prepareForCommit",
  "resetAfterCommit",
])

// Only the callbacks; `supportsMutation`, `noTimeout` and friends are values.
const callbackNames = Object.entries(hostConfig)
  .filter(([, value]) => typeof value === "function")
  .map(([name]) => name)
for (const name of callbackNames) neverCalled.add(name)

const instrumented = { ...hostConfig } as Record<string, unknown>
for (const name of callbackNames) {
  if (TRACED.has(name)) continue
  const original = hostConfig[name as keyof typeof hostConfig] as (...args: unknown[]) => unknown
  instrumented[name] = (...args: unknown[]): unknown => {
    tick(name)
    return original(...args)
  }
}
const tracedHostConfig = instrumented as unknown as typeof hostConfig

// ---------------------------------------------------------------------------
// 5. Serialization — the host tree becomes step 01's UINode
// ---------------------------------------------------------------------------
// Notice this is *not* part of the host config. React knows nothing about it.
// The host config grows a live mutable tree; serialization takes a JSON-safe
// snapshot of it. Uniview does exactly this split, in
// packages/react-renderer/src/serialization/serialize.ts.

function serializeTree(instance: InternalNode | TextNode | null): UINode | null {
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
    const serialized = serializeTree(child)
    if (serialized !== null) children.push(serialized)
  }
  return {
    id: instance.id,
    type: instance.type,
    props: ownProps(instance.props),
    children,
  }
}

// ---------------------------------------------------------------------------
// 6. A real React component, with real hooks, against a non-DOM host
// ---------------------------------------------------------------------------
// `useState` and `useEffect` are implemented inside react-reconciler, not
// inside react-dom. They work here — with no DOM, no window, no document —
// precisely because of the split this step is about.
//
// The element types are `column` and `button`. `column` is not an HTML tag and
// never will be. React does not care: `type` is an opaque string it passes to
// `createInstance`. This is the same tree step 01 wrote out by hand.

/** Lets the script poke the component from outside, standing in for a click. */
let click: (() => void) | null = null

function Counter(): ReturnType<typeof createElement> {
  const [count, setCount] = useState(0)

  useEffect(() => {
    console.log(`      >> useEffect ran, count=${count}`)
    click = () => setCount((c) => c + 1)
  })

  return createElement(
    "column",
    { gap: 8, padding: 16 },
    `Clicked ${count} times`,
    createElement("button", { disabled: count === 0 }, "Click me"),
    count > 0 ? "last click: just now" : null,
  )
}

// ---------------------------------------------------------------------------
// 7. Drive it
// ---------------------------------------------------------------------------

// `ReactReconciler(config)` destructures every callback out of the object once,
// at creation time — which is why swapping a method on `hostConfig` afterwards
// would have no effect, and why the instrumented copy must be passed in here.
const reconciler = ReactReconciler(tracedHostConfig)

/**
 * `flushSyncFromReconciler` is the runtime name in react-reconciler@0.33; the
 * DefinitelyTyped declaration (@types/react-reconciler@0.32.3) still calls it
 * `flushSync`, so calling it through the typed handle does not compile. The
 * real renderer keeps the same narrow, typed compatibility seam and says why:
 *
 *   "react-reconciler 0.33 exposes this runtime API while the matching
 *    Definitely Typed declaration still calls it `flushSync`. Keep the
 *    compatibility seam narrow and typed until the upstream declaration
 *    catches up."
 *   — packages/react-renderer/src/reconciler/renderer.ts:15
 *
 * This is what "code against the pinned version, not the API you remember"
 * costs in practice: one interface and a comment.
 */
interface SynchronousReconciler {
  flushSyncFromReconciler<Result>(callback: () => Result): Result
  flushPassiveEffects(): boolean
}
const sync = reconciler as typeof reconciler & SynchronousReconciler

const bridge: RenderBridge = { rootInstance: null }

const container = reconciler.createContainer(
  bridge,
  ConcurrentRoot,
  null, // hydration callbacks
  false, // isStrictMode
  null, // concurrentUpdatesByDefaultOverride
  "", // identifierPrefix
  console.error, // onUncaughtError
  console.error, // onCaughtError
  console.error, // onRecoverableError
  console.error, // onDefaultTransitionIndicator
  null, // transitionCallbacks
)

console.log(
  `This HostConfig is one object with ${callbackNames.length} callbacks, of which ` +
    `${TRACED.size} shape the tree.\nBelow, those ${TRACED.size} log themselves as the reconciler ` +
    "calls them, in order.\nNothing in this file mentions the DOM.",
)

// -- Mount --------------------------------------------------------------------

beginTrace("1. Initial mount: React drives the host config")
sync.flushSyncFromReconciler(() => {
  reconciler.updateContainer(createElement(Counter), container, null, () => {})
})
// Passive effects (useEffect) are scheduled, not run, by the commit. In a
// browser the scheduler would run them on the next tick; a script that exits
// immediately has to flush them by hand.
sync.flushPassiveEffects()
endTrace()

const treeV1 = serializeTree(bridge.rootInstance)
console.log("\n  serialized UINode tree:")
console.log(treeV1 ? show(treeV1, 1) : "  (empty)")

// -- One state update ---------------------------------------------------------

beginTrace("2. One setState: the update path")
console.log("  (the same component re-renders; watch what is NOT re-created)")
sync.flushSyncFromReconciler(() => {
  click?.()
})
sync.flushPassiveEffects()
endTrace()

const treeV2 = serializeTree(bridge.rootInstance)
console.log("\n  serialized UINode tree:")
console.log(treeV2 ? show(treeV2, 1) : "  (empty)")

// ---------------------------------------------------------------------------
// 8. What just happened
// ---------------------------------------------------------------------------

console.log("\n=== 3. What the trace proves ===")
console.log(
  [
    "  - The mount created every node bottom-up in the RENDER phase, then",
    "    attached the finished root in one appendChildToContainer during COMMIT.",
    "  - The update created exactly one new node (the new text child) and",
    "    reused the rest: node ids are unchanged between the two trees above.",
    "  - useState and useEffect ran with no DOM in the process. Hooks live in",
    "    react-reconciler; react-dom is just another host config, like this one.",
    "  - React chose commitTextUpdate vs commitUpdate vs appendChild. The host",
    "    was told what to do and never diffed anything.",
    "  - Step 6 of the update is commitUpdate on <column> with IDENTICAL props.",
    "    React marks a host fiber for update when its children changed; it does",
    "    not promise the props differ. A host that re-serializes props on every",
    "    commitUpdate therefore does redundant work — which is one reason step 05",
    "    collects mutations instead of re-sending the tree.",
  ].join("\n"),
)

const unused = [...neverCalled].sort()
console.log(
  `\n  Callbacks implemented but never called in this run (${unused.length} of ` +
    `${callbackNames.length}):\n    ${unused.join(", ")}`,
)
console.log(
  "\n  Those are the paths this toy never takes — reorders, removals, Suspense,\n" +
    "  portals, refs. Note which ones are NOT on that list: resolveEventTimeStamp\n" +
    "  and resolveEventType fired once per update, from deep inside React's\n" +
    "  scheduler. Omit either and react-reconciler@0.33 throws\n" +
    "  `TypeError: resolveEventTimeStamp is not a function` on the first\n" +
    "  updateContainer — at runtime, and only at type-check time if the config\n" +
    "  carries the full HostConfig<...> annotation. That is the hour this step\n" +
    "  is trying to save you; steps/00-scaffold-probe/main.ts lost it first.",
)

console.log(
  "\nStep 04 zooms in on the tree-building callbacks; step 05 replaces the\n" +
    "serialize-the-whole-tree step above with the six mutations from step 01.",
)
