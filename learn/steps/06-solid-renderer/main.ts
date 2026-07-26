/**
 * Step 06 — Solid's universal renderer: fine-grained, no VDOM, identical output.
 *
 * Step 03 built a React custom renderer: a `HostConfig` handed to
 * `react-reconciler`, which re-runs your components, diffs the resulting
 * element tree against the previous one, and then calls back into your config
 * during a commit phase. Steps 04 and 05 grew that into a real tree and a
 * mutation stream. After three steps of it, it is easy to mistake that shape
 * for *the* shape of a custom renderer.
 *
 * It isn't. Solid has no virtual DOM and no reconciler in React's sense. It
 * creates real nodes once and wires fine-grained reactive effects, so a signal
 * write re-runs only the effects that read that signal, and those effects
 * mutate exactly the nodes they own. Nothing re-renders. Nothing is diffed.
 * There is no "previous tree" anywhere in memory to compare against — which is
 * why Solid instead asks the host how to walk its own tree (`getParentNode`,
 * `getFirstChild`, `getNextSibling`).
 *
 * So the interface is much smaller:
 *
 *   React HostConfig   packages/react-renderer/src/reconciler/host-config.ts
 *     53 members — createInstance, createTextInstance, appendInitialChild,
 *     appendChild, appendChildToContainer, insertBefore,
 *     insertInContainerBefore, removeChild, removeChildFromContainer,
 *     commitUpdate, commitTextUpdate, clearContainer, 4 suspense hide/unhide
 *     hooks, 5 scheduler-priority hooks, the prepareForCommit/resetAfterCommit
 *     brackets, ...
 *
 *   Solid RendererOptions   packages/solid-renderer/src/renderer/universal.d.ts
 *     10 members — createElement, createTextNode, replaceText, setProperty,
 *     insertNode, removeNode, isTextNode, getParentNode, getFirstChild,
 *     getNextSibling. (11 in Uniview's fork, which adds createSlotNode.)
 *
 * And here is the payoff, which is the whole reason this step exists:
 *
 *   BOTH PRODUCE THE IDENTICAL `UINode` TREE.
 *
 * That is the proof that step 01's protocol is genuinely framework-agnostic
 * rather than "React's tree, with a Solid adapter bolted on". `CLAUDE.md`:
 *
 *   "Framework-agnostic. `@uniview/protocol`, `@uniview/host-sdk` and every
 *    native host speak `UINode` + `Mutation` + Style IR. They must not know
 *    that React or Solid or Svelte exists. A new plugin-side framework is a
 *    new renderer package and *zero* changes anywhere else."
 *
 * This file runs BOTH renderers, in one process, on the equivalent component.
 * The trace format, the `show()` printer and the node labels are deliberately
 * identical to step 03's, so the two files' outputs can be diffed line by line.
 * Step 03's `[render]`/`[commit]` phase tag is the only thing that changes: it
 * becomes `[solid ]`/`[react ]`, because Solid has no phases to tag.
 */

import ReactReconciler from "react-reconciler"
import { ConcurrentRoot } from "react-reconciler/constants"
import { createElement as h, useState } from "react"

// NOTE both of these paths. `solid-js/dist/solid.js` names Solid's CLIENT build
// explicitly, and `./universal.js` is solid-js@1.9.10's own universal renderer
// vendored into this directory with that same one-line change. Under plain Node
// a bare `import "solid-js"` resolves through the package's `"node"` export
// condition to the non-reactive SSR build, and the entire lesson below silently
// produces an empty update trace. See the header of `./universal.js`.
import { createSignal } from "solid-js/dist/solid.js"
import { createRenderer } from "./universal.js"

// ===========================================================================
// 1. The protocol, copied forward from step 01
// ===========================================================================
//
// `learn/` steps never import each other (RULES.md) — each stands alone so two
// adjacent steps can be diffed. This is step 01's vocabulary, and `show()` is
// step 03's copy of step 01's printer, character for character.

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

