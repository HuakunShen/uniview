/**
 * Step 01 — The protocol.
 *
 * Uniview's promise is three independent fan-outs at once: write a plugin in
 * React *or* Solid, render it in Svelte / Vue / React / a terminal / native
 * AppKit, and run it on the main thread / in a Worker / in another process.
 *
 * Three fan-outs would normally mean an N x M x K explosion of adapters. It
 * doesn't, because everything in the middle is squeezed through one very small
 * contract:
 *
 *     a tree of { id, type, props, children }   +   six kinds of mutation
 *
 * That is the whole protocol. `CLAUDE.md`'s prime directive is what forces it
 * to stay this small:
 *
 *   "Uniview is a renderer. It renders what the tree says. It has no opinions
 *    of its own — not about which UI framework you author in, not about which
 *    app is being built, and above all not about what that app looks like."
 *
 * A renderer with no opinions has nothing to say beyond "here is the tree" and
 * "here is what changed". This file builds both by hand, as plain data.
 *
 * NOTHING IS RENDERED HERE, AND NOTHING IS APPLIED HERE. Applying mutations to
 * a host-side tree is step 02. Step 01 is the data model alone — because the
 * data model is the part every one of those fan-outs has to agree on, and it is
 * worth staring at on its own before anything moves.
 */

// ---------------------------------------------------------------------------
// 1. JSONValue — the reason `props` is not `Record<string, unknown>`
// ---------------------------------------------------------------------------

/**
 * The only kinds of value allowed to appear in a node's props.
 *
 * Why so strict? Because a UINode does not stay in one JS heap. Depending on
 * the runtime the same tree has to survive:
 *
 *   - main thread   — no boundary at all (step 12)
 *   - Web Worker    — `postMessage`, i.e. the *structured clone* algorithm
 *                     (step 13). Structured clone throws `DataCloneError` on a
 *                     function, and silently discards class identity, getters
 *                     and prototypes.
 *   - WebSocket     — `JSON.stringify` over a socket to another process, or
 *                     another machine (step 14).
 *   - a native host — the tree is decoded by Swift/AppKit, which has no JS
 *                     runtime at all (step 10). Whatever a `Symbol` or a
 *                     `Date` "means" does not survive that trip.
 *
 * The narrowest of those boundaries wins, so `props` is restricted to what a
 * native decoder can reconstruct with no JS in the room: null, boolean, number,
 * string, arrays and plain objects of the same.
 *
 * The obvious casualty is event handlers. `onClick` is a function, and a
 * function is not a JSONValue — so it cannot travel. Uniview's answer is the
 * handler-registry pattern: the function stays in the plugin, and the props
 * carry a `_onClickHandlerId` string instead. That is step 13/15; here it is
 * enough to see *why* the type makes it unavoidable.
 */
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue }

// ---------------------------------------------------------------------------
// 2. UINode — the tree
// ---------------------------------------------------------------------------

/**
 * Reserved node type for text content.
 *
 * Text is a node with an `id`, not a bare string, so that mutations can
 * *address* it: "set the text of node n2" and "insert before node n2" both
 * need text to have a name. (The real protocol calls this v3; before it,
 * `setText` was addressed by parent + child index, which corrupted the wrong
 * child whenever the host and plugin trees drifted apart.)
 */
const TEXT_NODE_TYPE = "#text"

/**
 * A subset of the real `LAYOUT_TAGS` — enough to make the point.
 *
 * A `type` is one of three things: a layout tag (below), a product-defined
 * primitive the host knows how to draw ("column" in this example), or
 * TEXT_NODE_TYPE. The protocol keeps `type` a plain `string` precisely so a
 * product can add primitives without touching the protocol package.
 */
const LAYOUT_TAGS = ["div", "span", "button", "input", "p", "ul", "li"] as const
type UILayoutTag = (typeof LAYOUT_TAGS)[number]

/**
 * The entire node type. Four required fields, one optional.
 *
 * - `id`     stable across renders; this is what makes incremental updates
 *            possible at all. Without it a host cannot tell "the label changed"
 *            from "the old label was removed and a new one added".
 * - `type`   layout tag | product primitive | TEXT_NODE_TYPE
 * - `props`  JSON only — see above
 * - `children` nested nodes (a bare `string` is still accepted for backward
 *            compatibility, which is why the union is here)
 * - `text`   set only when `type === TEXT_NODE_TYPE`
 */
