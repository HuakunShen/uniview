# 13. Crossing a structured-clone boundary, and why a function prop becomes a `HandlerId`

## Why

Step 12 built the controller with nothing in the middle and ended with a table of
zeros. This is the step that puts a thread in the middle, and the reason Uniview
wants one is in `CLAUDE.md`'s runtime table: Worker mode is the row labelled
"Full sandbox — Production, untrusted plugins"
([CLAUDE.md:265](../../CLAUDE.md#L265)). A plugin you did not write should not be
able to read your host's variables, block your host's event loop, or reach into
your DOM — and `CLAUDE.md:158` forbids it from even trying ("NEVER access
`window` or `document` in plugins"). The moment you enforce that with a real
boundary, one thing becomes impossible: **a function cannot cross structured
clone.** The run below prints the actual `DataCloneError`. Every design decision
in steps 01-05 that looked fussy — a JSON-only `props` type, text as a node,
`HandlerId = string` — was made so that this step would be a measurement and not
a rewrite.

## Why this approach, and not the obvious alternative

The obvious alternative is to **send the callback**. Every RPC library on npm
advertises it, and kkrpc genuinely supports it: its worker transport reports
`remoteRefs: true`, so a function argument can be replaced by a proxy that calls
back over the channel. `CLAUDE.md` rules it out in one line —

> ❌ **NEVER** pass functions directly over RPC - use handler-registry pattern
> ([CLAUDE.md:159](../../CLAUDE.md#L159))

— and the reason is not taste. A callback proxy is a live object on both sides:
the plugin's function must be kept alive until the host drops its proxy, which
means the boundary needs a distributed garbage collector, and the host's
`UINode` stops being data. It could no longer be stored, diffed, snapshotted,
re-rendered from, or shipped to a host that has no JavaScript runtime at all —
which is step 10's AppKit host, whose Swift decoder can rebuild a string and
cannot rebuild a proxy. The handler-registry alternative costs one `Map` in the
plugin and makes the tree inert: `HandlerId` is a string, strings clone,
strings decode in Swift, and the host's only power over a callback is to send
its name back. Section 3 of the run shows the same button node failing to cross
with a function in it and succeeding with the id.

The second alternative is to **not use a Worker at all** and keep step 12's
main-thread controller for everything, since it is faster on every row of the
table. Section 5 of the run prices that choice: a plugin handler that busy-loops
for 150 ms costs the host **0 timer ticks** when the plugin is on a worker and
**every one of them** when it is not (144 versus 0 in the captured output). Step
12's own trade-off list said "a plugin that blocks blocks the host"; this step is
the receipt. You are buying isolation with ~51 µs per crossing.

The third alternative is to **send the whole tree** on every update instead of
mutations, which is exactly what `mode: "full"` still does. Step 05 argued
against it with a hypothetical about serializing 200 nodes per keystroke. Here
that hypothetical has a price tag: the mount payload is 1950 B of JSON, 1884 B of
structured clone, 2042 B once kkrpc has framed it into a message — and every
whole-tree push pays it again, across a boundary whose one-way cost is 2.3x the
copy alone.

## What changed since step 12

Step 12's `main.ts` was one file and one thread. This step is three files and
two threads:

| | step 12 | step 13 |
|---|---|---|
| plugin lives in | the host's heap | a `node:worker_threads` worker |
| `boundary.cross()` | `return payload` | `postMessage` + structured clone |
| `executeHandler` | direct call on the host's stack | an RPC round trip |
| host holds | the plugin's own node objects | clones minted on arrival |
| handshake | none | `initialize({ protocolVersion })` |
| teardown | `unmount(bridge)` by hand | `worker.terminate()` |

Concretely:

- **`steps/13-worker/protocol.ts` is new**, and is new *because* there are two
  threads. Steps 01-12 re-declared the contract inside one `main.ts`; here each
  thread loads its own module graph and the only thing they can share is a module
  of types and constants — which is exactly how the real system shares
  `@uniview/protocol`.
- **`steps/13-worker/plugin-worker.ts` is step 12 §3 moved.** The renderer half —
  `HandlerRegistry`, `serializeProps`, `serializeTree`, `MutationCollector`,
  `RenderBridge`, the `HostConfig` — is byte-for-byte step 05's code as step 12
  carried it, minus step 12's `meter` parameters and plus three `reportHop()`
  calls. Around it is `packages/react-runtime/src/runtime.ts` distilled:
  `initialize` / `updateProps` / `executeHandler` / `syncTree` / `destroy`, and
  the `assertProtocolVersion` that step 12 had no use for.
- **`createMainController` became `createWorkerController`**, distilled from
  `packages/host-sdk/src/controllers/worker.ts`. Same seven closure locals, same
  `hostAPI` literal exposed to the plugin, same three-step teardown.
- **`PluginController` did not change by one character**, and neither did
  `MutableTree` or the outline host. Both were copied from step 12 unmodified.
  That is the claim Stage D exists to make, and it is checkable by diffing.
- **`Boundary` and `SeamMeter` are gone**, replaced by a `WireMeter` that wraps
  kkrpc's `Transport` and weighs every message that actually crosses, in both
  directions, using `v8.serialize` — the same serializer `postMessage` uses.
- **One notable inversion.** Step 12 printed "host re-rendered BEFORE the await
  resolved: true" because the whole chain ran synchronously. Here nothing has
  happened when `executeHandler()` returns — and the tree is still current when
  the promise resolves, because the worker posts `applyMutations` *before* it
  returns and one channel delivers in order. Same guarantee, different mechanism.

## How Uniview really does it

The connect path, verbatim. Read it next to step 12's `connect()`: there is no
`createElement` here and no renderer import, because the plugin is a URL. What
there is instead is a handshake.

```typescript
      worker = new Worker(blobURL, { type: "module" });
      URL.revokeObjectURL(blobURL);

      const transport = workerTransport(worker);
      rpc = new RPCChannel<PluginToHostAPI, HostToPluginAPI>(transport, {
        expose: hostAPI,
      });

      connected = true;
      lastError = undefined;

      const api = rpc.getAPI();
      await api.initialize({
        protocolVersion: PROTOCOL_VERSION,
        props: initialProps,
      });
```

[packages/host-sdk/src/controllers/worker.ts:84](../../packages/host-sdk/src/controllers/worker.ts#L84)
(lines 84-99)

The other end of that handshake, and the only validation in the whole
plugin-side runtime:

```typescript
function assertProtocolVersion(protocolVersion: number): void {
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `Protocol version mismatch: host=${protocolVersion}, plugin=${PROTOCOL_VERSION}`,
    );
  }
}
```

[packages/react-runtime/src/runtime.ts:55](../../packages/react-runtime/src/runtime.ts#L55)
(lines 55-61). Section 6 of the run makes it fire on purpose and prints the real
rejection.

And the five lines the whole step turns on, written in `@uniview/protocol` long
before anything could test them:

```typescript
/**
 * Handler ID type for event callbacks
 * Format: h_<counter> or uuid
 */
export type HandlerId = string;
```

[packages/protocol/src/events.ts:1](../../packages/protocol/src/events.ts#L1)
(lines 1-5). `string`, and therefore structured-clone-safe, JSON-safe and
`Codable` in Swift. The `EventPropName` union and `handlerIdProp()` immediately
below it are what turn `onClick` into `_onClickHandlerId` on the way out.

## What this step leaves out

- **The plugin's *code* crossing a boundary.** The real `connect()` does
  `fetch(pluginUrl)` → `new Blob([...])` → `URL.createObjectURL` → `new
  Worker(blobURL, { type: "module" })`: the plugin is a script deployed
  somewhere else and downloaded at runtime, which is the whole reason
  `PROTOCOL_VERSION` can mismatch in production. Node has no blob-URL workers, so
  this step passes a module URL to `new Worker(...)` and the plugin ships with
  the host.
  [packages/host-sdk/src/controllers/worker.ts:73](../../packages/host-sdk/src/controllers/worker.ts#L73)
- **Payload validation.** `createWorkerController` takes `validate?: boolean` and
  runs Zod over every incoming tree and mutation batch when it is on —
  "the protocol Zod schemas are the source of truth for what a well-behaved
  plugin may send; a misbehaving or version-mismatched plugin can put the host
  tree into a corrupt state that surfaces far from the cause… Off by default:
  validation walks the whole payload and is not free." Nothing in this step
  validates anything, which is precisely the configuration in which a
  version-skewed plugin corrupts the host tree silently.
  [packages/host-sdk/src/validate.ts:1](../../packages/host-sdk/src/validate.ts#L1),
  [packages/host-sdk/src/controllers/worker.ts:45](../../packages/host-sdk/src/controllers/worker.ts#L45)
- **`setEnvironment`, and seeding it before the first render.** `HostToPluginAPI`
  has a `setEnvironment` member and `initialize` takes an `env` — "The machine's
  state at connect time, so the first render is already right" — because a plugin
  that discovers dark mode one round trip late paints light and repaints. This
  step's `HostToPluginAPI` omits both. Step 15.
  [packages/protocol/src/rpc.ts:15](../../packages/protocol/src/rpc.ts#L15),
  [packages/react-runtime/src/runtime.ts:138](../../packages/react-runtime/src/runtime.ts#L138)
- **Global error capture, as written.** `runtime.start()` attaches `error` and
  `unhandledrejection` listeners to the plugin's global scope and forwards
  everything to `reportError`. Both calls are guarded with `?.` — and Node's
  `globalThis` has neither method, so on this runtime the guard fires and nothing
  is attached. `plugin-worker.ts` uses `process.on("uncaughtException")` instead
  and says so in a comment; same intent, different global, and a reminder that
  "the plugin runtime" is not one environment.
  [packages/react-runtime/src/runtime.ts:224](../../packages/react-runtime/src/runtime.ts#L224)
- **A worker that dies.** Neither the real controller nor this one listens for
  the worker's own `error` / `exit`. If the plugin thread crashes outside a
  `try`, the host keeps its last tree, `getStatus()` still says
  `connected: true`, and every subsequent `executeHandler` resolves against a
  channel nobody is answering. That is a real gap in
  [packages/host-sdk/src/controllers/worker.ts](../../packages/host-sdk/src/controllers/worker.ts),
  not a simplification introduced here.
- **"Cannot touch the DOM" is asserted, not demonstrated.** In a browser, a
  Worker global genuinely has no `document` and no `window` — that is what
  `CLAUDE.md:158` is about. Under Node *neither* thread has them, so this step
  cannot show the difference and demonstrates the underlying fact instead: the
  host sets `globalThis.__hostSecret` before connecting and the plugin reports
  `undefined`. Two heaps, one of the two consequences.
- **Transferables.** kkrpc's worker transport advertises `capabilities.transfer:
  true` and its `send` forwards a transfer list, so an `ArrayBuffer` could move
  without a copy. Nothing in Uniview uses it, and a `UINode` tree cannot benefit:
  it is objects and strings, which structured clone must copy.
- **`workerTransport(worker)` needs an EventTarget.** The real call takes a
  browser `Worker`. `node:worker_threads`'s `Worker` is an EventEmitter, so
  `main.ts` §1 wraps it in a nine-line adapter mapping `addEventListener` onto
  `.on`. kkrpc, the channel, the two proxied interfaces and the clone are real;
  that adapter is not in the repository. The plugin side needed nothing —
  `parentPort` already has the shape kkrpc asks for.
- **`WireMeter`, `v8.serialize`, `echo`, `postRawToWorker` and
  `protocolVersionOverride` are invented.** The nearest real thing is
  `react-runtime`'s `debug` flag, which counts `bytesSent` / `messagesSent` and
  admits "Costs an extra JSON.stringify of every payload per update — keep off in
  production". `HostToPluginAPI` has no `echo`; a host cannot post a raw value at
  the worker, because `worker.ts` encapsulates the channel entirely.
  [packages/react-runtime/src/runtime.ts:33](../../packages/react-runtime/src/runtime.ts#L33)
- **`flushSyncFromReconciler` is the harness, not the product.** The real
  `executeHandler` is `await handlerRegistry.execute(handlerId, ...args)`; this
  file wraps it in the reconciler's synchronous flush because `learn/` has no
  browser scheduler, exactly as steps 05 and 12 do. It changes when the commit
  lands inside the call, not whether anything is a message.
  [packages/react-runtime/src/runtime.ts:197](../../packages/react-runtime/src/runtime.ts#L197)
- **One controller, one plugin, no reconnect.** No retry, no backpressure, no
  queue depth, no timeout on a plugin that never answers. `await
  api.executeHandler(...)` waits forever by construction; nothing in the real
  controller times it out either.
- **The Solid worker entry.** `packages/solid-runtime/src/worker-entry.ts` exists
  and is the mirror of the React one, which is the happy ending to step 12's
  finding 1: Solid has no main-thread controller, but it does have this. This
  step only builds the React side.
  [packages/solid-runtime/src/worker-entry.ts](../../packages/solid-runtime/src/worker-entry.ts)

## Trade-offs

- **A boundary you cannot lie across.** Step 12 noted that the main thread never
  tests the `value as JSONValue` claim `serializeProps` ends with. This one tests
  part of it, loudly: a function throws `DataCloneError` synchronously, inside
  `postMessage`, before anything is delivered. It still does *not* test the rest —
  `Date`, `Map` and `NaN` survive structured clone happily and die at step 14.
  A Worker is a stricter contract than the main thread and a weaker one than a
  socket.
- **Isolation, priced per crossing.** 51 µs one way for the 24-node mount
  payload, 94 µs round trip, 0 bytes of JSON and 0 `JSON.stringify` calls. Only
  ~44% of that is the clone itself (22 µs in-process); the rest is thread wake
  and dispatch, which means small frequent messages are the expensive pattern and
  step 05's batching matters more here than anywhere.
- **The host's event loop stops being the plugin's.** 144 host timer ticks
  survived a 150 ms plugin busy-loop that would have eaten all of them on the
  main thread. The same wall gives up step 12's best property: no shared stack,
  so no single debugger session, no `console.log` from the plugin that lands in
  the host's own console (that is what the `log` RPC is for), and no synchronous
  anything, ever.
- **Teardown got simpler and more brutal.** Step 12's `disconnect()` had to
  `unmount(bridge)` by hand or leak "live effects/timers directly into the host".
  Here `worker.terminate()` throws away the entire global — React tree, handler
  registry, timers, listeners. You lose the ability to tear down gracefully; a
  handler mid-flight is simply gone.
- **A handshake, and everything it implies.** `initialize({ protocolVersion })`
  is the first message on the channel and can fail, which means `connect()` can
  now reject for reasons that have nothing to do with the host. That is the cost
  of a plugin being a separately-shipped artifact — and the beginning of every
  problem step 14 has to solve at a larger scale.

## Run it

```
pnpm tsx steps/13-worker/main.ts
```

Real output, **trimmed** from 262 lines to the 46 below. Elided: §1's full
rendering and handler-id list, most explanatory prose, §4's per-method wire
table, and §7's summary. Every line is verbatim; lines were removed between
them, never altered.

§1 — the handshake. The gap between the first two rows is Node starting a thread
and `tsx` compiling `plugin-worker.ts` on it; the `initialize` message waits in
the port's queue meanwhile.

```
  after  connect: {"mode":"worker","connected":true}
  JSON.stringify calls during connect()   : 0
  messages across the thread boundary     : 10
  bytes across it (structured-clone form) : 3263

  the handshake, in the order it happened (t in ms from `new Worker(...)`):
         0.0 ms  wire       -> initialize posted (structured clone)
       111.6 ms  plugin     initialize(protocolVersion=3) accepted (isMainThread=false, threadId=1)
       116.7 ms  plugin     2 mutation(s) collected -> applyMutations (postMessage)
       116.9 ms  wire       <- applyMutations arrived on the main thread
       117.0 ms  host       subscriber fires -> host re-renders
       117.4 ms  wire       <- initialize (reply) arrived on the main thread

  the plugin's view of the host's global: globalThis.__hostSecret = undefined
  the host's own view                   : globalThis.__hostSecret = "host-only"
```

§2 — the whole step in five lines. The first is what happens without step 04;
the rest is what step 04 bought.

```
  posting the node with its onClick still a function:
    worker.postMessage({ props: { onClick: () => {} } })
    -> DataCloneError: ()=>{} could not be cloned.

  the same node as the plugin actually serialized it:
    <button#node-12 title="refresh" _onClickHandlerId="node-12:onClick">
      #text#text-9 "Refresh"

  and the same node sent to the worker and back over the real channel:
    JSON.stringify calls on the way      : 0
    handler prop survived as             : "node-12:onClick"
```

§3 — one click, hop by hop. The `plugin` rows are timestamped by the worker's own
clock (both threads share a `performance.timeOrigin` because they share a
process).

```
          0.0 µs  host       button "Refresh" clicked -> executeHandler("node-12:onClick")
         43.2 µs  controller rpc.getAPI().executeHandler(...) — returns a pending promise
         89.2 µs  wire       -> executeHandler posted (structured clone)
        109.8 µs  plugin     executeHandler("node-12:onClick") arrived on the worker thread
        173.6 µs  plugin     closure runs: setRefreshes(n => n + 1)
        353.8 µs  plugin     6 mutation(s) collected -> applyMutations (postMessage)
        386.8 µs  plugin     executeHandler returning — reply message posted after the mutations
        388.5 µs  wire       <- applyMutations arrived on the main thread
        396.6 µs  host       subscriber fires -> host re-renders
        446.8 µs  wire       <- executeHandler (reply) arrived on the main thread
        452.5 µs  host       await resolves

  JSON.stringify calls for the whole round trip : 0
  host re-renders when executeHandler() RETURNED: 0
  host re-renders when the await RESOLVED       : 1

  stack contains the host's dispatchHostEvent frame: false
```

§4 — step 12's boundary table with the Worker rows measured. Rows 1 and 4 are
step 12's counterfactuals recomputed on this payload so all four are comparable;
step 12's own payload was one button smaller (22 nodes / 1758 B) and it estimated
the Worker at 1786 B / 23.72 µs by cloning in-process, which is row 2 here.

```
    boundary                               bytes    v8 B  stringify   µs/cross
    --------------------------------------------------------------------------
    main thread — no boundary                  0       0          0       0.05
    Web Worker — structuredClone (copy)     1950    1884          0      22.33
    Web Worker — real thread hop (kkrpc)    2116    2042          0      51.27
    WebSocket — JSON text frame             1950       —          1      10.06

    payload: one setRoot carrying 24 nodes / 1950 B of JSON.
```

§5 and §6 — what the boundary bought, and the message step 12 never had to send.

```
  a handler that busy-loops for 150 ms:
                                        elapsed ms  host ticks
    ----------------------------------------------------------
    plugin in the worker (step 13)             151         144
    same loop on the main thread (12)          150           0

  host claims protocolVersion=2, plugin is built against 3:
    connect() -> Error: Protocol version mismatch: host=2, plugin=3

  live worker/port handles after teardown: none
```

The lines worth staring at: `DataCloneError: ()=>{} could not be cloned.` next to
`handler prop survived as "node-12:onClick"` — that pair is why
`HandlerId = string`; `stack contains the host's dispatchHostEvent frame: false`,
which is step 12's `true` inverted and is the sandbox in one boolean; and
`144` versus `0` host timer ticks, which is what the microseconds bought.

## Sources

- [packages/host-sdk/src/controllers/worker.ts](../../packages/host-sdk/src/controllers/worker.ts) —
  the file this step distils: the fetch/blob/Worker construction and the
  `initialize` handshake (73-99), the `hostAPI` the plugin calls back on (43-69),
  optional validation (19, 45-57), the three-step teardown (102-118)
- [packages/host-sdk/src/types.ts](../../packages/host-sdk/src/types.ts) —
  `PluginController` and `HostMode`, unchanged from step 12
- [packages/host-sdk/src/index.ts](../../packages/host-sdk/src/index.ts) — the
  three controller factories a host chooses between
- [packages/host-sdk/src/validate.ts](../../packages/host-sdk/src/validate.ts) —
  optional Zod validation of plugin → host messages, off by default
- [packages/host-sdk/src/mutable-tree.ts](../../packages/host-sdk/src/mutable-tree.ts) —
  `MutableTree`, which needed no change to consume clones instead of references
- [packages/react-runtime/src/worker-entry.ts](../../packages/react-runtime/src/worker-entry.ts) —
  `startWorkerPlugin`: `workerSelfTransport()`, one `RPCChannel`, `start()`
- [packages/react-runtime/src/runtime.ts](../../packages/react-runtime/src/runtime.ts) —
  the plugin-side API: `assertProtocolVersion` (55-61), `initialize` and the
  environment seed (134-141), the incremental branch with no full-tree backstop
  (150-159), `executeHandler` (197-200), `syncTree` (202-212), global error
  capture (224-225), the `debug` stats hook (33, 84-88)
- [packages/protocol/src/rpc.ts](../../packages/protocol/src/rpc.ts) —
  `HostToPluginAPI` and `PluginToHostAPI`, the two interfaces kkrpc proxies in
  opposite directions over one channel
- [packages/protocol/src/events.ts](../../packages/protocol/src/events.ts) —
  `HandlerId = string`, `EventPropName`, `handlerIdProp`, `isHandlerIdProp`
- [packages/protocol/src/version.ts](../../packages/protocol/src/version.ts) —
  `PROTOCOL_VERSION = 3` and what v3 changed
- [packages/solid-runtime/src/worker-entry.ts](../../packages/solid-runtime/src/worker-entry.ts) —
  the same entry point for a Solid plugin; step 12's finding 1, resolved for this
  runtime and not for the main thread
- [CLAUDE.md](../../CLAUDE.md) — line 159 ("NEVER pass functions directly over
  RPC - use handler-registry pattern"), line 158 (no `window`/`document` in
  plugins), line 265 (the Worker row: "Full sandbox — Production, untrusted
  plugins")
- [learn/docs/04-serializing-the-tree.md](./04-serializing-the-tree.md) and
  [learn/steps/04-serializing-the-tree/main.ts](../steps/04-serializing-the-tree/main.ts) —
  where a function prop first became a `HandlerId`
- [learn/docs/05-incremental-mutations.md](./05-incremental-mutations.md) and
  [learn/steps/05-incremental-mutations/main.ts](../steps/05-incremental-mutations/main.ts) —
  the renderer half `plugin-worker.ts` carries forward
- [learn/docs/12-main-thread.md](./12-main-thread.md) and
  [learn/steps/12-main-thread/main.ts](../steps/12-main-thread/main.ts) — the
  baseline this step's table extends, and the host and `MutableTree` it reuses
  unchanged