/** Only the two kinds this step's update actually produces. Step 01 has all six. */
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
export type Mutation = SetTextMutation | SetPropsMutation

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

// ===========================================================================
// 2. One trace log, shared by both renderers
// ===========================================================================
//
// Same layout as step 03's `trace()`:
//
//     `  ${n}. [${tag.padEnd(6)}] ${name.padEnd(24)} ${detail}`
//
// so a line here lines up column-for-column with a line there. Step 03 puts the
// React phase in the tag slot; here the slot names the renderer.

let traceLines: string[] = []
let tracing = false
let stepNumber = 0
let tag: "solid" | "react" = "solid"

function trace(name: string, detail: string): void {
  if (!tracing) return
  stepNumber += 1
  traceLines.push(
    `  ${String(stepNumber).padStart(2)}. [${tag.padEnd(6)}] ${name.padEnd(24)} ${detail}`,
  )
}

function beginTrace(renderer: "solid" | "react", title: string): void {
  traceLines = []
  stepNumber = 0
  tag = renderer
  tracing = true
  console.log(title)
}

function endTrace(): number {
  tracing = false
  if (traceLines.length === 0) console.log("  (nothing fired)")
  else for (const line of traceLines) console.log(line)
  return traceLines.length
}

/**
 * React puts `children` into the props object handed to `createInstance`, and
 * those children are React elements holding an `_owner` fiber that points back
 * at the whole fiber tree — `JSON.stringify` on the raw object throws
 * "Converting circular structure to JSON". Step 03 hits the same wall. Drop the
 * keys neither renderer treats as props, and stringify functions as `<fn>`.
 */
function ownProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (k === "children" || k === "key" || k === "ref") continue
    out[k] = typeof v === "function" ? "<fn>" : v
  }
  return out
}

const j = (props: Record<string, unknown>): string => JSON.stringify(ownProps(props))

// ===========================================================================
// 3. Solid side — the internal node model
// ===========================================================================
//
// Mirrors packages/solid-renderer/src/renderer/types.ts. The internal node is
// NOT a UINode: it carries a `parent` back-pointer (Solid's tree-navigation
// primitives need it) and keeps text in a separate `_type: "text"` shape.
// Serialization to UINode happens in §6, exactly as in the real package.
//
// The real package has a third kind, `SolidSlotNode` — an empty placeholder
// Solid uses as an insertion anchor for `<Show>` / `<For>` boundaries. It is
// stripped during serialization so it never reaches the protocol. This step has
// no conditional rendering, so it is left out.

interface SolidNode {
  _type: "element"
  id: string
  type: string
  props: Record<string, unknown>
  children: (SolidNode | SolidTextNode)[]
  parent: SolidNode | null
}

interface SolidTextNode {
  _type: "text"
  id: string
  value: string
  parent: SolidNode | null
}

type AnyNode = SolidNode | SolidTextNode

// `generateId(prefix)` from the real types.ts: `${prefix}-${++idCounter}`, with
// the tag name as the prefix for elements and "text" for text nodes. Ids are
// minted here and never change — that stability is what makes `setText` by node
// id possible at all.
let solidIdCounter = 0
const generateId = (prefix = "node"): string => `${prefix}-${++solidIdCounter}`

const asElement = (node: AnyNode): SolidNode => node as SolidNode
const asText = (node: AnyNode): SolidTextNode => node as SolidTextNode

/** Step 03's `label()`, so node references print identically in both traces. */
const label = (node: AnyNode): string =>
  node._type === "text" ? `#text#${node.id} "${node.value}"` : `<${node.type}>#${node.id}`

/** Mutations the primitives collect, exactly where the real collector does. */
const collected: Mutation[] = []

// ===========================================================================
// 4. Solid side — the ten primitives
// ===========================================================================
//
// This is the entire renderer. Compare its length with step 03's HostConfig.

