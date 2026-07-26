# 04. Live host instances → a JSON-safe `UINode`, and how a function prop becomes a `HandlerId`

## Why

Step 03's host config grows a tree of `InternalNode`s, and that tree is not a
protocol. It has `parent` back-pointers, so it is a graph and not a tree; its
`props` are whatever React handed over, including `children` (React elements
carrying `_owner` fibers) and `onClick` (a closure). Try the obvious
`JSON.stringify(instance.props)` and V8 answers `Converting circular structure
to JSON` — the run below does exactly that, on purpose. Uniview has to get from
there to something that survives structured clone (step 13), a socket (step 14)
and a Swift decoder with no JS runtime in the room (step 10), which is what
`CLAUDE.md` states as a flat prohibition: "**NEVER** pass functions directly over
RPC - use handler-registry pattern".

## Why this approach, and not the obvious alternative

The alternative that keeps suggesting itself is **keep the function, and make the
boundary carry it**.

*Proxy the function across.* Some RPC libraries will do this — hold the callable
on one side, ship a stub on the other. It cannot work here for a reason that is
structural rather than a limitation of any library: the AppKit host (step 10) is
Swift, and the terminal host is a layout engine. A proxy needs a runtime on the
receiving side capable of holding a reference to a foreign callable. `UINode` is
decoded by things that have no such concept. The *narrowest* boundary in the fan-out
decides the format, and the narrowest one is "a Swift struct decoded from JSON".

*Skip the wire in main-thread mode and pass the real function.* This is the
tempting one, because in step 12's runtime there genuinely is no boundary. It
would mean the tree has a different shape depending on which runtime the plugin
is in — and then every host adapter needs two code paths, `onClick` and
`_onClickHandlerId`, and the promise that a host is written once against one
contract is gone. The real renderer serializes identically in all three runtimes;
step 01's hand-written tree already carried `_onClickHandlerId` for the same
reason.

Given that a name has to travel, the second decision is what the name *is*.
Uniview mints `${nodeId}:${propName}` — deterministic — and the class comment
says why:

> Handler ids are deterministic — `${nodeId}:${propName}` — so re-rendering
> a node OVERWRITES its entries instead of growing the registry, and an
> event RPC that arrives after a re-render executes that node's latest
> handler (correct semantics) instead of a stale or wrong one.
>
> — [packages/react-renderer/src/serialization/handler-registry.ts:6](../../packages/react-renderer/src/serialization/handler-registry.ts#L6)

The obvious alternative is a counter — `h_0`, `h_1`, … — which is what the
protocol's own `HandlerId` doc comment still describes ("Format: h_<counter> or
uuid") and what step 01's hand-written tree used. Every render of a React
component creates brand-new closure objects, so a counter mints a fresh id per
node per prop per render, and nothing ever tells you an old one is dead. The run
below carries one of these alongside the real registry: over one mount, two
events and an unmount, the real registry ends at **0 live handlers** and the
counter-based one at **10**, every one of them pinning a closure and everything
that closure captured. That gap is linear in render count, so on a UI that
re-renders on every keystroke it is not a rounding error.

## What changed since step 03

Step 03 ended with a `serializeTree` that was honest about being a stub: it
dropped functions on the floor with a comment saying "that is step 13". Step 04
is that step, brought forward — because the moment the tree leaves the process,
a dropped `onClick` is a button that does nothing.

Concretely, versus `steps/03-what-is-a-custom-renderer/main.ts`:

- **`ownProps()` is gone**, replaced by `serializeProps(props, registry, nodeId)`
  with the real signature. Same `children`/`key`/`ref` skip, but now `on[A-Z]*`
  functions become `_onClickHandlerId` strings instead of vanishing, `undefined`
  is dropped while `null` survives, and a function nested inside an object prop
  produces a one-time warning.
- **A `HandlerRegistry` class is new**, with `syncNode` / `releaseNode` /
  `beginSweep` / `endSweep` / `execute` — copied from the real one.
  `serializeTree` now takes it as a second argument and brackets its walk with
  the sweep.
- **The step 03 instrumentation is gone.** No `trace()`, no `tick()`, no
  callback-counting wrapper; the host config is the same object with its
  comments trimmed, because this step's subject is what happens *after* a commit,
  not during one. One addition: `createInstance` stashes the raw props object so
  section 2 can fail to stringify it.
- **The component gained handlers and an unmounting subtree.** `onClick` and
  `onKeyDown` capture `count`; a second `<button title="reset">` exists only
  while `count > 0`, so the run can watch its handler be registered and then
  released.
- **Events now flow backwards.** Step 03 poked the component through a module
  variable (`click?.()`). Step 04 dispatches by id, through a `dispatchFromHost`
  function that is handed nothing but a string and a `JSONValue[]` — the exact
  shape of the real `executeHandler` RPC.
- **The output is asserted, not just printed.** Three
  `JSON.parse(JSON.stringify(tree))` round-trips with a structural equality check
  and a printed PASS/FAIL.

Unchanged: the six mutation kinds still do not exist. Every commit still
re-serializes the whole tree. That is step 05.

## How Uniview really does it

The conversion itself is nine lines, and this is the whole idea of the step. A
function prop is not encoded, not proxied, not dropped — it is *named*, and the
name goes in the tree while the function goes in a map:

```typescript
    // Convert event handler functions (on[A-Z]*) to handler IDs
    if (typeof value === "function") {
      if (/^on[A-Z]/.test(key)) {
        const handlerId = `${nodeId}:${key}`;
        handlers.set(handlerId, value as (...args: unknown[]) => unknown);
        serializedProps[`_${key}HandlerId`] = handlerId;
      }
      continue;
    }
```

[packages/react-renderer/src/serialization/serialize-props.ts:48](../../packages/react-renderer/src/serialization/serialize-props.ts#L48)
(lines 48-56). Note the regex rather than a lookup in `EVENT_PROPS`: any
`on[A-Z]*` prop gets an id. `EVENT_PROPS` is the *host's* whitelist of what it
knows how to fire, which is why `extractEventName` returns `null` for an id prop
no host can trigger.

Releasing is the half that is easy to forget, and full-tree mode has no removal
signal at all — nothing calls the registry when a node disappears. So the walk
brackets itself:

```typescript
/**
 * Serialize a full tree from the root. Brackets the walk with a registry
 * sweep so handlers owned by nodes that left the tree are released —
 * without this, full update mode leaks handlers for every removed node.
 */
export function serializeTree(
  instance: InternalNode | TextNode | null,
  registry: HandlerRegistry,
): UINode | string | null {
  registry.beginSweep();
  try {
    return serializeNode(instance, registry);
  } finally {
    registry.endSweep();
  }
}
```

[packages/react-renderer/src/serialization/serialize.ts:15](../../packages/react-renderer/src/serialization/serialize.ts#L15)
(lines 15-30)

…and the sweep is mark-and-release against the nodes the walk actually visited:

```typescript
  /**
   * Start tracking which nodes a full-tree serialization touches.
   * Nodes not seen by the matching `endSweep` are released — they left
   * the tree without an explicit removeChild (full update mode).
   */
  beginSweep(): void {
    this.sweepSeen = new Set();
  }

  endSweep(): void {
    const seen = this.sweepSeen;
    this.sweepSeen = null;
    if (!seen) return;
    for (const nodeId of [...this.nodeHandlers.keys()]) {
      if (!seen.has(nodeId)) this.releaseNode(nodeId);
    }
  }
```

[packages/react-renderer/src/serialization/handler-registry.ts:56](../../packages/react-renderer/src/serialization/handler-registry.ts#L56)
(lines 56-72)

## What this step leaves out

- **The Style IR.** The real `serializeProps` ends by calling
  `resolveStyleIR(props)` and attaching the result as a derived `_style` prop —
  same `_`-prefix convention as `_onClickHandlerId`, and deliberately *not*
  merged into `style`, because `style` already means "a CSS object" to the web
  hosts. This step's version stops at the loop. Step 16.
  [packages/react-renderer/src/serialization/serialize-props.ts:89](../../packages/react-renderer/src/serialization/serialize-props.ts#L89)
- **Suspense-hidden nodes.** Real `serializeNode` returns `null` for
  `instance.hidden`, so a subtree behind a showing fallback stays mounted (its
  state and its handlers alive) while being absent from the wire tree. This
  step's serializer has no `hidden` concept because its host config's
  `hideInstance` is a no-op.
  [packages/react-renderer/src/serialization/serialize.ts:41](../../packages/react-renderer/src/serialization/serialize.ts#L41)
- **Release in incremental mode.** The sweep only exists because full-tree mode
  walks everything. In incremental mode nothing walks the whole tree, so
  `MutationCollector.cleanupHandlers` recursively calls `releaseNode` on a
  removed subtree from `collectRemoveChild` instead. Both paths must exist and
  do the same job by different means; this step only shows the first. Step 05.
  [packages/react-renderer/src/mutation/mutation-collector.ts:89](../../packages/react-renderer/src/mutation/mutation-collector.ts#L89)
- **The transport, entirely.** `dispatchFromHost` here is a function call. In
  production `executeHandler(handlerId, args)` is an RPC method on the controller
  — over kkrpc to a Worker, or over a socket — and the id/args pair is validated
  on arrival against `HandlerIdSchema` and `HandlerArgsSchema` because it is
  untrusted input from another process. Steps 13-15.
  [packages/host-sdk/src/controllers/main.ts:110](../../packages/host-sdk/src/controllers/main.ts#L110),
  [packages/protocol/src/validators.ts:57](../../packages/protocol/src/validators.ts#L57)
- **Async handlers and return values.** The real `execute` awaits a returned
  Promise so an async `onClick` completes before the RPC resolves, and its result
  travels back. This step's copy has the same code but never exercises it —
  `CLAUDE.md` lists "**NEVER** assume synchronous execution - handlers may be
  async" as an anti-pattern for a reason.
  [packages/react-renderer/src/serialization/handler-registry.ts:74](../../packages/react-renderer/src/serialization/handler-registry.ts#L74)
- **Teardown that does not depend on a final serialization.** Section 8 relies on
  `serializeTree(null)` running one last sweep. The real controller also calls
  `handlerRegistry.clear()` on `disconnect()`, because a controller may be torn
  down without anyone asking for a tree first.
  [packages/host-sdk/src/controllers/main.ts:91](../../packages/host-sdk/src/controllers/main.ts#L91)
- **The second copy of all of this.** `packages/solid-renderer` has its own
  `HandlerRegistry` and `serializeProps` with the same semantics, because a
  renderer package may not depend on another renderer package. Step 06 shows the
  two producing identical trees.
  [packages/solid-renderer/src/serialization/handler-registry.ts](../../packages/solid-renderer/src/serialization/handler-registry.ts)
- **Legacy bare-string children.** The real `serializeTree` returns
  `UINode | string | null`; this one returns `UINode | null`. The string arm is
  backward compatibility for pre-v3 trees, which is also why step 01's `UINode`
  children are a union.

## Trade-offs

- **The tree can be sent anywhere, and nothing in it is callable.** Every host
  therefore needs the round trip: find `_onClickHandlerId`, send the string back,
  wait. A main-thread host pays that indirection for nothing (step 12) so that a
  Worker and a Swift host can exist at all.
- **Deterministic ids make re-render cheap and removal possible; they also make
  ids guessable and node-scoped.** `node-0:onClick` is a stable public name for
  a closure. Move a handler to a different node and its id changes, so nothing
  may cache an id across a re-parent — and a host that persists ids across a
  plugin restart will address the wrong closures, because `node-N` counters
  restart too.
- **Handler lifetime is derived, not declared.** A prop that disappears releases
  its id (`syncNode` diffs the node's whole handler set) and a node that leaves
  the tree releases all of them (the sweep). Nobody writes release code —
  which also means nobody can see it in a diff. Delete the `beginSweep`/`endSweep`
  bracket and everything still works, correctly, forever, while leaking.
- **A late event is normal, not an error.** The host's tree always lags the
  plugin's, so a click on a just-removed node finds no handler. The registry
  warns and returns rather than throwing, which is right — and means a genuine
  wiring bug produces the same message as a benign race.
- **Serialization is O(tree) per commit and it re-registers every handler every
  time.** The run below re-syncs the registry on all nodes for a change to one
  text node. Cheap here, quadratic-feeling at 200 nodes and a keystroke per
  frame; step 05 is where the walk stops being whole-tree.
- **Only top-level `on[A-Z]*` props are callable, and the failure is silent.**
  A function inside `actions={[{ run() {} }]}` is not an error, not a handler,
  and gone after `JSON.stringify` — hence the one-time `console.warn`, which is
  a warning precisely because the alternative (throwing) would break renders
  that are otherwise fine.

## Run it

```
pnpm tsx steps/04-serializing-the-tree/main.ts
```

Real captured output, **trimmed**: the explanatory prose after each section is
elided (marked `[...]`), as are sections 3b/3c and section 9's bullets. Section
numbers, values and error text are verbatim.

```
=== 1. Mount: React has grown a tree of host instances ===
  root <column>#node-1 with 2 children; the button is #node-0.
  Nothing has been serialized yet. The props are exactly what React handed over:
    title          string
    disabled       boolean
    keyDownEvents  array(1)
    badge          null
    tooltip        undefined
    onClick        function
    onKeyDown      function
    children       string

=== 2. The obvious thing, and why it does not work ===
  (a) JSON.stringify(columnInstance.props) — props still contain React's `children`:
      TypeError: Converting circular structure to JSON
          --> starting at object with constructor 'Object'
          |     property 'children' -> object with constructor 'Array'
          |     index 1 -> object with constructor 'Object'
          |     ...
          |     property 'rootInstance' -> object with constructor 'Object'
          --- property 'props' closes the circle
      [...]
  (b) So drop `children` and stringify what is left:
      {"title":"increment","disabled":false,"keyDownEvents":["Enter"],"badge":null}
      No throw — and that is worse. `onClick` and `onKeyDown` were silently
      dropped, `tooltip: undefined` vanished, and the resulting node renders
      a button that does nothing at all. [...]
```

That is the whole motivation in eleven lines: the naive call throws, and the
naive fix for the throw silently produces a dead button. Then the real
`serializeProps`:

```
=== 3. serializeProps: a function becomes a HandlerId ===
  <column#node-1 gap=8 padding=16>
    #text#text-0 "Clicked 0 times"
    <button#node-0 title="increment" disabled=false keyDownEvents=["Enter"] badge=null _onClickHandlerId="node-0:onClick" _onKeyDownHandlerId="node-0:onKeyDown">
      #text#text-1 "Click me"

=== 4. Is it actually wire-safe? ===
  [PASS] tree after mount                    439 B survived JSON.parse(JSON.stringify(...)) unchanged

=== 5. The host calls back, holding nothing but strings ===
  what the host found in its JSON copy of the tree:
    node-0   onClick      -> node-0:onClick
    node-0   onKeyDown    -> node-0:onKeyDown
  a direct lookup: props["_onClickHandlerId"] on #node-0 = "node-0:onClick"

  registry on the plugin side:
        node-0:onClick         -> onClick
        node-0:onKeyDown       -> onKeyDown
  live handlers: 2   |   naive h_<counter> registry: 2

  now the host fires a click — by id, over JSON:
      [host]   -> executeHandler("node-0:onClick", [])
      [plugin] onClick closure ran; it captured count=0
```

The click arrived as the string `"node-0:onClick"`, read off a tree that had been
through `JSON.parse(JSON.stringify(...))` — and the closure it named still had
the mount render's `count = 0` captured, because it never went anywhere.

Re-render, and the identity check that is the point of deterministic ids:

```
=== 6. Re-render: same ids, different closures ===
  <column#node-1 gap=8 padding=16>
    #text#text-0 "Clicked 1 times"
    <button#node-0 ... _onClickHandlerId="node-0:onClick" _onKeyDownHandlerId="node-0:onKeyDown">
      #text#text-1 "Click me"
    <button#node-2 title="reset" _onClickHandlerId="node-2:onClick">
      #text#text-2 "Reset"

  [... registry.describe(): the three ids above ...]
  live handlers: 3   |   naive h_<counter> registry: 5
    same id "node-0:onClick", same function object? false  (a NEW closure, capturing count=1)

      [host]   -> executeHandler("node-0:onKeyDown", [{"key":"Enter","metaKey":false,"shiftKey":false,"altKey":false,"ctrlKey":false,"repeat":false}])
      [plugin] onKeyDown closure ran with key="Enter" (meta=false); it captured count=1
  [PASS] tree after two events               618 B survived JSON.parse(JSON.stringify(...)) unchanged
```

(The `<button#node-0 ...>` line is elided in the middle; its props are unchanged
from section 3.) Three live handlers, one per node/prop pair actually in the tree
— while the counter-based registry is already at five and cannot shrink.

Then removal and unmount:

```
=== 7. Release: the reset button removes itself ===
  before: registry.has("node-2:onClick") = true
      [host]   -> executeHandler("node-2:onClick", [])
  [... the re-serialized tree, back to the section 3 shape ...]
  after:  registry.has("node-2:onClick") = false
  live handlers: 2   |   naive h_<counter> registry: 10

  a late event for the released id — the normal host/plugin race:
      [host]   -> executeHandler("node-2:onClick", [])
      [plugin] executeHandler: no handler registered for "node-2:onClick" (node unmounted or event arrived after removal)

=== 8. Unmount: everything is released ===
  serialized tree: null
  live handlers: 0   |   naive h_<counter> registry: 10
  The naive registry still holds all 10: h_0, h_1, h_2, h_3, h_4, h_5, h_6, h_7, h_8, h_9.

=== 9. What this step bought ===
  [PASS] final (null) tree                     4 B survived JSON.parse(JSON.stringify(...)) unchanged

  round-trips: 3/3 PASS
```

`0` against `10`, on a four-node UI over three renders.

## Sources

- [packages/react-renderer/src/serialization/serialize-props.ts](../../packages/react-renderer/src/serialization/serialize-props.ts) —
  the `on[A-Z]*` → `_...HandlerId` conversion, the `children`/`key`/`ref` skip,
  `undefined` dropped while `null` survives, the nested-function warning, and the
  `_style` Style IR prop this step leaves out
- [packages/react-renderer/src/serialization/handler-registry.ts](../../packages/react-renderer/src/serialization/handler-registry.ts) —
  `syncNode` / `releaseNode` / `beginSweep` / `endSweep` / `execute`, and the
  class comment explaining why the ids are deterministic
- [packages/react-renderer/src/serialization/serialize.ts](../../packages/react-renderer/src/serialization/serialize.ts) —
  `serializeTree`, the sweep bracket, text nodes, and the `hidden` skip
- [packages/react-renderer/src/reconciler/host-config.ts](../../packages/react-renderer/src/reconciler/host-config.ts) —
  where the live `InternalNode` gets its props (`createInstance`,
  `commitUpdate`), and the `parent` back-pointer that makes the live tree a graph
- [packages/react-renderer/src/mutation/mutation-collector.ts](../../packages/react-renderer/src/mutation/mutation-collector.ts) —
  `serializeSubtree` and `cleanupHandlers`, the incremental-mode counterpart of
  the sweep (step 05)
- [packages/protocol/src/events.ts](../../packages/protocol/src/events.ts) —
  `HandlerId`, `EventPropName`, `EVENT_PROPS`, `handlerIdProp` /
  `isHandlerIdProp` / `extractEventName`, and `KeyDownEvent` with its "subset of
  the DOM's KeyboardEvent, field for field" rationale
- [packages/protocol/src/validators.ts](../../packages/protocol/src/validators.ts) —
  `HandlerIdSchema` / `HandlerArgsSchema`, and why `executeHandler` validates two
  positional arguments rather than one object
- [packages/host-sdk/src/controllers/main.ts](../../packages/host-sdk/src/controllers/main.ts) —
  who owns the `HandlerRegistry`, when `serializeTree` is called, and
  `executeHandler` / `clear()`
- [packages/solid-renderer/src/serialization/handler-registry.ts](../../packages/solid-renderer/src/serialization/handler-registry.ts) —
  the same registry, reimplemented for the Solid renderer (step 06)
- [CLAUDE.md](../../CLAUDE.md) — "**NEVER** pass functions directly over RPC -
  use handler-registry pattern", the Handler Registry Pattern section, and
  "**NEVER** assume synchronous execution - handlers may be async"
- [learn/steps/03-what-is-a-custom-renderer/main.ts](../steps/03-what-is-a-custom-renderer/main.ts) —
  the host config, `InternalNode` / `TextNode`, `show()`, and the `ownProps()`
  stub this step replaces
- [learn/steps/01-protocol/main.ts](../steps/01-protocol/main.ts) —
  `UINode`, `JSONValue`, and the hand-written `_onClickHandlerId: "h_1"` that
  section 8's naive registry is a working model of
