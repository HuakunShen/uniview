/**
 * Step 02 — The mutable tree.
 *
 * Step 01 built the contract as *data*: a `UINode` tree, and six kinds of
 * `Mutation` describing changes to it. Nothing applied them. This step is the
 * other half of the same contract — the host side.
 *
 * A host is whatever ends up on a screen: Svelte, Vue, React, a terminal grid,
 * AppKit in Swift. `CLAUDE.md` says they are all the same kind of thing:
 *
 *   "@uniview/protocol, @uniview/host-sdk and every native host speak UINode +
 *    Mutation + Style IR."
 *
 * Speaking `Mutation` means exactly one operation: keep a tree, and fold a
 * batch of mutations into it. That operation is `MutableTree`, and it is the
 * reason five different hosts are possible — get it right once and each host
 * only has to know how to *draw* a `UINode`, never how to *maintain* one.
 *
 * This file implements a miniature of the real
 * `packages/host-sdk/src/mutable-tree.ts`: same class name, same method names,
 * same two indexes, same six cases. Then it does four things the real unit
 * tests do, out loud:
 *
 *   1. rebuilds step 01's frame 2 from an empty tree using step 01's exact
 *      mutation list, and checks it against step 01's whole-tree encoding;
 *   2. shows the structural sharing that makes a host framework re-render only
 *      the path that changed;
 *   3. shows three ordering subtleties a naive applier gets wrong, side by side
 *      with a naive applier getting them wrong;
 *   4. feeds the host a mutation that references an id it has never seen —
 *      because the mutations arrive from a plugin the host does not control.
 */

// ---------------------------------------------------------------------------
// 1. Carried forward from step 01 — the protocol, unchanged
// ---------------------------------------------------------------------------
//
// Steps do not import each other; each directory stands alone. These are the
// step 01 definitions verbatim, with the long commentary trimmed. If you did
// step 01 you can skim to section 2 — nothing about the protocol changed.

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

/** A subset of the real 40-entry `LAYOUT_TAGS`. */
const LAYOUT_TAGS = ["div", "span", "button", "input", "p", "ul", "li"] as const
type UILayoutTag = (typeof LAYOUT_TAGS)[number]

/** The whole node type: four required fields, one optional. */
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

// ---------------------------------------------------------------------------
// 2. Printing — step 01's `show`, plus a one-line child list
// ---------------------------------------------------------------------------

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

/** Child order on one line — this is what every ordering subtlety below is about. */
const childIds = (node: UINode | null | undefined): string =>
  node
    ? "[" +
      node.children
        .map((c) => (typeof c === "string" ? `"${c}"` : c.id))
        .join(", ") +
      "]"
    : "(no such node)"

const text = (id: string, content: string): UINode => ({
  id,
  type: TEXT_NODE_TYPE,
  props: {},
  children: [],
  text: content,
})

// ---------------------------------------------------------------------------
// 3. MutableTree — the operation every host implements
// ---------------------------------------------------------------------------

/**
 * Applies incremental mutations to a `UINode` tree.
 *
 * Two indexes, not one:
 *
 *   nodeIndex   id -> node       so `setText n2` is a lookup, not a tree walk
 *   parentIndex id -> parentId   so *detaching* a node and *rebuilding the
 *                                ancestor chain* walk UP, in O(depth)
 *
 * The parent index is the non-obvious half. Without it, every mutation that
 * has to touch a node's ancestors has to scan the tree to find them, which
 * makes an N-row keyed reorder O(N^2) per batch — the real class documents
 * exactly that regression as the reason it exists.
 *
 * The second non-obvious property: **this class never mutates a node in
 * place.** Every mutation produces fresh objects along the path from the
 * touched node to the root, and leaves every untouched subtree at its old
 * object identity. That is not stylistic purity — it is the whole reason a
 * Svelte `$state` / React `useState` host can re-render only what changed.
 * Section 6 prints the identities.
 */
class MutableTree {
  private tree: UINode | null = null
  private nodeIndex: Map<string, UINode> = new Map()
  private parentIndex: Map<string, string> = new Map()

  /**
   * Where the errors go. The real class calls `console.error` directly; the
   * sink is a teaching seam so this file's output stays in one ordered stream.
   */
  private readonly onError: (message: string) => void