const solidContainer: SolidNode = {
  _type: "element",
  id: "root",
  type: "#root",
  props: {},
  children: [],
  parent: null,
}

/**
 * Detach from the current parent before (re)inserting.
 *
 * Copied from the real reconciler's `_detachFromParent`, and it is there for a
 * reason the source states outright: "Solid's universal renderer reuses
 * insertNode to MOVE existing nodes (keyed list reorders); DOM insertBefore
 * auto-detaches, an array-based children model must do it explicitly or
 * reorders duplicate the node." Step 03's `appendChild` carries the identical
 * comment about React's `commitPlacement` — the same hazard, twice, because it
 * is a property of modelling children as an array, not of either framework.
 */
function detachFromParent(node: AnyNode): void {
  const prev = node.parent
  if (!prev) return
  const index = prev.children.indexOf(node)
  if (index !== -1) prev.children.splice(index, 1)
}

const solid = createRenderer<AnyNode>({
  createElement(tagName: string): AnyNode {
    const node: SolidNode = {
      _type: "element",
      id: generateId(tagName),
      type: tagName,
      props: {},
      children: [],
      parent: null,
    }
    // Note what is missing next to step 03's `createInstance`: no props. Solid
    // creates a bare element and sets every property in a separate call, so a
    // reactive one can live in its own effect.
    trace("createElement", `${tagName} -> #${node.id}`)
    return node
  },

  createTextNode(value: string): AnyNode {
    const node: SolidTextNode = {
      _type: "text",
      id: generateId("text"),
      value: String(value),
      parent: null,
    }
    trace("createTextNode", `"${String(value)}" -> #${node.id}`)
    return node
  },

  isTextNode: (node: AnyNode): boolean => node._type === "text",

  /**
   * The single most important primitive in this file. A signal change that only
   * affects a text interpolation reaches the tree through exactly this call and
   * nothing else — no parent is visited, no sibling is compared, no props
   * object is reallocated.
   */
  replaceText(textNode: AnyNode, value: string): void {
    const node = asText(textNode)
    trace("replaceText", `#${node.id} "${node.value}" -> "${value}"`)
    node.value = value
    // The real reconciler collects a protocol mutation right here:
    //   mutationCollector?.collectSetText(textNode)
    collected.push({ type: "setText", nodeId: node.id, text: value })
  },

  setProperty(node: AnyNode, name: string, value: unknown): void {
    const el = asElement(node)
    const shown = typeof value === "function" ? "<fn>" : JSON.stringify(value)
    trace("setProperty", `<${el.type}>#${el.id} ${name}=${shown}`)
    if (value === undefined) delete el.props[name]
    else el.props[name] = value
    // Real reconciler: mutationCollector?.collectSetProps(node)
    collected.push({ type: "setProps", nodeId: el.id, props: serializeProps(el) })
  },

  insertNode(parent: AnyNode, node: AnyNode, anchor?: AnyNode): void {
    const p = asElement(parent)
    trace(
      "insertNode",
      `${label(node)} -> ${label(p)}${anchor ? ` (before ${label(anchor)})` : ""}`,
    )
    // Detach FIRST, then resolve the anchor index — detaching from the same
    // parent shifts sibling positions. Same ordering bug the real code calls out.
    detachFromParent(node)
    node.parent = p
    const anchorIndex = anchor ? p.children.indexOf(anchor as SolidNode | SolidTextNode) : -1
    if (anchorIndex !== -1) p.children.splice(anchorIndex, 0, node)
    else p.children.push(node)
  },

  removeNode(parent: AnyNode, node: AnyNode): void {
    const p = asElement(parent)
    trace("removeNode", `${label(node)} x ${label(p)}`)
    const index = p.children.indexOf(node as SolidNode | SolidTextNode)
    if (index !== -1) p.children.splice(index, 1)
    node.parent = null
  },

  // Tree navigation. Solid asks the host how to walk its own tree instead of
  // keeping a shadow copy — these three are what stand in for React's previous
  // fiber tree. They are never traced because they answer questions rather than
  // change anything (step 03 counts its equivalents as "bookkeeping" too).
  getParentNode: (node: AnyNode): AnyNode | undefined => node.parent ?? undefined,
  getFirstChild: (node: AnyNode): AnyNode | undefined => asElement(node).children[0],
  getNextSibling(node: AnyNode): AnyNode | undefined {
    const parent = node.parent
    if (!parent) return undefined
    const index = parent.children.indexOf(node as SolidNode | SolidTextNode)
    if (index === -1 || index >= parent.children.length - 1) return undefined
    return parent.children[index + 1]
  },
})

