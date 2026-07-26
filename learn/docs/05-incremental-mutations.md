# 05. From "send the whole tree" to "send what changed", and why the first one is fatal

## Why

Step 04's plugin re-serialized its entire tree on every React commit and handed
the result to `updateTree`. That is correct, and it is fine exactly as long as
the plugin and the host share a JS heap — which is the one runtime Uniview does
*not* optimise for. In a Worker the tree is structured-cloned per commit; over a
socket it is `JSON.stringify`d per commit; on an AppKit host it is decoded and
the entire view tree is rebuilt per commit. The run below measures it: a
one-character edit inside a 400-row list ships **172 245 bytes** in full mode
and **460 bytes** as mutations. `BACKLOG.md` names the consumer this is for in
its first paragraph — "kunkun (the critical consumer) uses **worker mode +
incremental (mutation) update mode** — P0 items all hit that exact path".

## Why this approach, and not the obvious alternative

The obvious alternative is **keep sending the whole tree and let the host
work out what changed**. It is genuinely tempting: the plugin side stays as
simple as step 04, the wire format stays one shape, and hosts already keep an
indexed tree (step 02) so a diff has somewhere to write its results.

It fails on two counts, and both are about the *narrowest* member of the fan-out
rather than about elegance.

*Cost.* The payload is unchanged — the 172 245 bytes still cross the boundary
per keystroke. A host-side diff saves the re-render, not the serialization, the
clone, or the parse. The measurement in section 6 is of the transport, and the
transport is the part that scales with the size of the UI rather than with the
size of the change.

*Duplication of a subtle algorithm.* Every host would need the diff: Svelte,
Vue, React, the terminal grid, and `packages/UniviewAppKit` in Swift. `CLAUDE.md`
budgets a renderer at "small enough to reimplement per platform in about a week",
and a keyed-list diff that agrees byte-for-byte with React's reconciliation in
five languages is not in that budget. Worse, the plugin *already knows*. React's
reconciler exists to compute exactly this, and it announces its conclusions one
host-config callback at a time. `MutationCollector` does not diff anything; it
writes down the calls React was going to make anyway. The information is free at
the source and expensive everywhere else.

What the choice costs is the subject of sections 5, 7 and 8 of the run: the host
stops holding *the* tree and starts holding a **replica**, correct only if every
batch arrives, in order, and is applied to the state the plugin assumed. Section
7 drops one batch and shows that nothing detects it — no host error, no plugin
failure, just permanently wrong text. `syncTree()` exists for that, and its doc
comment in the protocol says so in as many words: "Used for recovery from drift
or explicit sync request".

## What changed since step 04

Step 04's serializer, registry, host config and printing style are carried
forward unchanged unless listed here.

- **`MutationCollector` is new** — `beginCommit` / `serializeSubtree` /
  `cleanupHandlers` / `collectAppendChild` / `collectInsertBefore` /
  `collectRemoveChild` / `collectSetProps` / `collectSetText` /
  `collectSetRoot` / `flushCommit`, copied from the real class.
- **The host config grew one line per callback.** Diff it against step 04's:
  the structure is identical, and `appendChild`, `insertBefore`, `removeChild`,
  `commitUpdate`, `commitTextUpdate`, `appendChildToContainer`,
  `removeChildFromContainer` and `clearContainer` each gained a single
  `activeContainer?.mutationCollector?.collectX(...)`. `prepareForCommit` and
  `resetAfterCommit` stopped being no-ops: they are the commit bracket that
  turns "a stream of callbacks" into "one batch per commit".
- **`removeChild` now releases handlers.** Step 04's copy carried a comment
  where the release should be, explaining that full mode's sweep did the job
  instead. That comment is now `collectRemoveChild` → `cleanupHandlers` →
  `releaseNode`, recursive over the removed subtree.
- **`HandlerRegistry` gained `clear()`** — the real class always had it; step 04
  did not need it. Section 8 shows why incremental mode does.