  constructor(onError: (message: string) => void = (m) => console.error(m)) {
    this.onError = onError
  }

  /** Initialize with a full tree — from `setRoot`, or from a full `updateTree`. */
  init(tree: UINode | null): void {
    this.tree = tree
    this.rebuildIndex()
  }

  /** The current tree. This is what the host adapter actually renders. */
  getTree(): UINode | null {
    return this.tree
  }

  /**
   * Look up one node by id. The real host-sdk class keeps its index private;
   * the terminal host's copy exposes exactly this accessor, and the demos
   * below need it to show what is and is not still addressable.
   */
  getNode(id: string): UINode | undefined {
    return this.nodeIndex.get(id)
  }

  /**
   * Apply a batch and return the new root.
   *
   * The returned root is a *shallow clone* even when nothing changed. That
   * looks wasteful and is deliberate: a host framework's change detection is
   * usually reference equality on the root, so handing back the same object
   * would render nothing.
   */
  applyMutations(mutations: Mutation[]): UINode | null {
    for (const mutation of mutations) {
      this.applyMutation(mutation)
    }
    return this.tree ? { ...this.tree } : null
  }

  /** The whole protocol, as a switch. Six cases; there is never a seventh. */
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

  // -- index maintenance ----------------------------------------------------

  private rebuildIndex(): void {
    this.nodeIndex.clear()
    this.parentIndex.clear()
    if (this.tree) {
      this.indexNode(this.tree, null)
    }
  }

  /** Index a node and everything under it. Bare-string children have no id. */
  private indexNode(node: UINode, parentId: string | null): void {
    this.nodeIndex.set(node.id, node)
    if (parentId !== null) {
      this.parentIndex.set(node.id, parentId)
    } else {
      this.parentIndex.delete(node.id)
    }
    for (const child of node.children) {
      if (typeof child !== "string") {
        this.indexNode(child, node.id)
      }
    }
  }

  /**
   * Forget a node AND its whole subtree.
   *
   * The recursion is the point. Remove a `<li>` and its text child ceases to
   * exist as far as the plugin is concerned; if the host keeps the text child
   * in its index, a later `setText` aimed at it *silently succeeds* against an
   * object no longer attached to anything. Section 8 shows that failure.
   */
  private unindexNode(node: UINode): void {
    this.nodeIndex.delete(node.id)
    this.parentIndex.delete(node.id)
    for (const child of node.children) {
      if (typeof child !== "string") {
        this.unindexNode(child)
      }
    }
  }

  /**
   * Swap in a new object for `targetId` and rebuild fresh objects all the way
   * up to the root, following `parentIndex`. Siblings keep their identity.
   */
  private replaceNode(targetId: string, newNode: UINode): void {
    this.nodeIndex.set(targetId, newNode)

    let childId = targetId
    let childNode = newNode
    while (this.tree && this.tree.id !== childId) {
      const parentId = this.parentIndex.get(childId)
      if (parentId === undefined) return // not attached to the root
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

    if (this.tree && this.tree.id === childId) {
      this.tree = childNode
    }
  }

  /**
   * Detach a node from wherever it currently sits, if it sits anywhere.
   *
   * THIS is the ordering subtlety that a naive host misses. `appendChild` and
   * `insertBefore` are not only insertions — the protocol says a host "must
   * treat this as a MOVE when the node already exists in the tree", which is
   * what a keyed list reorder compiles down to. Skip the detach and the node
   * is rendered twice.
   *
   * Note what is NOT done here: the subtree is deliberately not unindexed,
   * because it is about to be re-inserted somewhere else.
   */
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

  // -- the six operations ---------------------------------------------------

  private applyAppendChild(mutation: AppendChildMutation): void {
    // Detach first: this mutation may be moving an existing node.
    this.detachExistingNode(mutation.node.id)
    const parent = this.nodeIndex.get(mutation.parentId)
    if (!parent) return

    const newParent: UINode = {
      ...parent,
      children: [...parent.children, mutation.node],
    }

    this.indexNode(mutation.node, mutation.parentId)
    this.replaceNode(mutation.parentId, newParent)
  }

  private applyInsertBefore(mutation: InsertBeforeMutation): void {
    // Detach first (may be a move), and only THEN resolve the parent — a
    // same-parent detach has just replaced the parent's index entry, so
    // reading `parent` any earlier would splice into a stale object and lose
    // the detach. Two statements whose order is load-bearing.
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
      // The anchor should always be present; a miss means the host tree
      // diverged from the plugin tree. Append as recovery so the node isn't
      // lost, but order is no longer trustworthy.
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
        this.unindexNode(child) // the whole subtree, not just this node
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
    // Full replacement, never a merge — the protocol does not define a
    // removal convention, so "props" means "all of the props".
    this.replaceNode(mutation.nodeId, { ...node, props: mutation.props })
  }
}

// ---------------------------------------------------------------------------
// 4. NaiveTree — the version a host author writes on the first attempt
// ---------------------------------------------------------------------------

/**
 * Everything the obvious reading of the protocol gives you: an id index, and
 * "append means push, remove means filter". It is wrong in exactly two places,
 * and both are invisible until a real UI reorders or unmounts something.
 */
class NaiveTree {
  private tree: UINode | null = null
  private nodeIndex: Map<string, UINode> = new Map()