export interface UINode {
  id: string
  type: string
  props: Record<string, JSONValue>
  children: (UINode | string)[]
  text?: string
}

const isLayoutTag = (type: string): type is UILayoutTag =>
  (LAYOUT_TAGS as readonly string[]).includes(type)

const isTextUINode = (node: UINode | string): node is UINode & { text: string } =>
  typeof node !== "string" && node.type === TEXT_NODE_TYPE

// ---------------------------------------------------------------------------
// 3. Mutation — the six kinds, and nothing else
// ---------------------------------------------------------------------------

/**
 * Six. Not seven, not twenty.
 *
 * Every host — Svelte, Vue, React, a terminal grid, AppKit in Swift — has to
 * implement exactly these six operations and no more. That bounded set is what
 * makes "reimplement the renderer on a new platform in about a week"
 * (`CLAUDE.md`) a credible claim rather than a wish.
 *
 * Note that each is a *discriminated union member* keyed on `type`. That is not
 * decoration: after a mutation has been through `JSON.parse` it is an anonymous
 * blob, and the `type` string is the only thing left to switch on.
 */

/**
 * Append a child to a parent. The full serialized subtree travels in `node`.
 * A host must treat this as a MOVE when the node id already exists in its tree
 * — detach it from its current position first.
 */
export interface AppendChildMutation {
  type: "appendChild"
  parentId: string
  node: UINode
}

/** Insert before a reference node. `beforeId` may name an element or a text node. */
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

/**
 * Replace *all* props of an element node. Full props, not a diff — the
 * protocol deliberately does not make hosts merge, because "merge" needs a
 * removal convention (is a missing key "unchanged" or "deleted"?) and every
 * host would have to get it identically right.
 */
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

// ---------------------------------------------------------------------------
// 4. Pretty-printing, so the shape is visible
// ---------------------------------------------------------------------------

/** Same `show` shape as step 00's scaffold probe, plus ids and props. */
function show(node: UINode | string, depth = 0): string {
  const pad = "  ".repeat(depth)
  if (typeof node === "string") return `${pad}"${node}" (legacy bare string)`
  if (isTextUINode(node)) return `${pad}#text#${node.id} "${node.text}"`

  const kind = isLayoutTag(node.type) ? "layout tag" : "product primitive"
  const props = Object.entries(node.props)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ")
  const head = `${pad}<${node.type}#${node.id}${props ? " " + props : ""}>  // ${kind}`
  return [head, ...node.children.map((c) => show(c, depth + 1))].join("\n")
}

/** Byte size on the wire. UTF-8, because that is what a socket actually carries. */
const bytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length

const text = (id: string, content: string): UINode => ({
  id,
  type: TEXT_NODE_TYPE,
  props: {},
  children: [],
  text: content,
})

// ---------------------------------------------------------------------------
// 5. Frame 1 — hand-build a tree
// ---------------------------------------------------------------------------

// A counter UI: a column holding a label and a button. Written out by hand so
// that nothing is hiding behind a framework. Steps 03-06 replace this literal
// with React and with Solid — and both produce *exactly* this shape.
const treeV1: UINode = {
  id: "n1",
  type: "column", // not an HTML tag: a product primitive the host draws
  props: { gap: 8, padding: 16 },
  children: [
    text("n2", "Clicked 0 times"),
    {
      id: "n3",
      type: "button",
      props: { disabled: true, _onClickHandlerId: "h_1" },
      children: [text("n4", "Click me")],
    },
  ],
}

console.log("=== 1. A UI, as data ===")
console.log(show(treeV1))
console.log(`\n${bytes(treeV1)} bytes of JSON.`)

// Note `_onClickHandlerId: "h_1"` above. The plugin's real onClick is a
// closure; a closure cannot cross a structured-clone boundary, so what travels
// is a string naming it. Nothing about the tree changes between runtimes — the
// main-thread runtime carries the same string, it just resolves it locally.