- **The bridge became the real `RenderBridge`**: `subscribers` /
  `mutationSubscribers` / `subscribe` / `subscribeMutations` / `update` /
  `mutationCollector`, instead of step 04's one-field object.
- **The host from step 02 is back, and connected.** `MutableTree` is copied in
  and fed the plugin's real emitted mutations. Every update is asserted with a
  deep-equality check against the plugin's own tree.
- **The component is a keyed list, and its rows are `memo`ised.** Step 04's
  counter had nothing to be incremental about. `memo` is load-bearing rather
  than decorative — section 6 runs the same edit without it.
- **Events are almost absent.** Step 04 was about the event round trip; here a
  handler is fired exactly once, to show that a released id is a benign miss.

Unchanged, and worth noticing: `serializeProps` and the handler-id format are
untouched. Mutations carry the same serialized props full mode carried, so a
host cannot tell which mode produced its tree.

## How Uniview really does it

The commit bracket. Everything between these two calls is one batch, which is
why a host never sees half a React commit — and note that full-mode subscribers
are notified in *both* modes, because the bridge does not know which mode is in
use:

```typescript
  prepareForCommit(container: Container): null {
    activeContainer = container;
    container.mutationCollector?.beginCommit();
    return null;
  },

  resetAfterCommit(container: Container): void {
    // Flush mutations if collector is active
    if (container.mutationCollector) {
      const mutations = container.mutationCollector.flushCommit();
      if (mutations.length > 0) {
        container.mutationSubscribers.forEach((cb) => void cb(mutations));
      }
    }
    // Always notify full-mode subscribers
    container.update();
    activeContainer = null;
  },
```

