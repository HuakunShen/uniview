# 12. The controller seam, with zero serialization — the baseline to compare against

## Why

Stage D claims that one plugin runs in three places — main thread, Web Worker,
another process — behind one interface the host cannot see through. Steps 13 and
14 are where that costs something. This step is where it costs nothing, and it
exists so that "costs something" becomes a number instead of an adjective.

`createMainController` is the implementation with nothing in the middle: the
plugin's React tree lives in the host's own heap, `postMessage` is never called,
and `controller.executeHandler(id)` reaches the plugin's closure by a direct
function call on the caller's stack. `main.ts` prints that stack. The failure
mode this step prevents is not a bug — it is a reader finishing step 13 believing
"a Worker adds some overhead" without ever having seen the zero it was added to.
So the run instruments the seam: bytes serialized (0), `JSON.stringify` calls per
commit (0), handler latency in microseconds, and — for the very same payload —
what a structured-clone boundary and a JSON boundary would have charged.

## Why this approach, and not the obvious alternative

The obvious alternative is to **not have a main-thread controller at all**: if a
plugin is going to be moved into a Worker eventually, run it in a Worker from the
start and keep one code path. That is genuinely attractive, and Uniview does not
do it, for a reason that is visible in the real file's own comment. `disconnect()`
in the main controller says:

> "in main-thread mode the plugin runs in the host page — dropping references
> without unmounting leaked live effects/timers directly into the host for every
> connect/disconnect cycle."
> ([controllers/main.ts:84](../../packages/host-sdk/src/controllers/main.ts#L84))

That sentence is only meaningful because there is no boundary — a Worker
teardown throws the whole global away. Main-thread mode is not a convenience, it
is a different set of hazards, and it earns its place because it is the only mode
where the host and plugin can be developed, stepped through in one debugger, and
profiled as a single stack. The section 9.2 stack trace in `main.ts` shows the
host's `dispatchHostEvent` frame *underneath* the plugin's closure; you cannot
get that from a Worker at any price.

The second alternative is to **let the host talk to the plugin directly** when
they share a heap — skip `PluginController`, call the component's setter, read
the fiber tree. It is faster to write and it is exactly the thing that makes the
other two runtimes impossible later, because the host has now grown knowledge of
React. The host-sdk's own anti-pattern list is blunt: "NEVER expose raw RPC
channel - encapsulate entirely in controller", and the payoff is stated as a
property — "All controllers implement `PluginController` - host code unchanged
when switching modes." This step is that property's cheapest possible test: the
host in `main.ts` §8 is step 07/08's host, and the only line that knows anything
about where the plugin runs is `getStatus().mode`.

The third alternative concerns **the full-tree backstop** (finding 2 below).
`controllers/main.ts` in incremental mode subscribes to the mutation channel
*and* the full-tree channel, so every commit is applied as a delta and then
overwritten by a fresh whole-tree serialization. The obvious alternative — do
what `react-runtime` does and subscribe to mutations only — is strictly less
work. Main-thread mode chooses the extra work because the currency is CPU inside
one heap rather than bytes on a wire, and what it buys is that step 05's silent
drift cannot survive a single frame. Section 4 of the run prints both columns:
five whole-tree re-serializations and 83 extra node walks, in exchange for
drift being structurally impossible.

## What changed since step 11

Stage C is over. Steps 07-11 varied **where the tree is drawn** — an outline
host, a recursive web adapter, React and Vue, AppKit, a terminal grid — over one
fixed `PluginController`. Stage D varies **where the plugin runs** over that same
interface, and this is the first of its three implementations.

So the delta is not against step 11's terminal host, which shares no code with
this file. It is against two earlier steps:

- **Against step 07**, which defined `PluginController` and put a
  `ScriptedController` behind it that replayed a hard-coded mutation script:
  the controller here is real. It mounts an actual React tree through step 05's
  reconciler, and `executeHandler` reaches an actual closure. `main.ts` §6 is
  `packages/host-sdk/src/controllers/main.ts` structure-for-structure — the same
  eight closure locals, the same object literal, the same `mode` branch.
- **Against step 05**, which is the plugin half, carried forward almost
  unchanged: `HandlerRegistry`, `serializeProps`, `serializeTree`,
  `MutationCollector`, `RenderBridge` and the `HostConfig` are step 05's code
  with the commentary trimmed. Diff §3 of this file against step 05 and the only
  differences are `meter` parameters. Step 05 ended by handing its mutation batch
  to a bare `subscribeMutations` callback and calling it "the `applyMutations`
  RPC, minus the RPC". This step is what that callback becomes when it is a
  controller.

New in this step:

- **`createMainController`** — the real one, distilled, including the full-tree
  backstop and the `unmount()` on disconnect.
- **An instrumented seam.** A `Boundary` class whose `cross()` is the single
  point where a payload changes hands; the main-thread one returns the identical
  object. A `SeamMeter` counting commits, mutations, nodes serialized, whole-tree
  walks, index rebuilds and notifications. A patched global `JSON.stringify`
  that counts calls inside an armed window.
- **A hop trace with real timestamps**, and the plugin closure's own captured
  stack, showing the host's frame still on it.
- **A second controller, `createMainControllerFromSource`**, which takes a
  12-line framework-free `PluginSource` instead of a React `ComponentType`, and a
  real Solid plugin (`createSignal` / `createRenderEffect`) driven through it —
  finding 1, demonstrated rather than asserted.
- **A structured-clone-safety probe**: the same prop bag seen three ways, on the
  main thread, through `structuredClone`, and through JSON.

## How Uniview really does it

The backstop, verbatim. Read `subscribeMutations` and `subscribe` as one thing:
the delta is applied to `mutableTree` and every subscriber is notified — and then
the whole tree is re-serialized, `mutableTree.init(...)` replaces the result, and
every subscriber is notified again. Two fan-outs per commit, by design.

```typescript
      if (mode === "incremental") {
        mutationCollector = new MutationCollector(handlerRegistry);
        bridge.mutationCollector = mutationCollector;

        bridge.subscribeMutations((mutations: Mutation[]) => {
          tree = mutableTree.applyMutations(mutations);
          subscribers.forEach((cb) => void cb(tree));
        });

        bridge.subscribe(() => {
          if (!bridge || !handlerRegistry) return;
          tree = serializeTree(
            bridge.rootInstance,
            handlerRegistry,
          ) as UINode | null;
          mutableTree.init(tree);
          subscribers.forEach((cb) => void cb(tree));
        });
```

[packages/host-sdk/src/controllers/main.ts:48](../../packages/host-sdk/src/controllers/main.ts#L48)
(lines 48-65)

The same branch in the runtime that *does* have a boundary. It subscribes to
mutations only — no `bridge.subscribe`, no `serializeTree`, no re-seed:

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

      } else {
```

[packages/react-runtime/src/runtime.ts:150](../../packages/react-runtime/src/runtime.ts#L150)
(lines 150-161). Same author, same mode name, opposite decision — because in one
of them "re-serialize the whole tree" costs CPU and in the other it costs the
whole UI on the wire.

And the import block that finding 1 is about, from a package whose own
`package.json` describes it as the "Framework-agnostic host SDK for the Uniview
plugin system":

```typescript
import type { ComponentType, ReactElement } from "react";
import { createElement } from "react";
import type { UINode, JSONValue, HandlerId, Mutation } from "@uniview/protocol";
import type { PluginController, HostMode } from "../types";
import {
  createRenderBridge,
  render,
  unmount,
  serializeTree,
  HandlerRegistry,
  MutationCollector,
} from "@uniview/react-renderer";
```

[packages/host-sdk/src/controllers/main.ts:1](../../packages/host-sdk/src/controllers/main.ts#L1)
(lines 1-12). `@uniview/react-renderer` is listed under `dependencies` in
[packages/host-sdk/package.json](../../packages/host-sdk/package.json) — not
`peerDependencies`, not optional — while `CLAUDE.md:184` lists "NEVER couple
host-sdk to specific framework - must remain framework-agnostic" as an
anti-pattern. This is known debt, and its Stage D consequence is concrete:
[packages/solid-runtime/src/](../../packages/solid-runtime/src/) ships
`worker-entry.ts` and `ws-client-entry.ts` and no main-thread entry, so a Solid
plugin can reach a host through a Worker or a socket and cannot reach one on the
main thread. The interchangeability Stage D advertises holds for React and not
for Solid.

## What this step leaves out

- **The `initialize` handshake and `PROTOCOL_VERSION`.** The Worker and WebSocket
  controllers open with `initialize({ protocolVersion: PROTOCOL_VERSION, ... })`
  and the plugin throws on a mismatch. `createMainController` performs no
  handshake at all — there is no version check anywhere in the main-thread path,
  because plugin and host were compiled together. That assumption is exactly
  what stops being true in step 14.
  [packages/host-sdk/src/controllers/worker.ts:96](../../packages/host-sdk/src/controllers/worker.ts#L96),
  [packages/protocol/src/rpc.ts:15](../../packages/protocol/src/rpc.ts#L15)
- **The environment channel does not exist here.** `HostToPluginAPI` has
  `setEnvironment`, and both runtimes seed `setHostEnvironment(req.env)` *before*
  the first render so a plugin does not paint light and repaint dark a round trip
  later. `createMainController` has no `setEnvironment` member and never calls
  it; a main-thread host that wants dark mode must import `setHostEnvironment`
  from `@uniview/react-runtime` and call it itself, out of band. Step 15.
  [packages/react-runtime/src/runtime.ts:138](../../packages/react-runtime/src/runtime.ts#L138),
  [packages/protocol/src/environment.ts:1](../../packages/protocol/src/environment.ts#L1)
- **Global error capture.** The runtimes attach `error` and `unhandledrejection`
  listeners to the plugin's global scope and forward everything to the host's
  `reportError` RPC. The main controller only wires `bridge.onError` — a React
  render/commit error is reported, a `setTimeout` that throws inside the plugin
  is not, and on the main thread it lands in the host's own global handler as if
  the host had thrown it.
  [packages/react-runtime/src/runtime.ts:224](../../packages/react-runtime/src/runtime.ts#L224),
  [packages/host-sdk/src/controllers/main.ts:41](../../packages/host-sdk/src/controllers/main.ts#L41)
- **Payload validation.** The controller can run Zod over every incoming tree and
  mutation batch — "Off by default: validation walks the whole payload and is not
  free." Nothing in this file validates anything, and in main-thread mode nothing
  in production does either, which is what makes §9.5's `Date` / `Map` / `NaN`
  probe a real hazard rather than a curiosity.
  [packages/host-sdk/src/validate.ts:15](../../packages/host-sdk/src/validate.ts#L15)
- **`flushSyncFromReconciler` is the harness, not the product.** The real
  `executeHandler` is one line: `await handlerRegistry.execute(handlerId, ...)`.
  This file wraps that call (and `render`) in the reconciler's synchronous flush
  because `learn/` has no browser scheduler to commit against — step 05's
  `renderInto` does the same. It does not make anything synchronous that was not:
  `handler(...args)` is a direct call either way. It does mean the timings in
  §9.2 are "one commit, start to finish" rather than "what React would have
  scheduled".
  [packages/host-sdk/src/controllers/main.ts:110](../../packages/host-sdk/src/controllers/main.ts#L110)
- **`Boundary`, `SeamMeter` and the `JSON.stringify` patch are invented.** There
  is no such instrumentation in `host-sdk`. The nearest real thing is
  `@uniview/react-runtime`'s `debug` flag, which admits its own cost — "Costs an
  extra JSON.stringify of every payload per update — keep off in production" —
  and only counts `bytesSent` / `messagesSent`.
  [packages/react-runtime/src/runtime.ts:33](../../packages/react-runtime/src/runtime.ts#L33)
- **`fullTreeBackstop` is a knob this file added.** `MainControllerOptions`
  upstream is `{ App, initialProps?, mode? }`. In the real code the backstop is
  unconditional in incremental mode, so `fullTreeBackstop: true` is the faithful
  setting and the `false` column exists only to price it.
  [packages/host-sdk/src/controllers/main.ts:15](../../packages/host-sdk/src/controllers/main.ts#L15)
- **`PluginSource` does not exist in the repository.** §7 is what a decoupled
  constructor would look like, not what is there. Nothing in Uniview today
  implements it, and adopting it would mean moving `createElement`/`render`/
  `MutationCollector` out of `host-sdk` and into a React adapter package.
- **The Solid plugin is not step 06's renderer.** §10 uses real Solid reactivity
  (`createSignal`, `createRenderEffect`) but hand-builds its three `UINode`s
  instead of going through the universal renderer's ten primitives. Its only job
  is to be genuinely not-React so that §9.6's question has an answer; step 06 is
  the real Solid renderer and `packages/solid-renderer` is the production one.
- **`serializeProps` is step 04's trimmed copy.** The real one warns on nested
  functions inside object props and carries a cycle guard; neither says anything
  new here.
  [packages/react-renderer/src/serialization/serialize-props.ts](../../packages/react-renderer/src/serialization/serialize-props.ts)
- **One host, and a toy one.** The host in §8 is step 07's outline host with the
  second host removed. It re-renders the whole string tree on every notification
  rather than patching in place — which is why the "host re-renders" row in §9.4
  is a fair count of notifications and a wild overstatement of real work. Steps
  08-11 are the real hosts.

## Trade-offs

- **No serialization at all** means object identity survives the seam: the host's
  tree *is* the plugin's tree (`controller.getTree() === hostTree` prints `true`),
  a mutation batch is applied by reference, and a 22-node mount costs 0 bytes
  instead of 1786. The cost is that the plugin can no longer be isolated: a
  plugin that blocks blocks the host, a plugin that leaks leaks into the host's
  heap, and a plugin that throws in a timer throws in the host's global handler.
- **The full-tree backstop** buys drift-proofing that step 05 could only offer as
  a manual `syncTree()`: the host is re-seeded from the plugin's live instances
  on every commit, so a mis-ordered or dropped mutation cannot survive one frame.
  The cost is measured — 5 whole-tree serializations and 83 extra node walks over
  a 5-commit script, and every subscriber notified twice per commit, doing
  strictly more work than either mode alone.
- **`Promise`-returning methods in a transport that never needs them** are what
  let the host swap controllers without touching a line. The cost is a microtask
  per call for nothing: §9.2 shows the host had already re-rendered with the new
  text *before* the `await` resolved, so the promise was resolving over work that
  had finished. Genuinely synchronous host code is not expressible against this
  interface.
- **Structured-clone-safety stops being enforced.** A `Date`, a `Map` or a `NaN`
  in a prop works perfectly here, survives a Worker, and silently becomes a
  string / `{}` / `null` over a socket; a function in a prop works here, *throws*
  `DataCloneError` in a Worker, and is dropped without a word by JSON. The main
  thread is the only runtime that never disagrees with the plugin, which is
  exactly why it cannot be used to validate one.
- **Coupling the constructor to React** (finding 1) bought a main controller in
  ~150 lines with no adapter layer. The cost is that `host-sdk` — the package
  whose description is "Framework-agnostic host SDK" — hard-depends on
  `@uniview/react-renderer`, and that Solid plugins have two runtimes where React
  has three. The interface never had the problem; only the constructor does.

## Run it

```
pnpm tsx steps/12-main-thread/main.ts
```

Real output, **trimmed** from 268 lines to the 35 that carry the idea. Elided:
§1's full rendering and handler-id list, §2's prose and captured stack frames,
§3's identity check and commentary, §5's prop table and §6 in full, and all
trailing summary. Every line below is verbatim; lines were removed between them,
never altered.

§2 — one click, hop by hop. The µs column is `performance.now()` deltas, and the
two `subscriber fires` lines are finding 2 appearing in a trace: the host draws
once from the mutation batch and again from the backstop's re-serialization.

```
=== 2. One click, hop by hop, on one stack ===
  hop trace (t in µs from the click):
         0.0 µs  host       button "Refresh" clicked -> executeHandler("node-24:onClick")
        30.6 µs  controller handlerRegistry.execute — a direct call, nothing posted
       102.8 µs  plugin     closure runs: setRefreshes(n => n + 1)
       294.0 µs  controller 5 mutation(s) applied by reference
       303.2 µs  host       subscriber fires -> host re-renders
       331.6 µs  controller BACKSTOP: whole tree re-serialized, overwriting the above
       361.0 µs  host       subscriber fires -> host re-renders
       413.2 µs  controller executeHandler returned (promise still pending)
       430.1 µs  host       await resolves (nothing left to do)

  JSON.stringify calls for the whole round trip : 0
  bytes pushed across the boundary              : 0
  boundary.messages so far                      : 6   (payloads handed over BY REFERENCE)

  stack contains the host's dispatchHostEvent frame: true

  host re-rendered BEFORE the await resolved: true
  the text it already showed                : "3 open · 1 refreshes"
```

§3 — the baseline table. The first row is this step; the other two are what
steps 13 and 14 will pay for the identical payload.

```
    boundary                           bytes  stringify   µs/cross
    --------------------------------------------------------------
    main thread — no boundary              0          0       0.03
    Web Worker — structuredClone        1786          0      23.72
    WebSocket — JSON text frame         1786          1      11.43

    payload: one setRoot carrying 22 nodes / 1758 B of JSON.
```

§4 — the full-tree backstop, priced. Five interactions, two controllers,
identical final trees:

```
                                       ON (real)         OFF
  ----------------------------------------------------------
  React commits                                5           5
  mutations emitted                           20          20
  whole-tree re-serializations                 5           0
  nodes walked by those                       83           0
  subscriber notifications                    10           5

  both runs ended with the identical tree (ids aside): true
```

The lines worth staring at: `bytes pushed across the boundary: 0` next to
`1786` for the same payload one row down (that difference is the whole of
Stage D); `stack contains the host's dispatchHostEvent frame: true`, which is a
sentence no Worker controller can print; and `whole-tree re-serializations 5 / 0`,
which is a design decision someone made deliberately and which
`packages/react-runtime` makes the other way.

## Sources

- [packages/host-sdk/src/controllers/main.ts](../../packages/host-sdk/src/controllers/main.ts) —
  the file this step distils: the React coupling (lines 1-12), the full-tree
  backstop (48-65), the unmount-on-disconnect comment (84-86), `executeHandler`
  (110-113)
- [packages/host-sdk/src/types.ts](../../packages/host-sdk/src/types.ts) —
  `PluginController` and `HostMode`, the ten members Stage D implements three
  times
- [packages/host-sdk/src/index.ts](../../packages/host-sdk/src/index.ts) — the
  three controller factories a host chooses between
- [packages/host-sdk/package.json](../../packages/host-sdk/package.json) —
  "Framework-agnostic host SDK", and `@uniview/react-renderer` under
  `dependencies`
- [packages/host-sdk/src/controllers/worker.ts](../../packages/host-sdk/src/controllers/worker.ts) —
  the `initialize` handshake and `reportError` this step has no equivalent of
- [packages/host-sdk/src/validate.ts](../../packages/host-sdk/src/validate.ts) —
  optional payload validation, off by default
- [packages/react-runtime/src/runtime.ts](../../packages/react-runtime/src/runtime.ts) —
  the same incremental branch without a backstop (150-161), the `debug` stats
  hook (33, 84-88), environment seeding (138-141), global error capture (224-225)
- [packages/react-renderer/src/reconciler/bridge.ts](../../packages/react-renderer/src/reconciler/bridge.ts) —
  `RenderBridge`: two subscriber channels and `onError`, copied field for field
  into §3
- [packages/react-renderer/src/index.ts](../../packages/react-renderer/src/index.ts) —
  `render`, `unmount`, `serializeTree`, `HandlerRegistry`, `MutationCollector`:
  the exact symbols whose import couples `host-sdk` to React
- [packages/solid-runtime/src/](../../packages/solid-runtime/src/) —
  `worker-entry.ts` and `ws-client-entry.ts`, and no main-thread entry
- [packages/protocol/src/rpc.ts](../../packages/protocol/src/rpc.ts) —
  `initialize`, `setEnvironment`, `syncTree`, `reportError`
- [packages/protocol/src/environment.ts](../../packages/protocol/src/environment.ts) —
  `HostEnvironment`, the channel main-thread mode does not have
- [CLAUDE.md](../../CLAUDE.md) — line 184, "NEVER couple host-sdk to specific
  framework - must remain framework-agnostic"
- [learn/docs/05-incremental-mutations.md](./05-incremental-mutations.md) and
  [learn/steps/05-incremental-mutations/main.ts](../steps/05-incremental-mutations/main.ts) —
  the plugin half, carried forward: `MutationCollector`, `HandlerRegistry`,
  `RenderBridge`, the `HostConfig`
- [learn/docs/07-host-contract.md](./07-host-contract.md) and
  [learn/steps/07-host-contract/main.ts](../steps/07-host-contract/main.ts) —
  `PluginController`, `ComponentRegistry`, and the outline host §8 reuses
- [learn/docs/06-solid-renderer.md](./06-solid-renderer.md) — the real Solid
  renderer §10's stand-in gestures at