// ---------------------------------------------------------------------------
// 6. Frame 2 — the same UI after one interaction
// ---------------------------------------------------------------------------

// The user clicks. Three things change: the label text, the button's disabled
// prop, and a new status line appears at the end of the column.
const treeV2: UINode = {
  id: "n1",
  type: "column",
  props: { gap: 8, padding: 16 },
  children: [
    text("n2", "Clicked 1 times"),
    {
      id: "n3",
      type: "button",
      props: { disabled: false, _onClickHandlerId: "h_1" },
      children: [text("n4", "Click me")],
    },
    text("n5", "last click: just now"),
  ],
}

console.log("\n=== 2. The same UI, one click later ===")
console.log(show(treeV2))

// ---------------------------------------------------------------------------
// 7. The same change, expressed two ways
// ---------------------------------------------------------------------------

// (a) FULL: throw the old tree away, send the new one. Correct, trivial to
//     implement in a host, and the mode the protocol still supports by default.
const asFullTree: Mutation[] = [{ type: "setRoot", node: treeV2 }]

// (b) INCREMENTAL: send only what changed. Same end state, three small records.
const asMutations: Mutation[] = [
  { type: "setText", nodeId: "n2", text: "Clicked 1 times" },
  {
    type: "setProps",
    nodeId: "n3",
    props: { disabled: false, _onClickHandlerId: "h_1" },
  },
  { type: "appendChild", parentId: "n1", node: text("n5", "last click: just now") },
]

console.log("\n=== 3. One change, two encodings ===")
console.log("\n(a) whole tree:")
console.log(JSON.stringify(asFullTree, null, 2))
console.log("\n(b) mutations:")
console.log(JSON.stringify(asMutations, null, 2))

const fullBytes = bytes(asFullTree)
const mutBytes = bytes(asMutations)
console.log("\n  whole tree : " + String(fullBytes).padStart(5) + " bytes")
console.log("  mutations  : " + String(mutBytes).padStart(5) + " bytes")
console.log(`  ratio      : ${(fullBytes / mutBytes).toFixed(2)}x`)

// On a 4-node toy the ratio is unimpressive, and that is worth being honest
// about. The number that matters is how it scales: the mutation payload is
// proportional to what *changed*, while the full-tree payload is proportional
// to how big the UI *is*. Type one character into a search box inside a
// 200-node list and the full-tree encoding re-serializes all 200 nodes,
// structured-clones them across a Worker boundary, and the host rebuilds every
// component — per keystroke. Step 05 is where that stops being theoretical.

console.log("\n  the same edit inside a larger UI:")
for (const listSize of [4, 40, 400]) {
  const padded: UINode = {
    ...treeV2,
    children: [
      ...treeV2.children,
      ...Array.from({ length: listSize }, (_, i) =>
        text(`row${i}`, `list row number ${i}`),
      ),
    ],
  }
  const full = bytes([{ type: "setRoot", node: padded }] satisfies Mutation[])
  console.log(
    `    +${String(listSize).padStart(3)} rows   whole tree ${String(full).padStart(6)} B` +
      `   mutations ${String(mutBytes).padStart(6)} B` +
      `   ${(full / mutBytes).toFixed(1)}x`,
  )
}

// ---------------------------------------------------------------------------
// 8. The two kinds this example did not need
// ---------------------------------------------------------------------------

// insertBefore and removeChild complete the set. They are what a reordering or
// a conditional render compiles down to. Still just data — nothing applies them
// until step 02.
const remaining: Mutation[] = [
  {
    type: "insertBefore",
    parentId: "n1",
    node: text("n6", "inserted above the button"),
    beforeId: "n3",
  },
  { type: "removeChild", parentId: "n1", nodeId: "n5" },
]

console.log("\n=== 4. The remaining two kinds ===")
for (const m of remaining) console.log(`  ${m.type.padEnd(12)} ${JSON.stringify(m)}`)

console.log(
  "\nSix mutation kinds and one node type. Every authoring framework emits\n" +
    "only these; every host implements only these; every transport carries only\n" +
    "these. Step 02 applies them to a host-side tree.",
)
