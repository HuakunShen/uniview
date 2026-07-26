# 06. Solid's universal renderer: fine-grained, no VDOM, **identical output**

## Why

Steps 03-05 built a React custom renderer — the reconciler/renderer split, a
`HostConfig` growing a real tree, then a mutation stream — and after three steps
of it, it is easy to conclude that "custom renderer" *means* "an object you hand
to a reconciler, which re-runs your components and diffs". It does not. Solid has no
virtual DOM and no reconciler in that sense at all: it creates real nodes once
and wires fine-grained reactive effects, so a signal write re-runs only the
effects that read that signal and those effects mutate exactly the nodes they
own. This step exists because `CLAUDE.md`'s prime directive stakes the whole
architecture on the protocol being neutral — "A new plugin-side framework is a
new renderer package and *zero* changes anywhere else" — and a neutrality claim
that has only ever been exercised by one framework is not a claim, it is an
assumption. The failure mode this step guards against is a protocol that has
quietly grown React's shape (a commit phase, props-object identity, a "previous
tree" to diff against) without anyone noticing, because nothing else ever tried
to emit into it.

## Why this approach, and not the obvious alternative

**Alternative 1: don't support a second framework at all. Tell plugin authors to
use React.**

The cost is not developer choice; it is that the framework-agnostic claim becomes
untestable. Uniview's bet is that the *renderer* — the thing reimplemented per
platform, "macOS AppKit today; Windows and HarmonyOS next" — has a bounded,
converging primitive set, while an app's UI grows forever. If only one authoring
framework ever produces a `UINode`, then the tree's shape *is* React's shape by
construction, and nobody finds out until a Swift host has already been written
against it. Running a second, structurally opposite renderer into the same
protocol is the only check that can ever honestly fail. `main.ts` is that check,
and §4 of its output is the receipt.

**Alternative 2: support Solid with a compatibility shim over the React
renderer** — keep one renderer package, drive Solid components through
`react-reconciler`.

This is the tempting one, and it is exactly backwards. Solid's model has no
component re-run and no element tree, so a shim would have to manufacture both:
allocate a virtual element tree from Solid's reactive graph on every signal
write, hand it to the reconciler, and let the reconciler diff it — reintroducing
the two things Solid was designed to delete, in order to reach a `HostConfig`
whose 53 members exist to serve a commit model Solid does not have. `main.ts`
runs both renderers in one process and prints the price in the one place it is
measurable. For the identical one-signal update:

```
  solid : 2 primitive calls, component function ran 1 time.
  react : 3 primitive calls, component function ran 2 times.
```

React's three include a `commitUpdate` on `<column>` whose before and after
props stringify identically — a write to a node that did not change, flagged
only because re-running the component allocated a fresh props object. A shim
would give you React's numbers with Solid's syntax: all of the cost, none of the
reason anyone picked Solid.

The deeper objection is architectural. A shim makes framework #2 a permanent
debtor to framework #1: every fix to the React reconciler is a Solid regression
risk, and the protocol can never be *proved* neutral because only one code path
ever writes to it. `CLAUDE.md` chose the other side explicitly:

> **Framework-agnostic.** `@uniview/protocol`, `@uniview/host-sdk` and every
> native host speak `UINode` + `Mutation` + Style IR. They must not know that
> React or Solid or Svelte exists. A new plugin-side framework is a new renderer
> package and *zero* changes anywhere else.