  init(tree: UINode | null): void {
    this.tree = tree
    this.nodeIndex.clear()
    if (tree) this.index(tree)
  }

  private index(node: UINode): void {
    this.nodeIndex.set(node.id, node)
    for (const c of node.children) if (typeof c !== "string") this.index(c)
  }

  getTree(): UINode | null {
    return this.tree
  }

  getNode(id: string): UINode | undefined {
    return this.nodeIndex.get(id)
  }

  applyMutations(mutations: Mutation[]): void {
    for (const m of mutations) {
      switch (m.type) {
        case "appendChild": {
          const parent = this.nodeIndex.get(m.parentId)
          if (!parent) break
          parent.children.push(m.node) // BUG 1: no detach — a move duplicates
          this.index(m.node)
          break
        }
        case "removeChild": {
          const parent = this.nodeIndex.get(m.parentId)
          if (!parent) break
          parent.children = parent.children.filter(
            (c) => typeof c === "string" || c.id !== m.nodeId,
          )
          this.nodeIndex.delete(m.nodeId) // BUG 2: children stay indexed
          break
        }
        case "setText": {
          const node = this.nodeIndex.get(m.nodeId)
          if (node) node.text = m.text
          break
        }
        default:
          break // the other three are not needed for the contrast below
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. An empty host meets its first frame
// ---------------------------------------------------------------------------

// Everything the host prints goes through one sink so the ordering below is
// deterministic. In production this is `console.error`.
const hostLog: string[] = []
const tree = new MutableTree((message) => {
  hostLog.push(message)
  console.log(`  HOST ERROR  ${message}`)
})

console.log("=== 1. A host starts with nothing ===")
console.log(`  getTree() -> ${JSON.stringify(tree.getTree())}`)

// The plugin's first render arrives as a single `setRoot`. This node literal is
// step 01's `treeV1`, byte for byte.
const treeV1: UINode = {
  id: "n1",
  type: "column",
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

const afterSetRoot = tree.applyMutations([{ type: "setRoot", node: treeV1 }])
console.log("\n  after one setRoot mutation — BEFORE:")
console.log(show(afterSetRoot as UINode))

// ---------------------------------------------------------------------------
// 6. Step 01's mutation batch, applied
// ---------------------------------------------------------------------------

// Verbatim from step 01: the three-record incremental encoding of one click.
const asMutations: Mutation[] = [
  { type: "setText", nodeId: "n2", text: "Clicked 1 times" },
  {
    type: "setProps",
    nodeId: "n3",
    props: { disabled: false, _onClickHandlerId: "h_1" },
  },
  { type: "appendChild", parentId: "n1", node: text("n5", "last click: just now") },
]

// And step 01's whole-tree encoding of the *same* click, kept only to compare
// against. A host that applies the mutations must land on exactly this.
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

console.log("\n=== 2. Applying step 01's three mutations ===")
for (const m of asMutations) console.log(`  ${m.type.padEnd(12)} ${JSON.stringify(m)}`)

const rootBefore = tree.getTree() as UINode
const buttonBefore = rootBefore.children[1]
const afterBatch = tree.applyMutations(asMutations) as UINode

console.log("\n  AFTER:")
console.log(show(afterBatch))

// The point of the whole curriculum's first two steps, in one boolean: the
// incremental encoding and the whole-tree encoding are the same UI.
const equivalent = JSON.stringify(afterBatch) === JSON.stringify(treeV2)
console.log(
  `\n  identical to step 01's whole-tree encoding (setRoot treeV2)? ${equivalent}`,
)
console.log("  => 274 bytes of mutations and 422 bytes of tree describe one screen.")

// ---------------------------------------------------------------------------
// 7. Structural sharing — why the host rebuilds the path and nothing else
// ---------------------------------------------------------------------------

// n3 was touched by setProps, so it is legitimately a new object. n4, its text
// child, was NOT touched by anything and must survive with its identity.
const buttonAfter = afterBatch.children[1] as UINode
const buttonBeforeNode = buttonBefore as UINode

console.log("\n=== 3. What object identity says about the update ===")
console.log(`  root replaced?                     ${rootBefore !== afterBatch}`)
console.log(
  `  <button#n3> replaced by setProps?  ${buttonBefore !== afterBatch.children[1]}`,
)
console.log(
  `  <#text#n4> under it kept its identity? ` +
    `${buttonBeforeNode.children[0] === buttonAfter.children[0]}`,
)
console.log(
  "  => a Svelte/React host re-renders the changed path only; everything else\n" +
    "     is reference-equal and skipped. This is why the applier clones rather\n" +
    "     than mutating in place.",
)

// ---------------------------------------------------------------------------
// 8. Ordering subtlety A — insertBefore has an anchor, and the anchor can miss
// ---------------------------------------------------------------------------

console.log("\n=== 4. insertBefore: position comes from a node, not an index ===")
console.log(`  before: n1 children ${childIds(tree.getTree())}`)

// Step 01's `remaining[0]`, verbatim.
tree.applyMutations([
  {
    type: "insertBefore",
    parentId: "n1",
    node: text("n6", "inserted above the button"),
    beforeId: "n3",
  },
])
console.log(`  after : n1 children ${childIds(tree.getTree())}`)
console.log("  => n6 landed at index 1 because n3 is there, not because 1 was sent.")

// Now the same mutation against an anchor that does not exist. This is what a
// host sees when its tree has drifted from the plugin's. The real applier does
// not throw and does not drop the node — it appends and says so, because a lost
// node is a permanently broken UI while a misordered one is recoverable by the
// next full sync.
console.log("\n  the same mutation with an anchor the host has never seen:")
tree.applyMutations([
  {
    type: "insertBefore",
    parentId: "n1",
    node: text("n7", "anchored to a ghost"),
    beforeId: "n404",
  },
])
console.log(`  after : n1 children ${childIds(tree.getTree())}`)

// Clean up so the next sections start from the frame-2 shape.
tree.applyMutations([
  { type: "removeChild", parentId: "n1", nodeId: "n6" },
  { type: "removeChild", parentId: "n1", nodeId: "n7" },
])

// ---------------------------------------------------------------------------
// 9. Ordering subtlety B — appendChild of a known id is a MOVE
// ---------------------------------------------------------------------------

/** A keyed list: three rows, each with its own text child. */
const list = (): UINode => ({
  id: "L",
  type: "ul",
  props: {},
  children: [
    { id: "a", type: "li", props: {}, children: [text("a-t", "row A")] },
    { id: "b", type: "li", props: {}, children: [text("b-t", "row B")] },
    { id: "c", type: "li", props: {}, children: [text("c-t", "row C")] },
  ],
})

// A keyed reorder — "move row A to the end" — is emitted by the renderer as an
// appendChild of a node the host ALREADY HAS. Nothing in the mutation says
// "move"; the host is expected to know.
const moveAToEnd: Mutation[] = [
  {
    type: "appendChild",
    parentId: "L",
    node: { id: "a", type: "li", props: {}, children: [text("a-t", "row A")] },
  },
]

const naive = new NaiveTree()
naive.init(list())
naive.applyMutations(moveAToEnd)

const correct = new MutableTree()
correct.init(list())
correct.applyMutations(moveAToEnd)

console.log("\n=== 5. appendChild of an existing id is a MOVE, not an insert ===")
console.log("  mutation: appendChild { parentId: L, node: <li#a> }  // a is already in L")
console.log(`  naive applier : L children ${childIds(naive.getTree())}   <- row A twice`)
console.log(`  MutableTree   : L children ${childIds(correct.getTree())}   <- moved`)
console.log(
  "  => the fix is one line: detachExistingNode(node.id) BEFORE resolving the\n" +
    "     parent. Every keyed list reorder in every host depends on it.",
)

// ---------------------------------------------------------------------------
// 10. Ordering subtlety C — removing a node removes its subtree from the index
// ---------------------------------------------------------------------------

const naive2 = new NaiveTree()
naive2.init(list())
const correct2 = new MutableTree((m) => console.log(`  HOST ERROR  ${m}`))
correct2.init(list())

// Unmount row B, then — one frame later, from a plugin that is slightly behind —
// a setText aimed at the text node that used to live inside it.
const unmountThenStaleWrite: Mutation[] = [
  { type: "removeChild", parentId: "L", nodeId: "b" },
  { type: "setText", nodeId: "b-t", text: "row B (stale write)" },
]

console.log("\n=== 6. removeChild must forget the whole subtree ===")
console.log("  mutations: removeChild L/b   then   setText b-t (b's text child)")

naive2.applyMutations(unmountThenStaleWrite)
console.log(`\n  naive applier : L children ${childIds(naive2.getTree())}`)
console.log(`                  getNode("b-t") -> ${JSON.stringify(naive2.getNode("b-t")?.text)}`)
console.log(
  "                  the write SUCCEEDED, silently, into a node that is no\n" +
    "                  longer in the tree. No error, no visible change, and the\n" +
    "                  host's index now leaks every unmounted node forever.",
)

console.log("\n  MutableTree   : applying the same two mutations")
correct2.applyMutations(unmountThenStaleWrite)
console.log(`                  L children ${childIds(correct2.getTree())}`)
console.log(`                  getNode("b-t") -> ${JSON.stringify(correct2.getNode("b-t"))}`)
console.log(
  "  => unindexNode recurses, so the stale write has nowhere to land and is\n" +
    "     reported instead of swallowed.",
)

// ---------------------------------------------------------------------------
// 11. Mutations the host must refuse — because it does not control the sender
// ---------------------------------------------------------------------------

// The host is not applying its own edits. These records came out of JSON.parse,
// off a socket, from a plugin that may be a different protocol version, may have
// crashed mid-batch, or may simply be buggy. The rule the real applier follows:
// NEVER THROW. A host that throws on a bad mutation lets any plugin take down
// the application shell around it.
console.log("\n=== 7. A mutation referencing an id the host has never seen ===")
const before = tree.getTree()
console.log(`  before: n1 children ${childIds(before)}`)

const hostile: Mutation[] = [
  // (a) a write to a node that does not exist -> reported, ignored
  { type: "setText", nodeId: "n404", text: "into the void" },
  // (b) an append under a parent that does not exist -> ignored SILENTLY
  { type: "appendChild", parentId: "n404", node: text("n8", "orphan") },
  // (c) props for a node that does not exist -> ignored SILENTLY
  { type: "setProps", nodeId: "n404", props: { color: "red" } },
]
const after = tree.applyMutations(hostile) as UINode

console.log(`  after : n1 children ${childIds(after)}`)
console.log(`  n8 in the index? ${tree.getNode("n8") !== undefined}`)
console.log(`  host still alive and holding a valid tree? ${after.id === "n1"}`)
console.log(`  errors reported this run: ${hostLog.length}`)
for (const m of hostLog) console.log(`    - ${m}`)
console.log(
  "\n  Note the asymmetry, which is real and is in the production file: setText\n" +
    "  and a missed insertBefore anchor log; appendChild / setProps / removeChild\n" +
    "  against an unknown parent return silently. Losing a whole subtree is the\n" +
    "  quieter failure of the two, which is arguably backwards.",
)

console.log(
  "\nOne class, two indexes, six cases. Every host in stages C and D — Svelte,\n" +
    "Vue, React, the terminal grid, AppKit in Swift — holds one of these and does\n" +
    "nothing else with the protocol. Step 03 goes back to the other end of the\n" +
    "wire and asks where the mutations come from.",
)