[packages/react-renderer/src/reconciler/host-config.ts:83](../../packages/react-renderer/src/reconciler/host-config.ts#L83)
(lines 83-100)

The release mechanism that only exists in this mode. In full mode nothing calls
this, because `serializeTree`'s sweep infers the same fact from a whole-tree
walk; in incremental mode no such walk happens, so the removal is the only
moment the information exists:

```typescript
	/**
	 * Clean up handlers for a removed subtree.
	 * Recursively releases every handler id owned by the removed nodes.
	 */
	private cleanupHandlers(node: InternalNode | TextNode): void {
		if (isTextNode(node)) {
			return;
		}

		this.handlerRegistry.releaseNode(node.id);

		for (const child of node.children) {
			this.cleanupHandlers(child);
		}
	}
```

[packages/react-renderer/src/mutation/mutation-collector.ts:85](../../packages/react-renderer/src/mutation/mutation-collector.ts#L85)
(lines 85-99; the call site is `collectRemoveChild`, lines 212-224)

And the fork itself, which is four lines of wiring in the runtime — attach a
collector to the bridge, and forward its batches instead of trees:

```typescript
      if (mode === "incremental") {
        // Set up mutation collection
        mutationCollector = new MutationCollector(handlerRegistry);
        bridge.mutationCollector = mutationCollector;

        bridge.subscribeMutations((mutations: Mutation[]) => {
          if (!rpc) return;
          trackStats(mutations);
          rpc.getAPI().applyMutations(mutations);
        });
```

[packages/react-runtime/src/runtime.ts:150](../../packages/react-runtime/src/runtime.ts#L150)
(lines 150-159; the `else` branch is step 04's `serializeTree` + `updateTree`)

## What this step leaves out

- **Suspense.** The real collector has `collectHide` / `collectUnhide` /
  `nextVisibleSibling`, `serializeSubtree` returns `null` for `node.hidden`, and
  `collectInsertBefore` re-resolves an anchor that is hidden on the host to the
  next visible sibling (falling back to an append). A hide is emitted as a
  `removeChild` whose handlers are deliberately *not* released, because the node
  is still mounted — the one case where "left the host tree" and "is gone" come
  apart. This step's `InternalNode` has no `hidden` field at all.
  [packages/react-renderer/src/mutation/mutation-collector.ts:52](../../packages/react-renderer/src/mutation/mutation-collector.ts#L52),
  [packages/react-renderer/src/mutation/mutation-collector.ts:169](../../packages/react-renderer/src/mutation/mutation-collector.ts#L169)
- **The single-root guard and the diverged-anchor report.** Real
  `appendChildToContainer` throws when a second root is attached ("wrap top-level
  siblings … in one parent element"), and real `insertBefore` `console.error`s
  before falling back to an append. This step keeps the fallback and drops the
  messages.
  [packages/react-renderer/src/reconciler/host-config.ts:147](../../packages/react-renderer/src/reconciler/host-config.ts#L147),
  [packages/react-renderer/src/reconciler/host-config.ts:188](../../packages/react-renderer/src/reconciler/host-config.ts#L188)
- **The transport, and validating what comes off it.** `bridge.subscribeMutations`
  here calls `MutableTree` directly. In production it is the `applyMutations`
  RPC, and the receiving controller can be constructed with `validate: true`,
  which runs each incoming batch through `MutationSchema` / `validateMutations`
  before touching the tree — because a mutation batch is untrusted input from
  another process. Steps 13-15.
  [packages/protocol/src/validators.ts:71](../../packages/protocol/src/validators.ts#L71),
  [packages/host-sdk/src/controllers/worker.ts:53](../../packages/host-sdk/src/controllers/worker.ts#L53)
- **`syncTree` as an RPC.** Section 7 calls `serializeTree` and `hostTree.init`
  in-process. The real one is a `HostToPluginAPI` method the *host* invokes; the
  worker controller awaits `api.syncTree()`, and the plugin answers with an
  `updateTree` going the other way.
  [packages/protocol/src/rpc.ts:54](../../packages/protocol/src/rpc.ts#L54),
  [packages/host-sdk/src/controllers/worker.ts:134](../../packages/host-sdk/src/controllers/worker.ts#L134)
- **The main-thread controller's full-tree backstop.** In `incremental` mode
  `createMainController` subscribes to *both* channels: mutations feed
  `MutableTree`, and then the plain `subscribe` callback re-serializes the whole
  tree and calls `mutableTree.init(tree)` anyway. On the main thread that
  costs nothing but a walk and makes drift impossible; `createPluginRuntime`
  (worker/socket) deliberately does not do it, and `BACKLOG.md` records removing
  the equivalent backstop from the Solid runtime. This step models the runtime's
  behaviour, not the main controller's. Step 12.
  [packages/host-sdk/src/controllers/main.ts:48](../../packages/host-sdk/src/controllers/main.ts#L48)
- **Teardown beyond `clear()`.** Section 8 calls `registry.clear()` by hand. The
  real `resetRuntimeState()` also unmounts the React root first, so effect
  cleanups run before the registry is dropped.
  [packages/react-runtime/src/runtime.ts:90](../../packages/react-runtime/src/runtime.ts#L90)
- **The second collector.** `packages/solid-renderer` has its own
  `MutationCollector` with the same `cleanupHandlers`/`releaseNode` pair, because
  a renderer package may not depend on another renderer package. Step 06.
  [packages/solid-renderer/src/mutation/mutation-collector.ts:93](../../packages/solid-renderer/src/mutation/mutation-collector.ts#L93)
- **Measurement in production.** `bytesSent` / `messagesSent` exist behind the
  runtime's `debug` option and cost an extra `JSON.stringify` per update; this
  step measures freely because nothing here is on a hot path.
  [packages/react-runtime/src/runtime.ts:84](../../packages/react-runtime/src/runtime.ts#L84)
- **Teaching apparatus that is not in the real code:** the `leakyRegistry`
  mirror inside `MutationCollector`, the throwaway registry used to serialize a
  reference tree without disturbing the live one, and `measureOneEdit`'s
  disposable containers.

## Trade-offs

- **The payload becomes proportional to the change instead of the UI — but only
  as proportional as the plugin's own reconciliation.** With `memo`ed rows a
  400-row list emits 6 mutations for a one-row edit (460 B, 374x smaller than the
  tree). Without `memo` the same edit emits 1 203 mutations and 101 193 B — a
  1.7x saving that does not improve with size, because React 19 marks a host
  fiber for update whenever its props *object* changes identity. Incremental
  mode does not make a plugin efficient; it makes the plugin's re-render
  behaviour visible on the wire.
- **Mount gets slightly worse.** The first commit is a `setRoot` carrying the
  whole tree wrapped in an array, preceded by a `setRoot node=null` from React
  clearing the container — 2 768 B against full mode's 2 709 B, a 0.98x "saving".
  Everything after that is the win.
- **The host's tree becomes a replica, and replicas drift silently.** One dropped
  batch and the host is permanently wrong, with no error on either side; every
  later batch applies cleanly onto the wrong state. That is the entire reason
  `syncTree()` and the full-tree path still exist, and the reason the
  main-thread controller keeps a backstop it does not strictly need.
- **Handler lifetime now needs three mechanisms instead of one.** The sweep for
  full mode, `releaseNode` at the removal site for incremental mode, and
  `clear()` for teardown — because tearing down the root is not a `removeChild`,
  so the run below finishes with 6 live handlers after unmount until `clear()` is
  called. Step 04 needed only the first, and each of the three is invisible in a
  diff when it is missing: everything still works, correctly, while leaking.
- **`setProps` sends all props even when none of them changed.** Five of the six
  mutations in the run's simplest edit are `setProps` whose serialized output is
  byte-identical to what the host already has. Comparing before emitting would
  need the previous serialization kept per node — memory against bytes, and the
  real collector chooses bytes.

## Run it

```
pnpm tsx steps/05-incremental-mutations/main.ts
```

Real captured output, **trimmed**: the mounted tree in section 1 (33 nodes) is
cut to its first rows, and the explanatory prose after each section is elided
(marked `[...]`). Numbers, mutation dumps and PASS/FAIL lines are verbatim.

```
=== 1. Mount: the first commit is still a whole tree ===

  --- mount (6 rows) ---
  2 mutation(s) emitted by the commit:
      setRoot       node=null
      setRoot       node=<column#node-19> (33 nodes, 2709 B)
  incremental payload :   2768 B   (applyMutations)
  full-tree payload   :   2709 B   (updateTree — what step 04 would have sent)
  ratio               : 0.98x smaller

  the host's tree, built from those two mutations:
  <column#node-19 gap=8 padding=16>
    <heading#node-0 level=2>
      #text#text-0 "Open tickets"
    <row#node-3 gap=4 align="center">
      <label#node-1 id="r1">
        #text#text-1 "#101 Crash on paste"
      <button#node-2 title="dismiss r1" _onClickHandlerId="node-2:onClick">
        #text#text-2 "x"
    [... five more rows ...]
  [PASS] host tree === plugin tree  (after mount)
  [...]
```

Then the three updates. Note that the host is fed nothing but the mutation
arrays printed here, and is compared against the plugin's own tree after each
one:

```
=== 2. Update A: one row's label changes ===

  --- edit row r3's label ---
  6 mutation(s) emitted by the commit:
      setProps      node-0 {"level":2}
      setText       text-5 = "#103 Export hangs at 90% (reopened)"
      setProps      node-7 {"id":"r3"}
      setProps      node-8 {"title":"dismiss r3","_onClickHandlerId":"node-8:onClick"}
      setProps      node-9 {"gap":4,"align":"center"}
      setProps      node-19 {"gap":8,"padding":16}
  incremental payload :    448 B   (applyMutations)
  full-tree payload   :   2720 B   (updateTree — what step 04 would have sent)
  ratio               : 6.07x smaller
  [PASS] host tree === plugin tree  (after the edit)
  [...]

=== 3. Update B: a row is inserted in the middle ===

  --- insert r99 before r4 ---
  3 mutation(s) emitted by the commit:
      setProps      node-0 {"level":2}
      insertBefore  parent=node-19 before=node-12 node=<row#node-22> (5 nodes)
      setProps      node-19 {"gap":8,"padding":16}
  incremental payload :    631 B   (applyMutations)
  full-tree payload   :   3149 B   (updateTree — what step 04 would have sent)
  ratio               : 4.99x smaller
  [PASS] host tree === plugin tree  (after the insert)
  [...]
```

Removal is where the handler registry stops being able to infer anything:

```
=== 4. Update C: a row is removed, and its handlers with it ===
  handler ids in the tree before: 7
  registry.size before:           7

  --- remove row r5 ---
  3 mutation(s) emitted by the commit:
      removeChild   parent=node-19 node=node-15
      setProps      node-0 {"level":2}
      setProps      node-19 {"gap":8,"padding":16}
  incremental payload :    192 B   (applyMutations)
  full-tree payload   :   2722 B   (updateTree — what step 04 would have sent)
  ratio               : 14.18x smaller
  [PASS] host tree === plugin tree  (after the removal)

  handler ids that left the tree: node-14:onClick
    registry.has("node-14:onClick")       = false   <- released by cleanupHandlers
    leakyRegistry.has("node-14:onClick")  = true   <- the same mode without that call
  registry.size after:       6
  leakyRegistry.size after:  7

  a click that arrives for the removed row — the normal host/plugin race:
      [plugin] executeHandler: no handler registered for "node-14:onClick" (node unmounted or event arrived after removal)

=== 5. Two modes, two release mechanisms, both necessary ===
  live registry (incremental, releaseNode on removeChild): 6
  same registry with cleanupHandlers removed:              7
  [...]
  now run FULL mode's mechanism over the leaky registry — one serializeTree:
  leakyRegistry.size after the sweep: 6   (walked 33 nodes to learn what one removeChild already knew)
  [...]
```

The scaling table — step 01 printed this shape from a hand-written tree and
called it a hypothetical; every number below comes from mutations React actually
emitted:

```
=== 6. The same edit, in lists of four sizes ===

  (a) with `memo`ed rows — the batch is bounded by what changed:
      rows   mutations   incremental      full tree     ratio
         5           6         444 B        2319 B      5.2x
        25           6         442 B       10729 B     24.3x
       100           6         453 B       42815 B     94.5x
       400           6         460 B      172245 B    374.4x

  (b) the same edit without `memo` — every re-rendered node emits setProps:
      rows   mutations   incremental      full tree     ratio
         5          18        1454 B        2385 B      1.6x
        25          78        6461 B       11013 B      1.7x
       100         303       25293 B       43441 B      1.7x
       400        1203      101193 B      173741 B      1.7x
  [...]
```

Then the failure mode the whole design has to avoid, on purpose, and the way
back out of it:

```
=== 7. Drift: what happens when a batch does not arrive ===
  batches delivered so far: 4, commits: 4
      [transport] DROPPED a batch of 6 mutations
  the dropped batch was: setProps, setText, setProps, setProps, setProps, setProps
  [FAIL] host tree === plugin tree  (immediately after the dropped batch)   <- EXPECTED: this is the drift being demonstrated

  plugin says text-1 = "#101 Crash on paste [P0]"
  host says   text-1 = "#101 Crash on paste"

  the next batch is delivered normally — does that heal it?
  delivered: setProps, setText, setProps, setProps, setProps, setProps
  [FAIL] host tree === plugin tree  (after a further, correctly delivered batch)   <- EXPECTED: this is the drift being demonstrated
  [...]
  the way back — syncTree(): re-serialize everything and re-seed the host
  plugin -> host: updateTree(2736 B, 33 nodes)
  [PASS] host tree === plugin tree  (after syncTree())
  [...]

=== 8. Unmount: the one release incremental mode cannot infer ===
  mutations: setRoot       node=null
  host tree: null
  [PASS] host tree === plugin tree  (after unmount)

  registry.size after unmount: 6   <- every handler still live
  [...]
  registry.clear() -> 0. [...]

=== 9. What this step bought ===
  sync checks: 6/8 PASS (2 deliberate failures in section 7)
  host-side errors logged: 0
  commits: 7, batches delivered: 6
  [...]
```

Six of eight sync checks pass and the two failures are the drift demonstration;
the host logged no errors at any point, including while it was wrong.

## Sources

- [packages/react-renderer/src/mutation/mutation-collector.ts](../../packages/react-renderer/src/mutation/mutation-collector.ts) —
  the whole class: `beginCommit` / `flushCommit`, `serializeSubtree`,
  `cleanupHandlers`, the six `collectX` methods, and the Suspense
  hide/unhide/anchor handling this step leaves out
- [packages/react-renderer/src/reconciler/host-config.ts](../../packages/react-renderer/src/reconciler/host-config.ts) —
  where mutations are collected from: the commit bracket, `activeContainer`, the
  one collector call per callback, the single-root guard, and the comment on
  `appendInitialChild` explaining why the render phase emits nothing
- [packages/react-renderer/src/reconciler/bridge.ts](../../packages/react-renderer/src/reconciler/bridge.ts) —
  `RenderBridge` with its two subscriber sets, and `mutationCollector` as the
  switch between modes
- [packages/react-renderer/src/serialization/serialize.ts](../../packages/react-renderer/src/serialization/serialize.ts) —
  `serializeTree` and the `beginSweep`/`endSweep` bracket that incremental mode
  no longer runs per commit
- [packages/react-renderer/src/serialization/handler-registry.ts](../../packages/react-renderer/src/serialization/handler-registry.ts) —
  `releaseNode`, the sweep, and `clear()`; three release mechanisms for three
  situations
- [packages/react-renderer/src/serialization/serialize-props.ts](../../packages/react-renderer/src/serialization/serialize-props.ts) —
  unchanged since step 04, and shared by both modes, which is why a host cannot
  tell them apart
- [packages/react-runtime/src/runtime.ts](../../packages/react-runtime/src/runtime.ts) —
  the `mode === "incremental"` fork, `syncTree`, `resetRuntimeState`, and the
  `debug`-gated byte counters
- [packages/host-sdk/src/controllers/main.ts](../../packages/host-sdk/src/controllers/main.ts) —
  the main-thread controller, and its full-tree backstop in incremental mode
- [packages/host-sdk/src/controllers/worker.ts](../../packages/host-sdk/src/controllers/worker.ts) —
  `applyMutations` with optional validation, and `syncTree` as an RPC
- [packages/protocol/src/rpc.ts](../../packages/protocol/src/rpc.ts) —
  `applyMutations` / `updateTree` on `PluginToHostAPI`, and `syncTree`'s
  "recovery from drift" doc comment
- [packages/protocol/src/validators.ts](../../packages/protocol/src/validators.ts) —
  `MutationSchema` / `MutationsSchema` / `validateMutations`
- [packages/solid-renderer/src/mutation/mutation-collector.ts](../../packages/solid-renderer/src/mutation/mutation-collector.ts) —
  the same collector for a renderer with no commit phase (step 06)
- [CLAUDE.md](../../CLAUDE.md) — the prime directive, and "small enough to
  reimplement per platform in about a week" as the budget a host-side diff would
  have blown
- [BACKLOG.md](../../BACKLOG.md) — "kunkun … uses **worker mode + incremental
  (mutation) update mode**", and the removal of the Solid runtime's full-tree
  backstop
- [learn/steps/04-serializing-the-tree/main.ts](../steps/04-serializing-the-tree/main.ts) —
  the serializer, `HandlerRegistry`, host config and printing style this step
  extends
- [learn/steps/02-mutable-tree/main.ts](../steps/02-mutable-tree/main.ts) —
  `MutableTree`, the host-side applier that consumes what this step emits
- [learn/steps/01-protocol/main.ts](../steps/01-protocol/main.ts) —
  the six `Mutation` kinds, and the whole-tree-vs-mutations byte comparison this
  step turns from a hypothetical into a measurement