// ===========================================================================
// 5. React side — step 03's path, condensed
// ===========================================================================
//
// Deliberately terse: it is here to be COMPARED, not taught again. Callback
// names, id scheme and trace details all match step 03 so the two traces line
// up. Ids follow the real host config — `node-${n}` for elements, `text-${n}`
// for text: packages/react-renderer/src/reconciler/host-config.ts:28-33.

interface ReactNode_ {
  id: string
  type: string
  props: Record<string, unknown>
  children: ReactNode_[]
  text?: string
  parent: ReactNode_ | null
}

let reactInstanceCounter = 0
let reactTextCounter = 0
const rLabel = (n: ReactNode_): string =>
  n.text !== undefined ? `#text#${n.id} "${n.text}"` : `<${n.type}>#${n.id}`

const reactContainerHandle: { root: ReactNode_ | null } = { root: null }

const reconciler = ReactReconciler({
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  noTimeout: -1,
  createInstance: (type: string, props: Record<string, unknown>): ReactNode_ => {
    const node: ReactNode_ = {
      id: `node-${reactInstanceCounter++}`,
      type,
      props: { ...props },
      children: [],
      parent: null,
    }
    trace("createInstance", `${type} -> #${node.id} ${j(props)}`)
    return node
  },
  createTextInstance: (text: string): ReactNode_ => {
    const node: ReactNode_ = {
      id: `text-${reactTextCounter++}`,
      type: TEXT_NODE_TYPE,
      props: {},
      children: [],
      text,
      parent: null,
    }
    trace("createTextInstance", `"${text}" -> #${node.id}`)
    return node
  },
  appendInitialChild: (parent: ReactNode_, child: ReactNode_) => {
    trace("appendInitialChild", `${rLabel(child)} -> ${rLabel(parent)}`)
    child.parent = parent
    parent.children.push(child)
  },
  appendChild: (parent: ReactNode_, child: ReactNode_) => {
    trace("appendChild", `${rLabel(child)} -> ${rLabel(parent)}`)
    child.parent = parent
    parent.children.push(child)
  },
  appendChildToContainer: (container: { root: ReactNode_ | null }, child: ReactNode_) => {
    trace("appendChildToContainer", `${rLabel(child)} -> container`)
    container.root = child
  },
  removeChild: (parent: ReactNode_, child: ReactNode_) => {
    trace("removeChild", `${rLabel(child)} x ${rLabel(parent)}`)
    parent.children = parent.children.filter((c) => c !== child)
  },
  removeChildFromContainer: (container: { root: ReactNode_ | null }) => {
    container.root = null
  },
  insertBefore: (parent: ReactNode_, child: ReactNode_, before: ReactNode_) => {
    trace("insertBefore", `${rLabel(child)} -> ${rLabel(parent)} (before ${rLabel(before)})`)
    parent.children.splice(parent.children.indexOf(before), 0, child)
  },
  commitUpdate: (
    instance: ReactNode_,
    _type: unknown,
    _old: unknown,
    next: Record<string, unknown>,
  ) => {
    trace("commitUpdate", `${rLabel(instance)} ${j(instance.props)} -> ${j(next)}`)
    instance.props = { ...next }
  },
  commitTextUpdate: (instance: ReactNode_, _old: string, next: string) => {
    trace("commitTextUpdate", `#${instance.id} "${instance.text}" -> "${next}"`)
    instance.text = next
  },
  // ---- the other ~40 members react-reconciler@0.33 demands. Solid asks for
  // none of these: there is no commit phase to bracket, no scheduler priority
  // to resolve and no suspense boundary whose subtree must be hidden.
  finalizeInitialChildren: () => false,
  shouldSetTextContent: () => false,
  getRootHostContext: () => ({}),
  getChildHostContext: (parent: unknown) => parent,
  prepareForCommit: () => null,
  resetAfterCommit: () => {},
  clearContainer: (container: { root: ReactNode_ | null }) => {
    container.root = null
  },
  getPublicInstance: (i: ReactNode_) => i,
  preparePortalMount: () => {},
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  getCurrentUpdatePriority: () => 0,
  resolveUpdatePriority: () => 2,
  setCurrentUpdatePriority: () => {},
  shouldAttemptEagerTransition: () => false,
  requestPostPaintCallback: () => {},
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
  NotPendingTransition: null,
  HostTransitionContext: {} as never,
  resetFormInstance: () => {},
  bindToConsole: (_m: unknown, _a: unknown, method: unknown) => method as never,
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  detachDeletedInstance: () => {},
} as never)

