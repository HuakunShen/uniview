# 03. React's reconciler/renderer split, and the minimum `HostConfig` that satisfies it

## Why

Steps 01 and 02 wrote `UINode`s and `Mutation`s by hand. Nobody authors a UI that
way — the whole point of Uniview is that a plugin author writes React (or Solid)
and the tree falls out. The question this step answers is *how a UI framework can
be made to emit that tree without knowing anything about it*, and the answer is
not "we patched React". React has always been two packages: `react-reconciler`,
which decides **what** changed, and a host config, which knows **how** to make it
real. `react-dom` is not React — it is one host config whose `createInstance`
calls `document.createElement`. Uniview's `packages/react-renderer` is another,
whose `createInstance` returns a plain object with an id. That is what the
`CLAUDE.md` prime directive requires: "a new plugin-side framework is a new
renderer package and *zero* changes anywhere else." If the seam were anywhere
else — inside React, or inside the protocol — that sentence would be false.

## Why this approach, and not the obvious alternative

The obvious alternative is to leave React alone and post-process its output. Three
versions of that idea, and what each specifically cannot do:

**Render to a string and parse it** (`renderToString`, or Solid's SSR). It runs
once and produces bytes. There is no second render: `useState` has no way to
schedule an update, `useEffect` never fires (React explicitly does not run
passive effects on the server), and Suspense resolves to fallback HTML rather
than to a live boundary. Uniview's whole product is a *live* plugin UI, so a
one-shot snapshot is not a smaller version of the answer — it is a different
thing.

**Use `react-dom` and scrape the DOM** (render into a detached node, walk it into
`UINode`s). It needs a DOM: `jsdom` in Node, and nothing at all in a Web Worker,
where `document` does not exist — which kills runtime ② before it starts (step
13). It also forces every plugin's vocabulary through HTML: `<column>` becomes an
unknown element with `gap="8"` stringified onto an attribute, and the numbers,
booleans and nested objects that `props: Record<string, JSONValue>` promises are
gone by the time you read them back. And you still have no idea *what changed* —
you would diff two DOM snapshots to recover information React already computed
and threw away.

**Walk the element tree yourself** (recursively call component functions, read
`element.props.children`). This is the one that looks closest to working, and it
is a reimplementation of the reconciler: hooks (`useState` must persist across
calls, keyed to a call position), the fiber tree, keys and reorder detection,
lanes and priorities, `useEffect` scheduling, error boundaries, Suspense. React
has been building that for ten years. Uniview's answer is to write ~25 callbacks
instead and get all of it for free — which is exactly why the real host config
file is 316 lines, and why the interesting parts of it are comments about move
semantics rather than algorithms.

The cost is version coupling, and this repo pays it visibly. `react-reconciler`'s
own README opens with "This is an experimental package for creating custom React
renderers" and "**Its API is not as stable as that of React, React Native, or
React DOM, and does not follow the common versioning scheme.**" See the
`flushSyncFromReconciler` snippet below — the runtime and its published types
disagree about a method name, and the real renderer keeps a hand-written
interface to bridge them.

## What changed since step 02

Steps 01 and 02 were data and data-application: 01 defined `UINode` + the six
`Mutation` kinds and hand-wrote two trees; 02 applied mutations to a host-side
tree. In both, a human typed the tree.

Step 03 replaces the human. Concretely, versus step 01's `main.ts`:

- `treeV1` and `treeV2` are gone. The identical two trees are now *produced* by a
  React component with `useState` and `useEffect`, and the printed output is the
  same shape — `column` with `gap: 8, padding: 16`, a text child, a `button` whose
  `disabled` flips, and a trailing text node that appears after the update.
- A second tree type appears: `InternalNode` / `TextNode`, the *live* tree the
  reconciler mutates in place (with a `parent` back-pointer). `UINode` is now a
  serialized snapshot taken from it, not the thing React touches. That split is
  new here and permanent.
- `id` is no longer typed by hand. `createInstance` mints `node-0`, `node-1`, …
  and `createTextInstance` mints `text-0`, `text-1`, … exactly as the real
  renderer does, and the printed trees show those ids surviving the update
  unchanged — which is what step 01 claimed ids were *for*.
- Nothing yet emits `Mutation`s. Step 03 still serializes the whole tree after
  each commit. Turning `commitTextUpdate` into `setText` is step 05.

## How Uniview really does it

The seam, in the type system. Fourteen generic parameters is how React learns a
vocabulary it has no built-in knowledge of — `Instance` is whatever you say it
is, and from then on React only ever hands your own objects back to you:

```typescript
export const hostConfig: HostConfig<
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
```

[packages/react-renderer/src/reconciler/host-config.ts:51](../../packages/react-renderer/src/reconciler/host-config.ts#L51)
(lines 51-69)

And the callback that is the entire difference between `react-dom` and this
renderer. Where react-dom calls `document.createElement(type)`, Uniview returns a
plain object. React never inspects the return value:

```typescript
  createInstance(
    type: Type,
    props: Props,
    _rootContainer: Container,
    _hostContext: HostContext,
  ): Instance {
    return {
      type,
      props: { ...props },
      children: [],
      id: generateId(),
      parent: null,
    };
  },
```

[packages/react-renderer/src/reconciler/host-config.ts:102](../../packages/react-renderer/src/reconciler/host-config.ts#L102)
(lines 102-115)

The price of building on an unstable internal API, made narrow and explicit — the
pinned runtime and its published types disagree about a method name:

```typescript
interface SynchronousReconciler {
  flushSyncFromReconciler<Result>(callback: () => Result): Result;
  flushPassiveEffects(): boolean;
  isAlreadyRendering(): boolean;
}

// react-reconciler 0.33 exposes this runtime API while the matching Definitely
// Typed declaration still calls it `flushSync`. Keep the compatibility seam
// narrow and typed until the upstream declaration catches up.
const synchronousReconciler: SynchronousReconciler =
  reconciler as typeof reconciler & SynchronousReconciler;
```

[packages/react-renderer/src/reconciler/renderer.ts:9](../../packages/react-renderer/src/reconciler/renderer.ts#L9)
(lines 9-19). `learn/package.json` pins `react-reconciler@^0.33.0` against
`@types/react-reconciler@^0.32.0`, so this step reproduces the same seam
verbatim — including `flushPassiveEffects()`, which a script that exits
immediately needs in order to see `useEffect` run at all.

## What this step leaves out

- **Mutation collection.** Every tree-shaping callback in the real config also
  calls a `mutationCollector` (`collectSetRoot`, `collectAppendChild`,
  `collectSetProps`, `collectSetText`, …), and `prepareForCommit` /
  `resetAfterCommit` open and flush the batch. This step serializes the whole
  tree after each commit instead — the "obvious alternative" step 01 measured at
  124.8x. Step 05 fixes it.
  [packages/react-renderer/src/reconciler/host-config.ts:83](../../packages/react-renderer/src/reconciler/host-config.ts#L83)
- **Prop serialization.** This step's `ownProps()` drops `children` / `key` /
  `ref` and any function. The real `serializeProps` converts `on[A-Z]*` function
  props into `_onClickHandlerId` strings backed by a `HandlerRegistry`, warns
  once per prop name about functions nested inside object props (the
  `actions={[{...}]}` trap), preserves `null` while dropping `undefined`, and
  attaches the resolved Style IR as `_style`. Steps 13, 15 and 16.
  [packages/react-renderer/src/serialization/serialize-props.ts:34](../../packages/react-renderer/src/serialization/serialize-props.ts#L34)
- **Move semantics under real pressure.** This step copies `detachFromParent` and
  the "detach first, *then* resolve the anchor index" ordering, because both are
  load-bearing — but never exercises a reorder. The real config also logs a
  diagnostic and degrades to `appendChild` when an `insertBefore` anchor is
  missing, meaning the internal tree has already diverged from React's view.
  [packages/react-renderer/src/reconciler/host-config.ts:173](../../packages/react-renderer/src/reconciler/host-config.ts#L173)
- **Suspense visibility.** `hideInstance` / `unhideInstance` /
  `hideTextInstance` / `unhideTextInstance` are no-ops here. In production they
  set a `hidden` flag that excludes the node from serialization and emits
  remove/insert mutations so hosts converge while a fallback is showing.
  [packages/react-renderer/src/reconciler/host-config.ts:257](../../packages/react-renderer/src/reconciler/host-config.ts#L257)
- **Unmounting, and re-entrancy.** There is no teardown here at all. The real
  `unmount()` refuses to run while React is rendering or committing (throwing a
  typed `ReactReentrantUnmountError` so the caller can retry outside React
  work), flushes a `null` update synchronously, then flushes passive effects so
  every `useEffect` cleanup actually runs. Without it, `destroy()` dropped
  references while timers and subscriptions inside the plugin kept firing
  forever.
  [packages/react-renderer/src/reconciler/renderer.ts:92](../../packages/react-renderer/src/reconciler/renderer.ts#L92)
- **Error reporting.** `createContainer` here is handed `console.error` four
  times. The real renderer routes uncaught render/commit errors to the bridge's
  `onError`, which the runtimes wire to the host's `reportError` RPC — otherwise
  a plugin crash dies silently in a worker console the user cannot see.
  [packages/react-renderer/src/reconciler/renderer.ts:62](../../packages/react-renderer/src/reconciler/renderer.ts#L62)
- **The single-root rule, enforced.** `appendChildToContainer` here just
  overwrites the root. The real one throws a readable error, because silently
  overwriting used to drop every top-level sibling but the last; and
  `insertInContainerBefore` exists purely so React fails with that message
  instead of a bare `TypeError`.
  [packages/react-renderer/src/reconciler/host-config.ts:147](../../packages/react-renderer/src/reconciler/host-config.ts#L147)
- **The instrumentation itself.** `trace()`, `tick()` and the wrapper that
  counts every non-traced callback are teaching apparatus. No production
  renderer wraps its own host config.

## Trade-offs

- **You inherit React's entire runtime for ~25 callbacks.** Hooks, keys,
  priorities, Suspense and error boundaries all work against a host that is a
  plain JavaScript object — the run below shows `useState` and `useEffect`
  firing with no DOM in the process. The cost is that you inherit React's
  *timing* too: `useEffect` is scheduled, not run, by the commit, so a script
  that exits immediately must call `flushPassiveEffects()` by hand.
- **`react-reconciler` is an unstable internal API, and you are pinned to it.**
  0.33's runtime and `@types/react-reconciler@0.32.3` disagree about
  `flushSync` / `flushSyncFromReconciler`, so both this step and the real
  renderer carry a hand-written `SynchronousReconciler` interface. A minor bump
  can add a required callback; see the next bullet for what that feels like.
- **The `HostConfig<...>` annotation is the only thing standing between you and
  a runtime crash.** `react-reconciler@0.33` requires `trackSchedulerEvent`,
  `resolveEventType` and `resolveEventTimeStamp`. Omit `resolveEventTimeStamp`
  from a config written as a bare object literal or an `as never` cast — which
  is what most examples, and `steps/00-scaffold-probe/main.ts`, do — and nothing
  fails at type-check. It dies on the first `updateContainer` with
  `TypeError: resolveEventTimeStamp is not a function`, thrown from
  `startUpdateTimerByLane` deep inside React's scheduler. (Verified by deleting
  the line and re-running this step.) Writing the full 14-parameter annotation
  is tedious and converts that class of bug into a compile error.
- **The reconciler decides, the host obeys — including when the host would have
  decided otherwise.** Line 6 of the update trace is a `commitUpdate` on
  `<column>` whose props are byte-identical before and after; React marks a host
  fiber for update when its *children* changed and does not promise the props
  differ. A host that re-serializes on every `commitUpdate` does redundant work,
  and can only avoid it by comparing on its own side.
- **Two tree representations, forever.** The mutable `InternalNode` (with parent
  pointers and live child references) and the JSON-safe `UINode` snapshot are
  different types, and something must convert between them on every commit. The
  payoff is that React gets a tree it can mutate cheaply while the wire gets a
  tree that survives structured clone, `JSON.stringify` and a Swift decoder.

## Run it

```
pnpm tsx steps/03-what-is-a-custom-renderer/main.ts
```

Real captured output, **trimmed**. Elided: the three-line header, section 3's
five explanatory bullets, and the 27-name list of callbacks that were never
called. Everything below is verbatim, including the bookkeeping-count lines.

```
=== 1. Initial mount: React drives the host config ===
   1. [render] createTextInstance       "Clicked 0 times" -> #text-0
   2. [render] createTextInstance       "Click me" -> #text-1
   3. [render] createInstance           button -> #node-0 {"disabled":true}
   4. [render] appendInitialChild       #text#text-1 "Click me" -> <button>#node-0
   5. [render] createInstance           column -> #node-1 {"gap":8,"padding":16}
   6. [render] appendInitialChild       #text#text-0 "Clicked 0 times" -> <column>#node-1
   7. [render] appendInitialChild       <button>#node-0 -> <column>#node-1
   8. [commit] prepareForCommit         --- commit phase begins ---
   9. [commit] clearContainer           root := null
  10. [commit] appendChildToContainer   <column>#node-1 -> container
  11. [commit] resetAfterCommit         --- commit phase ends ---
      >> useEffect ran, count=0

  serialized UINode tree:
  <column#node-1 gap=8 padding=16>
    #text#text-0 "Clicked 0 times"
    <button#node-0 disabled=true>
      #text#text-1 "Click me"
```

Read the phase tags: every node was *created* during the render phase, on a
subtree nothing could observe, and the finished root was attached in a single
`appendChildToContainer` inside the commit. That is why `appendInitialChild` and
`appendChild` are two callbacks doing the same array push.

Then one `setState`:

```
=== 2. One setState: the update path ===
  (the same component re-renders; watch what is NOT re-created)
   1. [render] createTextInstance       "last click: just now" -> #text-2
   2. [commit] prepareForCommit         --- commit phase begins ---
   3. [commit] commitTextUpdate         #text-0 "Clicked 0 times" -> "Clicked 1 times"
   4. [commit] commitUpdate             <button>#node-0 {"disabled":true} -> {"disabled":false}
   5. [commit] appendChild              #text#text-2 "last click: just now" -> <column>#node-1
   6. [commit] commitUpdate             <column>#node-1 {"gap":8,"padding":16} -> {"gap":8,"padding":16}
   7. [commit] resetAfterCommit         --- commit phase ends ---
      >> useEffect ran, count=1

  serialized UINode tree:
  <column#node-1 gap=8 padding=16>
    #text#text-0 "Clicked 1 times"
    <button#node-0 disabled=false>
      #text#text-1 "Click me"
    #text#text-2 "last click: just now"
```

Exactly one node was created. `#text-0`, `#node-0`, `#text-1` and `#node-1` kept
their ids across the update — the property step 01 said the whole incremental
scheme depends on. The host was told `commitTextUpdate`, `commitUpdate`,
`appendChild`; it diffed nothing.

For scale, the counted bookkeeping the trace suppresses — verbatim from the
mount:

```
      (plus setCurrentUpdatePriorityx10 getCurrentUpdatePriorityx5 getChildHostContextx2 shouldSetTextContentx2 finalizeInitialChildrenx2 resolveUpdatePriorityx1 resolveEventTimeStampx1 resolveEventTypex1 getRootHostContextx1 — bookkeeping, no tree change)
```

Note `resolveEventTimeStampx1`: it is called once per update, from React's
scheduler, and is the callback whose absence is fatal at runtime and invisible at
compile time.

## Sources

- [packages/react-renderer/src/reconciler/host-config.ts](../../packages/react-renderer/src/reconciler/host-config.ts) —
  the real `HostConfig`: mutation mode, `createInstance` / `createTextInstance`,
  the `appendInitialChild` vs `appendChild` split and its comment about why no
  mutation is emitted from the former, `detachFromParent` and move semantics,
  the single-root guards, Suspense hide/unhide, and the
  `trackSchedulerEvent` / `resolveEventType` / `resolveEventTimeStamp` trio
- [packages/react-renderer/src/reconciler/renderer.ts](../../packages/react-renderer/src/reconciler/renderer.ts) —
  `ReactReconciler(hostConfig)`, `createContainer` with `ConcurrentRoot`, the
  `flushSyncFromReconciler` typing seam, `unmount()` and
  `ReactReentrantUnmountError`
- [packages/react-renderer/src/reconciler/types.ts](../../packages/react-renderer/src/reconciler/types.ts) —
  `InternalNode` and `TextNode`, the live tree React mutates
- [packages/react-renderer/src/reconciler/bridge.ts](../../packages/react-renderer/src/reconciler/bridge.ts) —
  `RenderBridge`, the container the reconciler appends the root to
- [packages/react-renderer/src/serialization/serialize.ts](../../packages/react-renderer/src/serialization/serialize.ts) —
  `serializeTree`, the `InternalNode` → `UINode` snapshot, deliberately outside
  the host config
- [packages/react-renderer/src/serialization/serialize-props.ts](../../packages/react-renderer/src/serialization/serialize-props.ts) —
  handler ids, the nested-function warning, and the `_style` Style IR prop
- [packages/protocol/src/tree.ts](../../packages/protocol/src/tree.ts) —
  `UINode`, `JSONValue`, `TEXT_NODE_TYPE`, copied forward from step 01
- [CLAUDE.md](../../CLAUDE.md) — the prime directive, and "a new plugin-side
  framework is a new renderer package and *zero* changes anywhere else"
- [learn/steps/00-scaffold-probe/main.ts](../steps/00-scaffold-probe/main.ts) —
  the working minimal 0.33 config this step grew from, and where the
  `resolveEventTimeStamp` trap was first hit
- [learn/steps/01-protocol/main.ts](../steps/01-protocol/main.ts) —
  the `show()` printer and the two trees this step now generates instead of
  typing
