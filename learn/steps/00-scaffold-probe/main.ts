/**
 * Scaffold probe — NOT a lesson.
 *
 * Proves, before any lesson is written, that the version-sensitive pieces the
 * curriculum depends on actually work under the versions pinned in
 * `learn/package.json`:
 *
 *   1. `tsx` runs TypeScript directly.
 *   2. `react-reconciler@0.33` can be instantiated and driven to produce a tree.
 *   3. `solid-js@1.9.10`'s universal renderer can do the same.
 *
 * Keep as a smoke test; delete once the curriculum is complete.
 */
import ReactReconciler from "react-reconciler"
import { ConcurrentRoot } from "react-reconciler/constants"
import { createElement } from "react"
import { createRenderer } from "solid-js/universal"

// ---------------------------------------------------------------- shared shape
interface Node {
  type: string
  props: Record<string, unknown>
  children: Node[]
  text?: string
}

const show = (node: Node, depth = 0): string => {
  const pad = "  ".repeat(depth)
  if (node.text !== undefined) return `${pad}"${node.text}"`
  const head = `${pad}<${node.type}>`
  const kids = node.children.map((c) => show(c, depth + 1))
  return [head, ...kids].join("\n")
}

// ------------------------------------------------- 1. react-reconciler @ 0.33
const reconciler = ReactReconciler({
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  noTimeout: -1,
  createInstance: (type: string, props: Record<string, unknown>): Node => ({
    type,
    props,
    children: [],
  }),
  createTextInstance: (text: string): Node => ({
    type: "#text",
    props: {},
    children: [],
    text,
  }),
  appendInitialChild: (parent: Node, child: Node) => void parent.children.push(child),
  appendChild: (parent: Node, child: Node) => void parent.children.push(child),
  appendChildToContainer: (container: { root: Node | null }, child: Node) => {
    container.root = child
  },
  removeChild: (parent: Node, child: Node) => {
    parent.children = parent.children.filter((c) => c !== child)
  },
  removeChildFromContainer: (container: { root: Node | null }) => {
    container.root = null
  },
  insertBefore: (parent: Node, child: Node, before: Node) => {
    parent.children.splice(parent.children.indexOf(before), 0, child)
  },
  commitUpdate: (instance: Node, _type: unknown, _old: unknown, next: Record<string, unknown>) => {
    instance.props = next
  },
  commitTextUpdate: (instance: Node, _old: string, next: string) => {
    instance.text = next
  },
  finalizeInitialChildren: () => false,
  shouldSetTextContent: () => false,
  getRootHostContext: () => ({}),
  getChildHostContext: (parent: unknown) => parent,
  prepareForCommit: () => null,
  resetAfterCommit: () => {},
  clearContainer: (container: { root: Node | null }) => {
    container.root = null
  },
  getPublicInstance: (i: Node) => i,
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
  // These four are required by 0.33 and are easy to miss — omitting
  // `resolveEventTimeStamp` fails at runtime, not at type-check time, with
  // "resolveEventTimeStamp is not a function". The real host config sets the
  // same values: packages/react-renderer/src/reconciler/host-config.ts:296-304.
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  detachDeletedInstance: () => {},
} as never)

const reactContainerHandle: { root: Node | null } = { root: null }
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

function ReactApp() {
  return createElement(
    "column",
    { gap: 8 },
    createElement("text", { weight: "bold" }, "hello from React"),
    createElement("button", { label: "click" }),
  )
}

// `flushSyncFromReconciler` is the 0.33 runtime name; DefinitelyTyped still
// calls it `flushSync`. The real renderer documents this same seam in
// packages/react-renderer/src/reconciler/renderer.ts.
const sync = reconciler as unknown as { flushSyncFromReconciler<T>(cb: () => T): T }
sync.flushSyncFromReconciler(() => {
  reconciler.updateContainer(createElement(ReactApp), reactContainer, null, () => {})
})

console.log("=== 1. react-reconciler @ 0.33 produced a tree ===")
console.log(reactContainerHandle.root ? show(reactContainerHandle.root) : "(empty)")

// ------------------------------------------------ 2. solid-js universal renderer
const solid = createRenderer<Node>({
  createElement: (type: string): Node => ({ type, props: {}, children: [] }),
  createTextNode: (text: string): Node => ({ type: "#text", props: {}, children: [], text }),
  replaceText: (node: Node, text: string) => {
    node.text = text
  },
  setProperty: (node: Node, name: string, value: unknown) => {
    node.props[name] = value
  },
  insertNode: (parent: Node, node: Node) => void parent.children.push(node),
  removeNode: (parent: Node, node: Node) => {
    parent.children = parent.children.filter((c) => c !== node)
  },
  isTextNode: (node: Node) => node.type === "#text",
  getParentNode: () => undefined as never,
  getFirstChild: (node: Node) => node.children[0] as never,
  getNextSibling: () => undefined as never,
})

const solidRoot: Node = { type: "#root", props: {}, children: [] }
solid.render(() => {
  const column: Node = { type: "column", props: { gap: 8 }, children: [] }
  column.children.push({ type: "#text", props: {}, children: [], text: "hello from Solid" })
  column.children.push({ type: "button", props: { label: "click" }, children: [] })
  return column as never
}, solidRoot)

console.log("\n=== 2. solid-js universal renderer produced a tree ===")
console.log(show(solidRoot))

console.log("\nscaffold probe passed: tsx, react-reconciler@0.33, solid-js@1.9.10 all work here.")