// ===========================================================================
// 6. Serialization — internal node -> UINode
// ===========================================================================
//
// Mirrors packages/solid-renderer/src/serialization/serialize.ts and
// serialize-props.ts. The important detail — and it is step 04's whole subject,
// arrived at here from the other side: an `on[A-Z]*` function prop becomes
// `_${key}HandlerId` with the deterministic value `${nodeId}:${key}`. A function
// is not a JSONValue (step 01), so it cannot travel; the id can. Step 04 built
// that rule from React; Solid's serializer derives the identical string.
//
// Both renderers share this serializer here, which is not a shortcut — the real
// packages share `@uniview/style`'s `resolveStyleIR` for exactly this reason:
// "a Solid plugin rendered through the native bridge must produce the identical
// IR a React plugin would, or the framework-agnostic contract is a lie."

function serializePropsRecord(
  props: Record<string, unknown>,
  nodeId: string,
): Record<string, JSONValue> {
  const out: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key" || key === "ref") continue
    if (typeof value === "function") {
      if (/^on[A-Z]/.test(key)) out[`_${key}HandlerId`] = `${nodeId}:${key}`
      continue
    }
    if (value === undefined) continue
    out[key] = value as JSONValue
  }
  return out
}

const serializeProps = (node: SolidNode): Record<string, JSONValue> =>
  serializePropsRecord(node.props, node.id)

function serializeSolid(node: AnyNode | null): UINode | null {
  if (node == null) return null
  if (node._type === "text") {
    return { id: node.id, type: TEXT_NODE_TYPE, props: {}, children: [], text: node.value }
  }
  return {
    id: node.id,
    type: node.type,
    props: serializePropsRecord(node.props, node.id),
    children: node.children.map(serializeSolid).filter((c): c is UINode => c !== null),
  }
}

function serializeReact(node: ReactNode_ | null): UINode | null {
  if (node == null) return null
  if (node.text !== undefined) {
    return { id: node.id, type: TEXT_NODE_TYPE, props: {}, children: [], text: node.text }
  }
  return {
    id: node.id,
    type: node.type,
    props: serializePropsRecord(node.props, node.id),
    children: node.children.map(serializeReact).filter((c): c is UINode => c !== null),
  }
}

