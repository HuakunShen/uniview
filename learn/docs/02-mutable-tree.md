# 02. Applying mutations on the host side, the operation every host must implement

## Why

Step 01 ended with six mutation kinds as inert data. Something has to fold them
into a tree, and that something is the *only* stateful thing a host owns.
`CLAUDE.md` puts `@uniview/host-sdk` and "every native host" in the same
sentence — they "speak `UINode` + `Mutation` + Style IR" — which means Svelte,
Vue, React, the terminal grid and AppKit all need this one operation and, apart
from drawing, essentially nothing else. The failure mode it exists to avoid is
specific and nasty: the host's tree and the plugin's tree are two copies of the
same state kept in sync by a stream of deltas, and any single mis-applied delta
makes them diverge *permanently*. There is no next frame that repairs it,
because the next frame is another delta computed against the plugin's copy. A
duplicated node stays duplicated; a stale index entry keeps accepting writes
that never render.

## Why this approach, and not the obvious alternative

The obvious alternative is **no index at all**: walk the tree to find
`mutation.nodeId`, splice, done. It is maybe fifteen lines and it is correct.
What it costs is visible in the real class's own comment — walking up to find and
rebuild a node's ancestors "made an N-row keyed reorder O(N²) per batch"
([packages/host-sdk/src/mutable-tree.ts:4](../../packages/host-sdk/src/mutable-tree.ts#L4)).
A keyed reorder emits one mutation per moved row and each one rescans the tree,
so the cost of dragging one item in a 500-row list is a quarter of a million
node visits per frame. Hence two indexes rather than one: `id -> node` makes the
lookup O(1), and `id -> parentId` makes the walk *upward* O(depth) instead of
O(N).

The second alternative is **mutating nodes in place** — `node.text = "..."` and
let the host re-render. That is genuinely what the terminal host does, and it is
right for a terminal, which repaints from a frame diff and does not care about
object identity. It is wrong for the web hosts, because Svelte `$state` and
React `useState` decide what to re-render by comparing references. Mutate in
place and nothing re-renders; clone the whole tree and everything re-renders.
So `MutableTree` clones exactly the path from the touched node to the root and
leaves every other subtree reference-equal, which is why `main.ts` can print
`<#text#n4> kept its identity? true` while the root object changed.

And one thing that looks like a bug but is a deliberate choice: on a mutation it
cannot satisfy, the applier **returns without throwing**. These records arrived
from a plugin the host does not control — possibly a different protocol version,
possibly mid-crash, definitely across `JSON.parse`. A host that throws lets any
plugin take down the application shell it was embedded in.

## What changed since step 01

Step 01's `UINode`, `JSONValue`, the six mutation interfaces and the `show()`
printer are carried forward **verbatim** — nothing about the protocol changed,
and a diff of the two `main.ts` files should show section 1 as unmoved. The
delta is everything after it:

- A `MutableTree` class: `init` / `getTree` / `getNode` / `applyMutations`, the
  private `applyMutation` switch over all six kinds, and the index machinery
  (`rebuildIndex`, `indexNode`, `unindexNode`, `replaceNode`,
  `detachExistingNode`). Step 01 declared the mutations; this step is the other
  side of the same contract.
- A `NaiveTree` class that exists only to be wrong, so the two subtleties below
  can be printed side by side rather than asserted in prose.
- Step 01 printed `treeV1`, `treeV2`, and the three-mutation encoding of the
  click between them. Step 02 starts from `getTree() === null`, applies
  `setRoot treeV1` and then step 01's exact three mutations, and checks the
  result against step 01's `treeV2` — `identical ... ? true`. That boolean is
  the whole point of the pair of steps: the incremental encoding and the
  whole-tree encoding are the same screen.
- Step 01's leftover `insertBefore` / `removeChild` records, which it could only
  print, are actually applied here.

## How Uniview really does it

Two indexes, and the regression that put the second one there:

```typescript
/**
 * MutableTree applies incremental mutations to a UINode tree.
 *
 * It maintains two indexes — id -> node and id -> parentId — so every
 * mutation is O(depth): detaching a moved node and rebuilding the ancestor
 * chain walk UP via the parent index instead of scanning the whole tree
 * (which made an N-row keyed reorder O(N²) per batch). Each mutation
 * produces new object references along the root path to trigger Svelte
 * $state reactivity.
 */
export class MutableTree {
  private tree: UINode | null = null;
  private nodeIndex: Map<string, UINode> = new Map();
  private parentIndex: Map<string, string> = new Map();
```

[packages/host-sdk/src/mutable-tree.ts:3](../../packages/host-sdk/src/mutable-tree.ts#L3)
(lines 3-16)

The move rule — the ordering subtlety this step demonstrates first, and the one
a naive host always misses:

```typescript
  /**
   * Detach a node from wherever it currently sits in the tree, if present.
   * appendChild/insertBefore mutations are also used to MOVE existing nodes
   * (keyed list reorders); without detaching first the node would appear
   * twice. The subtree is intentionally NOT unindexed — it is about to be
   * re-inserted.
   */
  private detachExistingNode(nodeId: string): void {
    const parentId = this.parentIndex.get(nodeId);
    if (parentId === undefined) return;
    const parent = this.nodeIndex.get(parentId);
    if (!parent) return;
```

[packages/host-sdk/src/mutable-tree.ts:147](../../packages/host-sdk/src/mutable-tree.ts#L147)
(lines 147-158)

And what the host does when it is asked to insert before a node it does not
have — the divergence path, in full:

```typescript
    if (insertIndex === -1) {
      // The anchor should always be present; a miss means the host tree
      // diverged from the plugin tree. Append as recovery so the node
      // isn't lost, but order is no longer trustworthy.
      console.error(
        `[uniview] insertBefore anchor ${mutation.beforeId} not found under ${mutation.parentId}; appending instead (tree state diverged)`,
      );
      insertIndex = parent.children.length;
    }
```

[packages/host-sdk/src/mutable-tree.ts:211](../../packages/host-sdk/src/mutable-tree.ts#L211)
(lines 211-219). Note the choice: a *misordered* node is recoverable by the next
full sync, a *lost* node is a permanently broken UI, so it appends.

## What this step leaves out

- **Validation of the incoming batch.** `MutableTree` trusts its input
  completely; it never checks that `mutation.node` is a well-formed `UINode`.
  The real controllers optionally run the protocol's Zod schemas over every
  incoming tree and mutation batch first, reporting violations without blocking
  — "off by default: validation walks the whole payload and is not free".
  [packages/host-sdk/src/validate.ts:17](../../packages/host-sdk/src/validate.ts#L17),
  wired at
  [packages/host-sdk/src/controllers/worker.ts:44](../../packages/host-sdk/src/controllers/worker.ts#L44).
- **The controller that owns the tree.** `MutableTree` is one field inside a
  `PluginController`: transport (kkrpc over a Worker / WebSocket / nothing), the
  `initialize` handshake with `PROTOCOL_VERSION`, a subscriber `Set` fanned out
  on every batch, `getStatus()`, error subscriptions, and a fresh
  `new MutableTree()` on every reconnect so a stale index cannot survive a
  disconnect.
  [packages/host-sdk/src/types.ts:5](../../packages/host-sdk/src/types.ts#L5),
  [packages/host-sdk/src/controllers/worker.ts:31](../../packages/host-sdk/src/controllers/worker.ts#L31).
- **Recovery from the divergence this step only reports.** When the host has
  diverged, `syncTree()` asks the plugin to resend the whole tree — the escape
  hatch that makes "append as recovery" acceptable. Nothing here can recover.
  [packages/host-sdk/src/controllers/worker.ts:134](../../packages/host-sdk/src/controllers/worker.ts#L134).
- **That there is more than one of these.** The terminal host ships its own
  `MutableTree` over the same six cases, mutating `parent.children` in place
  (no structural sharing — a terminal repaints from a frame diff) and exposing
  `getNode` / `parentId` publicly. This step's class borrows that public
  accessor while keeping the host-sdk internals.
  [packages/host-tui/src/mutable-tree.ts:13](../../packages/host-tui/src/mutable-tree.ts#L13).
- **The native one, which is a different data model.** AppKit's `ShadowTree`
  applies the same mutations to style-aware `ShadowNode`s rather than raw
  `UINode`s, and adds something the JS version does not have: revisioned
  `CommitBatch`es, where "a batch whose revision is not newer than the last
  applied is ignored (idempotent replay / drift guard)". Step 10.
  [packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift:9](../../packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift#L9).
- **Bare-string children.** Both this applier and the real one index only object
  children, so a legacy `children: ["hello"]` string has no id and no mutation
  can address it — it can only change when its parent is replaced wholesale.
  Hosts must still render them; "NEVER drop text children" is a listed
  anti-pattern in [CLAUDE.md](../../CLAUDE.md).
- **Anything about drawing.** Nothing here turns a `UINode` into a DOM element,
  a cell in a grid, or an `NSView`. That is stages C and D — steps 07 through 11.

## Trade-offs

- **Two `Map`s of every node in the UI.** Real memory, and two places that can
  drift out of sync with the tree if any code path forgets to call `indexNode`
  or `unindexNode`. It buys O(1) addressing and an O(depth) ancestor walk, which
  is the difference between a keyed reorder being linear and being quadratic.
- **Clone-along-the-path instead of mutate-in-place.** Every mutation allocates
  one new object per level of depth, and `applyMutations` allocates a root clone
  even when the batch changed nothing. It buys reference-equality change
  detection: a Svelte or React host re-renders exactly the changed path. The
  terminal host, which does not need that, declines the trade and mutates.
- **`appendChild` doubles as "move", and the host has to infer which.** Nothing
  in the record says move; the host is expected to check whether the id is
  already present. That keeps the mutation set at six instead of eight, at the
  cost of a rule every host reimplements — and gets wrong at least once, as
  `main.ts` prints (`[a, b, c, a]`).
- **Bad mutations are absorbed, not rejected.** A plugin cannot crash the host,
  which is the right default for untrusted plugin code. The cost is that a
  divergence surfaces as a `console.error` and a slightly wrong screen rather
  than a failure anyone acts on — and the reporting is uneven: `setText` and a
  missed `insertBefore` anchor log, while `appendChild` / `setProps` /
  `removeChild` against an unknown parent return silently, which drops the
  louder failure quietly.
- **Order within a batch is load-bearing.** `detachExistingNode` must run
  *before* the parent is read from the index, because a same-parent detach
  replaces that parent's index entry. Two adjacent statements whose order is a
  correctness property is exactly the kind of thing that survives review and
  dies in a refactor.

## Run it

```
pnpm tsx steps/02-mutable-tree/main.ts
```

Real output, **trimmed** from 83 lines to the ones that carry the idea. Elided:
both pretty-printed trees, section 2's header and its three echoed mutation
records, the trailing `=>` commentary under sections 3, 5 and 6, and section 7's
error list and closing note. Every line below is verbatim.

```
=== 1. A host starts with nothing ===
  getTree() -> null

  identical to step 01's whole-tree encoding (setRoot treeV2)? true
  => 274 bytes of mutations and 422 bytes of tree describe one screen.

=== 3. What object identity says about the update ===
  root replaced?                     true
  <button#n3> replaced by setProps?  true
  <#text#n4> under it kept its identity? true

=== 4. insertBefore: position comes from a node, not an index ===
  before: n1 children [n2, n3, n5]
  after : n1 children [n2, n6, n3, n5]
  => n6 landed at index 1 because n3 is there, not because 1 was sent.

  the same mutation with an anchor the host has never seen:
  HOST ERROR  [uniview] insertBefore anchor n404 not found under n1; appending instead (tree state diverged)
  after : n1 children [n2, n6, n3, n5, n7]

=== 5. appendChild of an existing id is a MOVE, not an insert ===
  mutation: appendChild { parentId: L, node: <li#a> }  // a is already in L
  naive applier : L children [a, b, c, a]   <- row A twice
  MutableTree   : L children [b, c, a]   <- moved

=== 6. removeChild must forget the whole subtree ===
  mutations: removeChild L/b   then   setText b-t (b's text child)

  naive applier : L children [a, c]
                  getNode("b-t") -> "row B (stale write)"

  MutableTree   : applying the same two mutations
  HOST ERROR  [uniview] setText target b-t not found (tree state diverged)
                  L children [a, c]
                  getNode("b-t") -> undefined

=== 7. A mutation referencing an id the host has never seen ===
  before: n1 children [n2, n3, n5]
  HOST ERROR  [uniview] setText target n404 not found (tree state diverged)
  after : n1 children [n2, n3, n5]
  n8 in the index? false
  host still alive and holding a valid tree? true
```

The three lines worth staring at: `identical ... ? true` (the incremental and
whole-tree encodings agree), `[a, b, c, a]` (one missing `detachExistingNode`
call, rendered twice forever), and `getNode("b-t") -> "row B (stale write)"`
(a write that reported success into a node nothing will ever draw).

## Sources

- [packages/host-sdk/src/mutable-tree.ts](../../packages/host-sdk/src/mutable-tree.ts) —
  the class this step is a miniature of: `init`, `getTree`, `applyMutations`,
  `rebuildIndex`, `indexNode`, `unindexNode`, `replaceNode`,
  `detachExistingNode`, and the six `apply*` handlers
- [packages/host-sdk/src/validate.ts](../../packages/host-sdk/src/validate.ts) —
  `validateIncomingTree`, `validateIncomingMutations`, and why they are off by
  default
- [packages/host-sdk/src/types.ts](../../packages/host-sdk/src/types.ts) —
  `PluginController`, `HostMode`, `ComponentRegistry`
- [packages/host-sdk/src/controllers/worker.ts](../../packages/host-sdk/src/controllers/worker.ts) —
  where `MutableTree`, validation, subscribers and `syncTree()` are wired
  together
- [packages/host-sdk/tests/mutable-tree.test.ts](../../packages/host-sdk/tests/mutable-tree.test.ts) —
  the append/insert/remove ordering assertions this step prints instead
- [packages/host-tui/src/mutable-tree.ts](../../packages/host-tui/src/mutable-tree.ts) —
  the second implementation, mutating in place
- [packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift](../../packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift) —
  the third, in Swift, with revisioned commit batches
- [packages/protocol/src/mutations.ts](../../packages/protocol/src/mutations.ts) —
  the six mutation interfaces, including the "must treat this as a MOVE" rule
- [CLAUDE.md](../../CLAUDE.md) — "every native host speak[s] `UINode` +
  `Mutation` + Style IR", and the text-children anti-pattern
- [learn/docs/01-protocol.md](./01-protocol.md) and
  [learn/steps/01-protocol/main.ts](../steps/01-protocol/main.ts) — the types,
  the `show()` printer and the mutation batch this step replays