[CLAUDE.md:19](../../CLAUDE.md#L19) (lines 19-22)

The measured cost of honouring that: `packages/solid-renderer/src` is 855 lines
of TypeScript plus a 238-line vendored copy of Solid's universal renderer,
against `packages/react-renderer/src`'s 1058 — a second full renderer, not a
thin adapter. What it buys is that neither `@uniview/protocol` nor any host nor
any native port contains the word "Solid".

## What changed since step 05

Steps 03-05 were all one authoring framework. Step 03 introduced React's
reconciler/renderer split and the minimum `HostConfig`; step 04 turned live host
instances into a JSON-safe `UINode` and established that a function prop becomes
`_${event}HandlerId`; step 05 replaced "resend the whole tree" with a mutation
stream. The `UINode` target and the mutation vocabulary have not moved since
step 01.

What step 06 adds is a **second producer** for that same target, and everything
in the delta follows from Solid's model being the opposite of React's:

- **A different, much smaller host interface.** `RendererOptions` has 10 members
  (11 in Uniview's fork). React's `HostConfig` as implemented in
  `packages/react-renderer` has 53. There is no `prepareForCommit` /
  `resetAfterCommit` pair, no scheduler-priority group, no suspense
  hide/unhide group — because there is no commit phase to bracket.
- **`replaceText` / `setProperty` replace `commitTextUpdate` / `commitUpdate`.**
  Same effect, different provenance: React's arrive *after* a diff, Solid's are
  the first and only thing that happens.
- **Tree navigation is now part of the contract.** `getParentNode`,
  `getFirstChild`, `getNextSibling`. Solid asks the host how to walk its own
  tree instead of keeping a shadow copy — those three primitives are what stand
  in for React's previous fiber tree.
- **The mutation collector moves inside the primitives.** In step 05 mutations
  were gathered during React's commit; here `replaceText` itself calls
  `collectSetText`. There is no other moment to do it in.
- **Step 04's handler-id rule is re-derived from the other side.** Solid's
  serializer arrives at exactly `${nodeId}:${key}` for an `on[A-Z]*` prop —
  independently, in a different package, and `main.ts` checks that both
  renderers emit `_onClickHandlerId`.
- **The step now runs both renderers in one process and diffs their output.**
  That comparison is new, and it is the point.

`main.ts` carries `UINode`, `JSONValue`, `TEXT_NODE_TYPE` and `show()` forward
from step 01 verbatim, as RULES.md requires — steps duplicate rather than
import. It also deliberately reuses **step 03's trace format**
(`  N. [tag   ] callbackName            detail`), its `label()` conventions and
its `show()` variant, so the two files' outputs diff line by line. The only
change is the tag slot: step 03 puts React's `[render]` / `[commit]` phase
there, step 06 puts `[solid ]` / `[react ]`, because Solid has no phases to tag.

## How Uniview really does it

The entire surface a Solid renderer must implement. Eleven members — ten from
upstream `solid-js/universal`, plus `createSlotNode`, which is why Uniview
vendors its own fork of the universal renderer:

```typescript
export interface RendererOptions<Node extends AnyNode> {
	createElement(tagName: string): Node
	createTextNode(value: string | number): Node
	createSlotNode(): Node
	isTextNode(node: Node): boolean
	replaceText(textNode: Node, value: string): void
	insertNode(parent: Node, node: Node, anchor?: Node): void
	removeNode(parent: Node, node: Node): void
	setProperty(node: Node, name: string, value: unknown, prev: unknown): void
	getParentNode(childNode: Node): Node | undefined
	getFirstChild(node: Node): Node | undefined
	getNextSibling(node: Node): Node | undefined
}
```

[packages/solid-renderer/src/renderer/universal.d.ts:3](../../packages/solid-renderer/src/renderer/universal.d.ts#L3)
(lines 3-15). Compare
[packages/react-renderer/src/reconciler/host-config.ts:51](../../packages/react-renderer/src/reconciler/host-config.ts#L51),
whose object literal runs to line 316 and carries 53 members.

The whole fine-grained update path, end to end. A signal write reaches the host
tree through these four lines and nothing else — no parent visited, no sibling
compared, no previous value diffed:

```typescript
function _replaceText(textNode: SolidTextNode, value: string): void {
	textNode.value = value;
	mutationCollector?.collectSetText(textNode);
	scheduleUpdate();
}
```

[packages/solid-renderer/src/renderer/reconciler.ts:101](../../packages/solid-renderer/src/renderer/reconciler.ts#L101).
The eleven primitives are handed to `createRenderer` at
[packages/solid-renderer/src/renderer/reconciler.ts:216](../../packages/solid-renderer/src/renderer/reconciler.ts#L216)
(lines 216-228).

And the payoff — the serializer's return statement, which is where a Solid
internal node becomes a protocol `UINode`. It is field-for-field what the React
renderer produces, because it is the same four fields from step 01:

```typescript
	return {
		type: node.type,
		props: serializeProps(node.props, registry, node.id),
		children: serializedChildren,
		id: node.id,
	};
}
```

[packages/solid-renderer/src/serialization/serialize.ts:70](../../packages/solid-renderer/src/serialization/serialize.ts#L70)

## What this step leaves out

- **`createSlotNode` and everything that needs it.** The real fork adds an
  eleventh primitive: an empty placeholder Solid uses as an insertion anchor for
  `<Show>` / `<For>` / `<Switch>` boundaries. It is stripped during
  serialization — `serializeNode` returns `null` for it — so it never reaches
  the protocol. This step has no conditional rendering and therefore no slots.
  [packages/solid-renderer/src/renderer/reconciler.ts:89](../../packages/solid-renderer/src/renderer/reconciler.ts#L89),
  [packages/solid-renderer/src/serialization/serialize.ts:54](../../packages/solid-renderer/src/serialization/serialize.ts#L54)
- **Batching.** Every primitive here notifies immediately. The real reconciler
  funnels all of them into `scheduleUpdate()`, which coalesces a burst of
  effects into a single `queueMicrotask` flush before calling
  `mutationCollector.flushCommit()`. Without it, one interaction that touches
  five signals sends five separate mutation batches across the transport.
  [packages/solid-renderer/src/renderer/reconciler.ts:15](../../packages/solid-renderer/src/renderer/reconciler.ts#L15)
- **The synthetic container, and why container-level changes become `setRoot`.**
  Solid mounts into a container node the host never sees (id `"root"`).
  `_syncContainerRoot` exists because emitting `appendChild(parentId: "root")`
  referenced an id no host had, "so incremental hosts could never seed their
  tree and the runtime had to resend the whole tree every flush". `main.ts`
  just reads `container.children[0]`.
  [packages/solid-renderer/src/renderer/reconciler.ts:133](../../packages/solid-renderer/src/renderer/reconciler.ts#L133),
  [packages/solid-renderer/src/renderer/reconciler.ts:167](../../packages/solid-renderer/src/renderer/reconciler.ts#L167)
- **The multiple-root guard.** The protocol tree has one root; the real
  reconciler warns once when a plugin returns top-level siblings, because the
  runtime silently serializes only `children[0]`. The React side throws instead.
  [packages/solid-renderer/src/renderer/reconciler.ts:23](../../packages/solid-renderer/src/renderer/reconciler.ts#L23),
  [packages/react-renderer/src/reconciler/host-config.ts:147](../../packages/react-renderer/src/reconciler/host-config.ts#L147)
- **Handler lifecycle.** `main.ts` derives `_onClickHandlerId` as
  `${nodeId}:${key}` — which is the real rule, and the one step 04 builds in
  full from the React side — but nothing here stores, invokes or releases the
  actual closure. The real path has a `HandlerRegistry` with
  `beginSweep()` / `endSweep()` bracketing every full serialization and
  `cleanupHandlers()` walking removed subtrees, "without this, full update mode
  leaks handlers for every removed node".
  [packages/solid-renderer/src/serialization/serialize.ts:23](../../packages/solid-renderer/src/serialization/serialize.ts#L23),
  [packages/solid-renderer/src/mutation/mutation-collector.ts:93](../../packages/solid-renderer/src/mutation/mutation-collector.ts#L93)
- **Style IR.** Real `serializeProps` derives a `_style` prop through
  `resolveStyleIR` from `@uniview/style` — *the same helper the React renderer
  uses*, and the source comment says why in as many words: "a Solid plugin
  rendered through the native bridge must produce the identical IR a React
  plugin would, or the framework-agnostic contract is a lie. (It was: this
  serializer used to forward `className` untouched, so every Solid plugin lost
  its Tailwind styling on the native side.)" That is this step's thesis with a
  bug report attached. Step 16.
  [packages/solid-renderer/src/serialization/serialize-props.ts:16](../../packages/solid-renderer/src/serialization/serialize-props.ts#L16)
- **The nested-function trap.** Only top-level `on[A-Z]*` props become handler
  ids. A function buried inside an object or array prop — Raycast-style
  `actions={[{ onAction }]}` — silently does not, and the real serializer warns
  once per prop name.
  [packages/solid-renderer/src/serialization/serialize-props.ts:78](../../packages/solid-renderer/src/serialization/serialize-props.ts#L78)
- **Keyed list reordering.** `main.ts` implements the detach-before-insert rule
  that makes moves correct, but never exercises it. The path that needs it is
  Solid's `reconcileArrays`, which drives `insertNode` / `removeNode` /
  `getNextSibling` — see the vendored
  [learn/steps/06-solid-renderer/universal.js](../steps/06-solid-renderer/universal.js).
- **Module-level singleton state.** The real reconciler keeps `rootNode`,
  `updateCallback` and `mutationCollector` as module globals, so there is one
  Solid renderer per module instance — a real constraint the React side does not
  have, since its state lives on the container.
  [packages/solid-renderer/src/renderer/reconciler.ts:8](../../packages/solid-renderer/src/renderer/reconciler.ts#L8)
- **"Zero changes anywhere else" is currently true of the protocol and the
  hosts, but not of the main-thread controller.**
  `createMainController` imports `react` and `@uniview/react-renderer` directly
  and takes a React `ComponentType`; there is no Solid equivalent, so a Solid
  plugin reaches a host only through the Worker/WebSocket runtimes, where it
  bundles its own renderer. `CLAUDE.md` lists "NEVER couple host-sdk to specific
  framework" as an anti-pattern, so this is a known debt rather than a design.
  Step 12 is where it becomes visible.
  [packages/host-sdk/src/controllers/main.ts:1](../../packages/host-sdk/src/controllers/main.ts#L1),
  [CLAUDE.md:184](../../CLAUDE.md#L184)

### One environment quirk worth knowing

`learn/steps/06-solid-renderer/` contains `universal.js`, a verbatim copy of
`node_modules/solid-js/universal/dist/universal.js` with exactly one change: it
imports `solid-js/dist/solid.js` instead of the bare `solid-js`. solid-js's
`exports` map lists a `"node"` condition *before* the default one, pointing at
`dist/server.js` — the SSR build, where signals are plain values and
`createRenderEffect` runs once and never again. Under `tsx` a bare import
resolves there, and the effect is subtle and nasty: the tree builds perfectly and
then every subsequent signal write does nothing at all, with no error. The first
run of this step printed `(no primitives fired)` for the entire update trace.
Naming the client build is what makes the lesson real. Browsers and Web Workers
— where Uniview plugins actually run — pick `browser` / `worker` and never see
it. Vendoring is not a curriculum hack either: the real package vendors the same
file, at
[packages/solid-renderer/src/renderer/universal.js](../../packages/solid-renderer/src/renderer/universal.js).

## Trade-offs

- **A second renderer package is ~850 lines of genuinely duplicated intent** —
  two serializers, two mutation collectors, two handler registries that do the
  same job in different idioms. What it buys is that the duplication is confined
  to the plugin side of the protocol: `@uniview/protocol`, every host adapter
  and every native port stay at one implementation each, which is the side that
  gets multiplied by platforms.
- **Solid's small primitive set costs you a commit boundary.** React tells the
  renderer exactly when a batch starts and ends (`prepareForCommit` /
  `resetAfterCommit`); Solid never does, so Uniview has to synthesise one with
  `queueMicrotask` and a `scheduled` flag. Cheaper interface, more work to know
  when to flush.
- **Fine-grained updates are dramatically cheaper but harder to reason about.**
  Two primitive calls and zero component re-runs per signal, versus a re-render
  plus a diff. The cost is that "what will change when this signal changes" is a
  property of where you *read* the signal, distributed across the component,
  rather than a single re-render you can put a breakpoint in.
- **Ids are stable, not portable.** React mints `node-0` / `text-0`, Solid mints
  `column-1` / `text-2`. The protocol only ever requires that a node keeps *its*
  id across renders, which is what makes `setText` by id possible; it never
  requires two frameworks to agree. `main.ts` has to normalise ids away before
  comparing, and that is correct rather than a fudge — but it does mean no test
  anywhere can assert on a literal id.
- **Text-node placement differs even when the tree does not.** Look at the two
  initial traces: React creates both text instances first and attaches bottom-up
  (`appendInitialChild`), Solid attaches the button first and then inserts the
  dynamic text *before* it. Same final child order, completely different call
  sequence. Any host that assumed arrival order carried meaning would break on
  the second framework — which is exactly the class of bug this step exists to
  catch.

## Run it

```
pnpm tsx steps/06-solid-renderer/main.ts
```

Real output, **trimmed**. Elided: §1's six-line closing note, §2's twenty-line
prose block explaining the two routes, and §2's two pretty-printed trees (which
differ from §1's only in `"Clicked 1 times"` and `disabled=false`). Everything
below is verbatim.

```
=== 1. Initial render: every renderer primitive that fired ===

  solid-js/universal — 10 primitives available:
   1. [solid ] createElement            column -> #column-1
   2. [solid ] setProperty              <column>#column-1 gap=8
   3. [solid ] setProperty              <column>#column-1 padding=16
   4. [solid ] createElement            button -> #button-2
   5. [solid ] setProperty              <button>#button-2 disabled=true
   6. [solid ] setProperty              <button>#button-2 onClick=<fn>
   7. [solid ] createTextNode           "Click me" -> #text-3
   8. [solid ] insertNode               #text#text-3 "Click me" -> <button>#button-2
   9. [solid ] insertNode               <button>#button-2 -> <column>#column-1
  10. [solid ] createTextNode           "Clicked 0 times" -> #text-4
  11. [solid ] insertNode               #text#text-4 "Clicked 0 times" -> <column>#column-1 (before <button>#button-2)
  12. [solid ] insertNode               <column>#column-1 -> <#root>#root

  react-reconciler HostConfig — 53 members available:
   1. [react ] createTextInstance       "Clicked 0 times" -> #text-0
   2. [react ] createTextInstance       "Click me" -> #text-1
   3. [react ] createInstance           button -> #node-0 {"disabled":true,"onClick":"<fn>"}
   4. [react ] appendInitialChild       #text#text-1 "Click me" -> <button>#node-0
   5. [react ] createInstance           column -> #node-1 {"gap":8,"padding":16}
   6. [react ] appendInitialChild       #text#text-0 "Clicked 0 times" -> <column>#node-1
   7. [react ] appendInitialChild       <button>#node-0 -> <column>#node-1
   8. [react ] appendChildToContainer   <column>#node-1 -> container

  solid's serialized UINode tree:
  <column#column-1 gap=8 padding=16>
    #text#text-4 "Clicked 0 times"
    <button#button-2 disabled=true _onClickHandlerId="button-2:onClick">
      #text#text-3 "Click me"

  react's serialized UINode tree:
  <column#node-1 gap=8 padding=16>
    #text#text-0 "Clicked 0 times"
    <button#node-0 disabled=true _onClickHandlerId="node-0:onClick">
      #text#text-1 "Click me"
```

Compare those eight `[react ]` lines against step 03's mount trace: same
callbacks, same order, same ids, same detail format. The trace layout is shared
on purpose so that this file and step 03 diff cleanly.

Then one signal, next to one `setState`:

```
=== 2. One signal / one setState: the update path ===

  solid:
   1. [solid ] setProperty              <button>#button-2 disabled=false
   2. [solid ] replaceText              #text-4 "Clicked 0 times" -> "Clicked 1 times"

  react:
   1. [react ] commitTextUpdate         #text-0 "Clicked 0 times" -> "Clicked 1 times"
   2. [react ] commitUpdate             <button>#node-0 {"disabled":true,"onClick":"<fn>"} -> {"disabled":false,"onClick":"<fn>"}
   3. [react ] commitUpdate             <column>#node-1 {"gap":8,"padding":16} -> {"gap":8,"padding":16}

  solid : 2 primitive calls, component function ran 1 time.
  react : 3 primitive calls, component function ran 2 times.
```

Line 3 of the React trace is the one to stare at: `{"gap":8,"padding":16} ->
{"gap":8,"padding":16}`. Nothing changed, and the host was told to write anyway,
because re-running the component allocated a new props object. Solid's two lines
are the only two writes that correspond to something that actually changed, and
its component function never ran a second time.

The mutations Solid's primitives collected on the way — emitted from inside
`replaceText` / `setProperty` rather than from inside a commit:

```
    {"type":"setProps","nodeId":"button-2","props":{"disabled":false,"_onClickHandlerId":"button-2:onClick"}}
    {"type":"setText","nodeId":"text-4","text":"Clicked 1 times"}
```

And the point of the whole step:

```
=== 3. Assertion ===

  solid @ mount  === react @ mount   (live, this file) : PASS
  solid @ update === react @ update  (live, this file) : PASS
  solid @ mount  === step 03's published React output  : PASS
  solid @ mount  === step 01's hand-written treeV1     : PASS
```

Four `PASS`es, three of them independent. The first two compare Solid against a
React renderer running in the same process. The third compares it against the
tree **step 03 actually printed**, transcribed from that step's own "Run it"
section. The fourth compares it against the tree step 01 wrote out by hand as
plain data, before either renderer existed.

The comparison normalizes ids to positional paths, because the protocol requires
ids to be *stable*, not *equal across frameworks* — React mints `node-1`, Solid
mints `column-1`, and no host ever sees both. The two cross-step anchors
additionally ignore handler-id *values*: step 03's component has no event
handler and step 01 hand-wrote the placeholder `"h_1"`. The live solid-vs-react
comparison keeps them, so it does verify that both renderers independently emit
`_onClickHandlerId` — step 04's rule, re-derived from a different package.

## Sources

- [packages/solid-renderer/src/renderer/universal.d.ts](../../packages/solid-renderer/src/renderer/universal.d.ts) —
  `RendererOptions`, the eleven primitives, and `RendererAPI`
- [packages/solid-renderer/src/renderer/universal.js](../../packages/solid-renderer/src/renderer/universal.js) —
  Uniview's vendored fork of `solid-js/universal`
- [packages/solid-renderer/src/renderer/reconciler.ts](../../packages/solid-renderer/src/renderer/reconciler.ts) —
  the primitives themselves, `scheduleUpdate`, `_syncContainerRoot`,
  `_detachFromParent`, the multiple-root guard
- [packages/solid-renderer/src/renderer/types.ts](../../packages/solid-renderer/src/renderer/types.ts) —
  `SolidNode` / `SolidTextNode` / `SolidSlotNode`, `generateId`
- [packages/solid-renderer/src/serialization/serialize.ts](../../packages/solid-renderer/src/serialization/serialize.ts) —
  internal node to `UINode`, slot stripping, registry sweep
- [packages/solid-renderer/src/serialization/serialize-props.ts](../../packages/solid-renderer/src/serialization/serialize-props.ts) —
  handler-id derivation, Style IR, the nested-function warning
- [packages/solid-renderer/src/serialization/handler-registry.ts](../../packages/solid-renderer/src/serialization/handler-registry.ts) —
  handler storage and sweep
- [packages/solid-renderer/src/mutation/mutation-collector.ts](../../packages/solid-renderer/src/mutation/mutation-collector.ts) —
  `SolidMutationCollector`, `collectSetText` / `collectSetProps` / `collectSetRoot`
- [packages/solid-renderer/src/index.ts](../../packages/solid-renderer/src/index.ts) —
  the package's public surface, including the `solid-js` control-flow re-exports
- [packages/react-renderer/src/reconciler/host-config.ts](../../packages/react-renderer/src/reconciler/host-config.ts) —
  the 53-member `HostConfig` this step is the contrast to
- [packages/host-sdk/src/controllers/main.ts](../../packages/host-sdk/src/controllers/main.ts) —
  the main-thread controller, currently React-only
- [CLAUDE.md](../../CLAUDE.md) — "THE PRIME DIRECTIVE", the framework-agnostic
  clause, and the host-sdk coupling anti-pattern
- [learn/steps/01-protocol/main.ts](../steps/01-protocol/main.ts) — `UINode`,
  `show()` and the hand-written `treeV1` this step's output is compared against
- [learn/docs/03-what-is-a-custom-renderer.md](./03-what-is-a-custom-renderer.md) —
  the React trace format this step mirrors, and the published mount tree used as
  an anchor in §3 of the assertion
- [learn/steps/03-what-is-a-custom-renderer/main.ts](../steps/03-what-is-a-custom-renderer/main.ts) —
  `trace()`, `label()` and the `HostConfig` this step is the contrast to
- [learn/steps/04-serializing-the-tree/main.ts](../steps/04-serializing-the-tree/main.ts) —
  `handlerIdProp` / `isHandlerIdProp` and the handler registry, from the React side
- [learn/steps/00-scaffold-probe/main.ts](../steps/00-scaffold-probe/main.ts) —
  the working `react-reconciler@0.33` host config this step's React half starts from