// ===========================================================================
// 7. The component — once in Solid, once in React
// ===========================================================================
//
// In a real plugin the Solid version is written as JSX:
//
//   function Counter() {
//     const [count, setCount] = createSignal(0)
//     return (
//       <column gap={8} padding={16}>
//         {`Clicked ${count()} times`}
//         <button disabled={count() === 0} onClick={() => setCount((c) => c + 1)}>
//           Click me
//         </button>
//       </column>
//     )
//   }
//
// `learn/`'s tsconfig has no Solid JSX transform, and that turns out to be a
// feature here: what follows is what `babel-preset-solid` COMPILES that JSX
// into. Reading the compiled form is the clearest possible statement of the
// thesis — the tree is built once with `createElement` / `insertNode`, and
// every dynamic part is wrapped in an `effect` or an `insert` that owns exactly
// one node. There is no render function to call again.
//
// `insert(parent, accessor, marker)` is the compiled form of `{expression}`
// among siblings: `marker` is the node the expression's output sits before.

let solidComponentRuns = 0

// The Solid setter has to escape the component: there is no re-render to hook,
// so §9 pokes the signal from outside — as a real event handler resolved
// through the handler registry eventually would (steps 13/15).
let solidSetCount: (n: number) => void = () => {
  throw new Error("SolidCounter has not rendered yet")
}

function SolidCounter(): AnyNode {
  solidComponentRuns++

  const [count, setCount] = createSignal(0)
  solidSetCount = setCount

  const column = solid.createElement("column")
  solid.setProp(column, "gap", 8)
  solid.setProp(column, "padding", 16)

  const button = solid.createElement("button")
  // A dynamic attribute compiles to a render effect around ONE setProp call.
  solid.effect(() => solid.setProp(button, "disabled", count() === 0))
  // A static one gets no effect at all — it is set once and never revisited.
  solid.setProp(button, "onClick", () => setCount((c) => c + 1))
  solid.insertNode(button, solid.createTextNode("Click me"))

  solid.insertNode(column, button)
  // A dynamic child compiles to `insert`, which wraps a render effect. On the
  // first run it creates the text node; on every later run it finds the same
  // text node still there and calls `replaceText` on it. That is the entire
  // update path — see `insertExpression` in ./universal.js.
  solid.insert(column, () => `Clicked ${count()} times`, button)

  return column
}

let reactComponentRuns = 0
let reactSetCount: ((n: number) => void) | null = null

function ReactCounter() {
  reactComponentRuns++
  const [count, setCount] = useState(0)
  reactSetCount = setCount
  return h(
    "column",
    { gap: 8, padding: 16 },
    `Clicked ${count} times`,
    h("button", { disabled: count === 0, onClick: () => setCount(count + 1) }, "Click me"),
  )
}

// ===========================================================================
// 8. Initial render — both traces
// ===========================================================================

console.log("=== 1. Initial render: every renderer primitive that fired ===")

beginTrace("solid", "\n  solid-js/universal — 10 primitives available:")
solid.render(() => SolidCounter(), solidContainer)
const solidMountCalls = endTrace()

const reactContainer = reconciler.createContainer(
  reactContainerHandle as never,
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

// `flushSyncFromReconciler` is 0.33's runtime name; DefinitelyTyped still calls
// it `flushSync`. Step 03 documents the same seam, as does the real renderer in
// packages/react-renderer/src/reconciler/renderer.ts.
const sync = reconciler as unknown as { flushSyncFromReconciler<T>(cb: () => T): T }

beginTrace("react", "\n  react-reconciler HostConfig — 53 members available:")
sync.flushSyncFromReconciler(() => {
  reconciler.updateContainer(h(ReactCounter), reactContainer, null, () => {})
})
const reactMountCalls = endTrace()

const solidMountTree = serializeSolid(solidContainer.children[0] ?? null)
const reactMountTree = serializeReact(reactContainerHandle.root)

console.log("\n  solid's serialized UINode tree:")
console.log(solidMountTree ? show(solidMountTree, 1) : "  (empty)")
console.log("\n  react's serialized UINode tree:")
console.log(reactMountTree ? show(reactMountTree, 1) : "  (empty)")

console.log(
  `\n  Same 4-node tree; solid fired ${solidMountCalls} primitives, react fired ${reactMountCalls}.\n` +
    `  On a FIRST render the two do genuinely comparable work — the tree has to be built.\n` +
    `  Note the shapes though: react creates both text instances first and attaches\n` +
    `  bottom-up, solid attaches the button and then inserts the dynamic text before\n` +
    `  it. Same final child order, completely different call sequence. A host that\n` +
    `  read meaning into arrival order would break on the second framework.\n` +
    `  The real divergence is on the SECOND render.`,
)

// ===========================================================================
// 9. The update — where the two paths stop resembling each other
// ===========================================================================

console.log("\n\n=== 2. One signal / one setState: the update path ===")

collected.length = 0
beginTrace("solid", "\n  solid:")
solidSetCount(1)
const solidUpdateCalls = endTrace()

beginTrace("react", "\n  react:")
sync.flushSyncFromReconciler(() => reactSetCount?.(1))
const reactUpdateCalls = endTrace()

console.log(`
  solid : ${solidUpdateCalls} primitive calls, component function ran ${solidComponentRuns} time.
  react : ${reactUpdateCalls} primitive calls, component function ran ${reactComponentRuns} times.

  Same end state, two completely different routes to it:

    React  setState -> schedule -> RE-RUN ReactCounter() -> build a fresh element
           tree -> DIFF it against the previous fiber tree -> commit phase ->
           commitTextUpdate / commitUpdate on every host fiber React flagged.
           Note <column> in that list even though NEITHER of its props changed:
           re-running the component allocated a new props object, and React 19
           flags a host fiber whose props object is not reference-identical.
           The component ran again, an element tree was allocated and thrown
           away, and the host config saw only the residue — including one write
           that was not a change at all.

    Solid  setCount -> the two render effects that READ count() re-run, and only
           those. One owns the button's \`disabled\` prop and calls setProperty.
           One owns the text node and calls replaceText. SolidCounter() never
           ran again, <column> was never touched, and nothing was diffed —
           because nothing was re-created to diff.

  The mutations Solid's primitives collected on the way. The real
  SolidMutationCollector does exactly this, from inside replaceText /
  setProperty rather than from inside a commit:`)
for (const m of collected) console.log(`    ${JSON.stringify(m)}`)

// ===========================================================================
// 10. The proof — identical UINode trees
// ===========================================================================

const solidTree = serializeSolid(solidContainer.children[0] ?? null)
const reactTree = serializeReact(reactContainerHandle.root)

console.log("\n  solid's serialized UINode tree:")
console.log(solidTree ? show(solidTree, 1) : "  (empty)")
console.log("\n  react's serialized UINode tree:")
console.log(reactTree ? show(reactTree, 1) : "  (empty)")

/**
 * Structural comparison.
 *
 * "Identical" cannot mean byte-identical, and it is worth being precise about
 * why. The protocol requires ids to be STABLE (a node keeps its id across
 * renders, so `setText` can address it), not EQUAL ACROSS FRAMEWORKS. React
 * mints `node-0` / `text-0`; Solid mints `column-1` / `text-2`. No host ever
 * compares ids from two different plugins, so that difference is invisible to
 * everything downstream.
 *
 * So: replace every id with its positional path and sort prop keys. What is
 * left — types, props, nesting, text, child order — must match exactly.
 *
 * `dropHandlers` exists for the cross-step anchors below. Step 03's component
 * has no event handler at all and step 01 hand-wrote the placeholder `"h_1"`,
 * so a handler-id VALUE is the one field those three snapshots legitimately
 * disagree on. The live solid-vs-react comparison keeps them (as a placeholder,
 * since the value embeds the node id) and therefore does check that both
 * renderers emit `_onClickHandlerId` at all.
 */
function normalize(node: UINode | string, dropHandlers: boolean, path = "0"): unknown {
  if (typeof node === "string") return { path, bareString: node }
  const props: Record<string, JSONValue> = {}
  for (const key of Object.keys(node.props).sort()) {
    if (key.endsWith("HandlerId")) {
      if (dropHandlers) continue
      props[key] = "<handlerId>"
    } else {
      props[key] = node.props[key]!
    }
  }
  return {
    path,
    type: node.type,
    props,
    text: node.text,
    children: node.children.map((c, i) => normalize(c, dropHandlers, `${path}.${i}`)),
  }
}

const shape = (node: UINode, dropHandlers = false): string =>
  JSON.stringify(normalize(node, dropHandlers), null, 1)

/**
 * Anchor 1 — step 03's published output.
 *
 * Transcribed verbatim from the "Run it" section of
 * learn/docs/03-what-is-a-custom-renderer.md, which prints at mount:
 *
 *   <column#node-1 gap=8 padding=16>
 *     #text#text-0 "Clicked 0 times"
 *     <button#node-0 disabled=true>
 *       #text#text-1 "Click me"
 *
 * Step 06's React half reproduces those ids exactly, which is not a
 * coincidence: both follow the real host config's `node-${n}` / `text-${n}`
 * counters.
 */
const step03MountTree: UINode = {
  id: "node-1",
  type: "column",
  props: { gap: 8, padding: 16 },
  children: [
    { id: "text-0", type: TEXT_NODE_TYPE, props: {}, children: [], text: "Clicked 0 times" },
    {
      id: "node-0",
      type: "button",
      props: { disabled: true },
      children: [
        { id: "text-1", type: TEXT_NODE_TYPE, props: {}, children: [], text: "Click me" },
      ],
    },
  ],
}

/**
 * Anchor 2 — step 01's `treeV1`, copied from steps/01-protocol/main.ts §5, ids
 * and all. Written by hand, as plain data, before either renderer existed.
 */
const step01TreeV1: UINode = {
  id: "n1",
  type: "column",
  props: { gap: 8, padding: 16 },
  children: [
    { id: "n2", type: TEXT_NODE_TYPE, props: {}, children: [], text: "Clicked 0 times" },
    {
      id: "n3",
      type: "button",
      props: { disabled: true, _onClickHandlerId: "h_1" },
      children: [
        { id: "n4", type: TEXT_NODE_TYPE, props: {}, children: [], text: "Click me" },
      ],
    },
  ],
}

console.log("\n\n=== 3. Assertion ===\n")

const checks: [string, boolean][] = [
  ["solid @ mount  === react @ mount   (live, this file)", shape(solidMountTree!) === shape(reactMountTree!)],
  ["solid @ update === react @ update  (live, this file)", shape(solidTree!) === shape(reactTree!)],
  ["solid @ mount  === step 03's published React output", shape(solidMountTree!, true) === shape(step03MountTree, true)],
  ["solid @ mount  === step 01's hand-written treeV1", shape(solidMountTree!, true) === shape(step01TreeV1, true)],
]

const width = Math.max(...checks.map(([name]) => name.length))
for (const [name, ok] of checks) console.log(`  ${name.padEnd(width)} : ${ok ? "PASS" : "FAIL"}`)

if (checks.some(([, ok]) => !ok)) {
  console.log("\n--- solid @ mount ---\n" + shape(solidMountTree!))
  console.log("\n--- react @ mount ---\n" + shape(reactMountTree!))
  console.log("\n--- step 03 ---\n" + shape(step03MountTree))
  console.log("\n--- step 01 ---\n" + shape(step01TreeV1))
  process.exitCode = 1
} else {
  console.log(`
  Two authoring frameworks with nothing in common internally — one that re-runs
  components and diffs, one that never re-runs anything — landed on the same
  4-node UINode tree, with the same props, the same child order and the same
  handler-id convention. It is also the tree step 01 wrote out by hand before
  either renderer existed, and the tree step 03 printed from React alone.

  No host, transport or native renderer downstream can tell which one produced
  it. That is what "a new plugin-side framework is a new renderer package and
  *zero* changes anywhere else" buys, and this file is the receipt.`)
}
