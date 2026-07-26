# 14. The plugin in another process, over a socket

## Why

Stage D's promise is that one plugin runs in three places without changing. Step
12 proved the seam by deleting the boundary, step 13 by making it a structured
clone. Both of those are *inside one process*: the peer is alive by construction,
every message arrives, and the only way a call fails is that it threw. This step
puts the plugin behind a TCP connection, which is the configuration Uniview
actually ships for server-side plugins — `packages/react-runtime`'s
`connectToHostServer`, `packages/host-sdk`'s `createWebSocketController`, and the
`examples/bridge-server` that pairs them — and it is the configuration where the
boundary stops being a performance detail and becomes the architecture.

Two things change and neither is a matter of degree. Everything is now **text**:
only what survives `JSON.parse(JSON.stringify(x))` exists, which is why step 04's
`HandlerId` indirection is load-bearing rather than defensive — `JSON.stringify`
drops a function property without an error, where structured clone at least
throws. And the peer can **disappear**: mid-session, mid-batch, and without
telling anyone. `PluginToHostAPI.applyMutations` is fire-and-forget by design, so
a batch that is never delivered produces no error anywhere in the system; the
host simply keeps rendering something that stopped being true. That is why
`HostToPluginAPI.syncTree` exists with the doc comment "Used for recovery from
drift", and this step is the first one in which that sentence can be demonstrated
instead of asserted.

## Why this approach, and not the obvious alternative

**The obvious alternative is full-tree mode.** It is the default —
`UpdateMode` defaults to `"full"` in both
[`react-runtime/src/runtime.ts:70`](../../packages/react-runtime/src/runtime.ts#L70)
and
[`ws-client.ts:49`](../../packages/react-runtime/src/ws-client.ts#L49) — and it
is far simpler: serialize the whole tree after every commit, send it, and the
host does `mutableTree.init(newTree)`. No mutation ordering, no drift, no
`insertBefore` anchor that can be missing. Step 05 argued against it on CPU
grounds. Over a socket the argument stops being about CPU.

The example measures both, on the same machine, in the same run:

```
    boundary                                   bytes  stringify    µs/cross
    -----------------------------------------------------------------------
    main thread — no boundary (step 12)            0          0        0.03
    Web Worker — structuredClone (step 13)      1988          0       24.52
    WebSocket — JSON encode/decode only         1988          1       11.09
    WebSocket — REAL socket, 127.0.0.1          2083          4      257.22
```

A whole-tree update for a 24-node panel is ~2 kB and ~257 µs on **loopback** —
no TLS, no network, no bridge process in the middle, all of which a real
deployment adds. One interaction's incremental batch, captured off the wire in
the same run, is 528 B. On a keystroke-rate input the difference is the
difference between a usable plugin and an unusable one, and it is why
`react-runtime`'s incremental branch subscribes to mutations **only** —

```ts
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
(lines 150-160)

— where the main-thread controller subscribes to both channels and re-serializes
the entire tree on every commit as a backstop
([controllers/main.ts:57-65](../../packages/host-sdk/src/controllers/main.ts#L57);
step 12's finding 2). The main-thread controller can buy drift-immunity with CPU
inside one heap. This transport cannot: the same code would mean putting the
whole UI on the wire on every keystroke.

**A second alternative is "just retry the failed sends".** It is what most
reconnect wrappers do, and it is wrong here for a reason section 6 of the example
demonstrates with a real captured frame: a mutation batch is *relative to a tree
state*. Replaying one after a gap does not restore the missing update, it applies
a stale one — the example replays a real `setText` frame and watches the host's
label go from `"3 open · 4 refreshes"` back to `"3 open · 1 refreshes"`, silently.
`applyMutations(mutations: Mutation[])` carries no sequence number
([rpc.ts:74](../../packages/protocol/src/rpc.ts#L74)), so no JS host can detect
this. The AppKit host can, because
[`ShadowTree.apply(batch)`](../../packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift)
takes a revisioned `CommitBatch` and returns `false` when
`batch.revision <= revision` (step 10). The correct recovery is not replay, it is
a full resend: `syncTree`.

**A third alternative is to let the host dial the plugin directly.** Uniview
deliberately does not: server-side plugins connect *to* a bridge, because
"[server-side plugins] connect _to_ the bridge instead of the host connecting to
each plugin, which sidesteps port/NAT issues and keeps deployment to one stable
address" ([examples/bridge-server/README.md](../../examples/bridge-server/README.md)).
This step's example collapses the bridge into the host — the host is the server,
the plugin dials it — so that one runnable file can show both ends. Everything
that makes the seam interesting is unchanged by that collapse; what it costs is
listed under "What this step leaves out".

## What changed since step 13

Step 13 crossed a structured-clone boundary between a page and a Worker. This
step crosses a socket between two operating-system processes. The delta, in the
order a reader will meet it:

1. **A second process, not a second thread.** `main.ts` calls
   `child_process.fork("plugin-process.ts")`. The example prints both PIDs and
   asserts they differ. The plugin has its own V8 heap, its own React copy, its
   own module registry and its own event loop; there is no `postMessage`, no
   shared `SharedArrayBuffer`, and no way to hand over an object.

2. **The payload is text, not an object graph.** Step 13's boundary preserved
   `Date`, `Map`, `Set` and `NaN`, and *threw* on a function. JSON preserves none
   of them and drops a function without a word. The `_onClickHandlerId` string
   convention from step 04 is what makes event handling survive at all.

3. **Frames, ids, and a response for every call.** Steps 12 and 13 could call a
   method; this step has to write `{"t":"q","id":"3","op":"call","p":["executeHandler"],"a":[...]}`
   into a socket and match a `{"t":"r","id":"3"}` back. That shape is kkrpc's
   compact record format, and the frames are newline-terminated because the real
   bridge normalizes them that way
   ([bridge.ts:54-59](../../examples/bridge-server/src/bridge.ts#L54)).

4. **`executeHandler`'s Promise finally means something.** Step 12 showed the
   host re-rendering *before* the `await` resolved: the uniformity of the
   `Promise` return was a tax that transport did not need. Here the trace is
   ~1.4 ms end to end across two processes, and every hop in it is real:

   ```
          0.0 µs  host       button "Refresh" clicked -> executeHandler("node-11:onClick")
         17.6 µs  controller -> executeHandler(...) written to the socket
        186.5 µs  plugin     executeHandler("node-11:onClick") dispatched in PID 244846
        213.1 µs  plugin     closure runs: setRefreshes(n => n + 1)
       1024.4 µs  plugin     emit applyMutations(6) -> wire
       1142.6 µs  host       applyMutations(6) -> MutableTree
       1403.3 µs  host       await resolves (the response frame came back)
   ```

   Step 12 proved zero-boundary by capturing a stack *inside* the plugin's
   closure and finding the host's `dispatchHostEvent` frame in it. That boolean
   is necessarily `false` here — the frame is in another process image.

5. **A whole new failure class.** The connection can drop mid-session, frames can
   be lost, re-delivered or reordered, and latency is user-visible. Section 5 of
   the example cuts the socket for real (`ws.terminate()`, no closing handshake)
   while the plugin has three pending re-renders of its own, refuses connections
   for 400 ms, and then lets the plugin's reconnect loop back in. The plugin
   reports three mutation frames it could not send; the host is showing
   `"3 open · 1 refreshes"` while the plugin's own buffered log lines say it is
   at `"3 open · 4 refreshes"`. One `syncTree()` closes the gap.

6. **Fire-and-forget is no longer free.** `wire.call(...)` returns a promise that
   *rejects* when the socket dies with the call in flight. The first draft of
   `plugin-process.ts` used `void wire.call(...)`, and the plugin process exited
   with code 1 in the middle of section 5 on an unhandled rejection. Every
   outbound call in the finished file attaches a `catch`, with a comment saying
   why. A `postMessage` cannot produce that crash.

Everything *else* is deliberately identical to step 12 so the two can be diffed:
the same `HostConfig`, the same `MutationCollector`, the same `HandlerRegistry`,
the same `MutableTree`, the same `TicketPanel` (plus one extra button), and the
same ten-member `PluginController`.

> **Note on ordering.** At the time this step was written, `steps/13-worker/` did
> not yet exist. The `Web Worker — structuredClone` row in the table above is
> therefore measured by this step's own code — the same `structuredClone`
> counterfactual step 12 printed — rather than lifted from step 13's run. When
> step 13 lands, its numbers replace that row; the shape of the comparison is
> unchanged.

## How Uniview really does it

The host's half of the contract. Note that these three lines are the *entire*
difference between the two update modes as far as the host is concerned, and note
what is not here: no sequence number, no acknowledgement, no way to notice a
batch that never arrived.

```ts
  const hostAPI: PluginToHostAPI = {
    updateTree(newTree: UINode | null) {
      if (validate) {
        const err = validateIncomingTree(newTree);
        if (err) reportValidation(err);
      }
      tree = newTree;
      mutableTree.init(newTree);
      subscribers.forEach((cb) => void cb(tree));
    },
    applyMutations(mutations: Mutation[]) {
      if (validate) {
        const err = validateIncomingMutations(mutations);
        if (err) reportValidation(err);
      }
      tree = mutableTree.applyMutations(mutations);
      subscribers.forEach((cb) => void cb(tree));
    },
```

[packages/host-sdk/src/controllers/websocket.ts:45](../../packages/host-sdk/src/controllers/websocket.ts#L45)
(lines 45-62)

The plugin's reconnect loop — the piece with no counterpart in `worker.ts`,
because a Worker either exists or does not:

```ts
    ws.addEventListener("close", (event) => {
      if (closed) return;

      console.log(
        `[Plugin:${pluginId}] Connection closed (code: ${event.code}, reason: ${event.reason || "none"})`,
      );
      runtime?.stop();
      runtime = null;

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(
          `[Plugin:${pluginId}] Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttempts})...`,
        );
        setTimeout(connect, reconnectDelay);
      } else {
```

[packages/react-runtime/src/ws-client.ts:73](../../packages/react-runtime/src/ws-client.ts#L73)
(lines 73-88)

And the protocol member that exists only because of this transport. It is the
only entry on `HostToPluginAPI` whose doc comment names a failure:

```ts
  /**
   * Request plugin to send current full tree
   * Used for recovery from drift or explicit sync request
   */
  syncTree(): Promise<void>;
```

[packages/protocol/src/rpc.ts:50](../../packages/protocol/src/rpc.ts#L50)
(lines 50-54)

## What this step leaves out

**The bridge is a whole process this example does not have.** Upstream, both ends
are WebSocket *clients* of
[`examples/bridge-server/src/bridge.ts`](../../examples/bridge-server/src/bridge.ts),
which pairs `/plugins/:pluginId` with `/host/:pluginId` and forwards bytes. This
example collapses it into the host. Specifically missing:

- **Protocol-level ping/pong heartbeat.** The bridge pings every socket on an
  interval and terminates any that stops ponging, "so half-open TCP connections
  can't linger for hours serving a ghost UI (there was previously no keepalive at
  all)" — `heartbeatIntervalMs` defaults to 30 s, `heartbeatTimeoutMs` to 75 s
  ([bridge.ts:237-253](../../examples/bridge-server/src/bridge.ts#L237)). This
  example's cut is instantaneous and observed immediately; a real half-open
  socket is not.
- **Late plugins, and buffered host messages.** A host that connects before its
  plugin waits `hostWaitMs` (15 s) instead of being rejected, and its messages
  are buffered up to `maxBufferedHostMessages` (200) and flushed when the plugin
  arrives — added because "a host's initialize() sent before its plugin
  registered was silently dropped, hanging the host forever even after the plugin
  arrived" ([bridge.ts:174-183](../../examples/bridge-server/src/bridge.ts#L174)
  and [bridge.ts:198-208](../../examples/bridge-server/src/bridge.ts#L198)).
- **Session routing by `pluginId`, and connection replacement.** One `Connection`
  record per plugin id, and a second plugin claiming the same id closes the first
  with code 1000 ([bridge.ts:141-147](../../examples/bridge-server/src/bridge.ts#L141)).
  This example's `PluginEndpoint` tracks exactly one socket and does no routing.
- **Serving plugin bundles over HTTP** from `pluginDirs`
  ([bridge.ts:127-130](../../examples/bridge-server/src/bridge.ts#L127)).

**Auth is missing from the real bridge too, and that is worth saying plainly.**
The brief for this step said the bridge does "auth"; it does not. `fetch()`
upgrades any request whose path is `/plugins/:id` or `/host/:id` with no token,
no origin check and no `pluginId` allow-list, and `AGENTS.md` states the design
intent — "**NEVER** add business logic here - keep it as a transparent proxy"
([examples/bridge-server/AGENTS.md](../../examples/bridge-server/AGENTS.md)).
So authentication is not simplified away by this step; it is absent upstream, and
anyone deploying the bridge on anything but loopback has to add it somewhere else.

**kkrpc does the real framing.** `WireLink` in `protocol.ts` is ~120 lines that
mirror kkrpc's request/response records. The real
[`RPCChannel`](../../packages/host-sdk/src/controllers/websocket.ts#L79) also
does callback arguments, remote references, async-iterator streaming, pluggable
codecs (superjson), transferables, and W3C trace-context propagation. Reproducing
any of it would have buried the one idea this step is about.

**The host never notices the socket died.** The real
`createWebSocketController` registers no `close` handler anywhere in the file:
`connected` is set `true` in `connect()`
([websocket.ts:83](../../packages/host-sdk/src/controllers/websocket.ts#L83)) and
is only ever set `false` by an explicit `disconnect()`. A host that lost its
plugin therefore reports `{ mode: "websocket", connected: true }` indefinitely,
and there is no reconnect logic on the host side to match `ws-client.ts`'s. This
example adds a `close` handler so `getStatus()` stops lying — that is an
addition, not a distillation, and it is flagged in the source.

**The real client tears the runtime down on disconnect; this one does not.**
`ws-client.ts:79-80` calls `runtime.stop()` in the `close` handler, which
unmounts the React tree, and `ws-client.ts:99-106` builds a *fresh* runtime on
reconnect. Combined with the previous point that leaves a real gap: after a
plugin reconnects upstream, the host does not re-`initialize`, so the new runtime
has no tree and the host's `syncTree()` would find `bridge` null and return
without sending anything
([runtime.ts:202-203](../../packages/react-runtime/src/runtime.ts#L202)).
`plugin-process.ts` deliberately keeps the tree mounted instead, because the
state `syncTree` was written to repair is precisely "the plugin kept rendering
while nobody was listening". The deviation is flagged in that file's header.

**Validation is off.** Both real controllers accept `validate?: boolean` and run
the protocol's Zod schemas over every incoming payload when it is on, but it is
off by default because "validation walks the whole payload and is not free"
([packages/host-sdk/src/validate.ts](../../packages/host-sdk/src/validate.ts)).
This example does not validate at all; every `Mutation[]` it applies is a
`JSON.parse` result that TypeScript has simply been told to believe.

**`setEnvironment` and `initialize`'s `env` are step 15's.**
`HostToPluginAPI.initialize` takes `env?: Partial<HostEnvironment>` so "the
machine's state at connect time" seeds the first render
([rpc.ts:15-20](../../packages/protocol/src/rpc.ts#L15)), and neither real
controller passes it. Dark mode, reduced motion and hover are exactly the things
that must not round-trip over this transport, which is why they get their own
step.

**Backpressure, ordering across reconnects, and message size limits.** Nothing
here bounds the outbound queue, chunks a large `updateTree`, or reasons about
what happens when a batch is written into a socket whose peer is about to vanish
— which the example does hit for real: during the blackout the plugin completes a
WebSocket handshake three times and has each connection terminated a millisecond
later, and every byte written into those sockets is lost. Its outbox is emptied
only after a *response* proves the peer is there, and it buffers log lines only —
never mutation batches, for the reason given above.

## Trade-offs

- **The plugin can be anywhere — another process, another runtime (Node/Deno/Bun),
  another machine — and its source does not change.** `plugin-process.ts` is
  step 12's renderer with a socket bolted on outside it. That is the entire
  point of Stage D, and it is bought by never letting a non-JSON value or a live
  function into the protocol in the first place.
- **The cost is roughly four orders of magnitude.** 0.03 µs to hand over a tree
  by reference; 257 µs to move the same tree across loopback with framing. Add
  TLS, a bridge hop and real network and it grows again. That buys process
  isolation: a plugin that crashes, leaks or spins does not take the host with
  it, and this example's plugin genuinely exits with its own code.
- **Every debugging tool now works, and every debugging habit stops working.**
  The frames are printable text you can `tcpdump`, diff and replay — the example
  prints one in full. But you cannot set a breakpoint that spans the boundary,
  object identity across the seam is not even expressible, and a stack trace ends
  at the socket.
- **`syncTree` makes drift recoverable but not detectable.** A full resend repairs
  any divergence, and the example shows it doing so. Nothing tells the host *when*
  to call it: there is no sequence number, no heartbeat on the payload channel,
  and no acknowledgement. In practice hosts call it on reconnect and hope.
- **Incremental mode stops being optional and starts being load-bearing** — and
  so does prop stability. The example's click batch is `setProps×5, setText×1` in
  528 B, of which only the `setText` is a real change; the five `setProps` are
  React re-emitting identical props because `TicketPanel` passes inline object
  literals and `commitUpdate` fires on identity. On the main thread that is
  invisible. Over a socket it is ~400 wasted bytes per interaction, forever.

## Run it

```
pnpm tsx steps/14-websocket/main.ts
```

Real output, **trimmed** from 245 lines to the ~70 that carry the ideas. Elided:
§1's full 40-line rendering and handler-id list, §3's prose, §4's commentary,
§5's post-recovery rendering and prose, and §6/§7's prose. Every line below is
verbatim from one run; lines were removed between them, never altered. PIDs, the
ephemeral port and all timings differ per run.

§1 — two processes, one socket:

```
=== 1. A real socket, a real second process ===
  ws server        : ws://127.0.0.1:41135/plugins/tickets
  host process pid : 244839
  plugin process   : pid 244846 (fork of plugin-process.ts)
  same process?    : false

  before connect: {"mode":"websocket","connected":false}
    [Plugin WS info] plugin process online: pid=244846 node=v25.2.1 connection #1 to ws://127.0.0.1:41135/plugins/tickets
  after  connect: {"mode":"websocket","connected":true}

  the UINode the host rebuilt out of text (first 6 lines):
    <column#node-13 gap=8 padding=16>
      <heading#node-0 level=2>
        #text#text-0 "Open tickets"
      <label#node-1 id="status">
        #text#text-1 "3 open · 0 refreshes"
      <row#node-4 gap=4>

  bytes on the wire for connect(): 149 out / 2229 in over 6 frames
```

§2 and §3 — one click, hop by hop across two processes, and the frames it
produced:

```
=== 2. One click, hop by hop, across two processes ===
  hop trace (t in µs from the click; host and plugin clocks merged):
          0.0 µs  host       button "Refresh" clicked -> executeHandler("node-11:onClick")
         17.6 µs  controller -> executeHandler(...) written to the socket
        186.5 µs  plugin     executeHandler("node-11:onClick") dispatched in PID 244846
        213.1 µs  plugin     closure runs: setRefreshes(n => n + 1)
       1024.4 µs  plugin     emit applyMutations(6) -> wire
       1142.6 µs  host       applyMutations(6) -> MutableTree
       1403.3 µs  host       await resolves (the response frame came back)

  round trip, host clock: 1402.1 µs

=== 3. The frames, as they actually went over the wire ===
    host ->    81 B  {"t":"q","id":"3","op":"call","p":["executeHandler"],"a":["node-11:onClick",[]]}
    host <-   528 B  {"t":"q","id":"3","op":"call","p":["applyMutations"],"a":[[{"type":"setProps","nodeId":"node-0","pro… (+426 chars)
    host ->    19 B  {"t":"r","id":"3"}
    host <-    19 B  {"t":"r","id":"3"}

  that batch, by kind: setProps×5, setText×1 in 528 B

  and that frame in full, wrapped, because it is the whole protocol:
    {"t":"q","id":"3","op":"call","p":["applyMutations"],"a":[[{"type":"setProps","nodeId":"node-0",
    "props":{"level":2}},{"type":"setText","nodeId":"text-1","text":"3 open · 1 refreshes"},{"type":
    "setProps","nodeId":"node-1","props":{"id":"status"}},{"type":"setProps","nodeId":"node-11","pro
    ps":{"title":"refresh","_onClickHandlerId":"node-11:onClick"}},{"type":"setProps","nodeId":"node
    -12","props":{"title":"burst","_onClickHandlerId":"node-12:onClick"}},{"type":"setProps","nodeId
    ":"node-13","props":{"gap":8,"padding":16}}]]}
```

§4 — the boundary table, three in-process rows and one real socket:

```
=== 4. The boundary table, extended with a measured socket ===
    boundary                                   bytes  stringify    µs/cross
    -----------------------------------------------------------------------
    main thread — no boundary (step 12)            0          0        0.03
    Web Worker — structuredClone (step 13)      1988          0       24.52
    WebSocket — JSON encode/decode only         1988          1       11.09
    WebSocket — REAL socket, 127.0.0.1          2083          4      257.22

    payload: one setRoot carrying 24 nodes / 1988 B of JSON.
```

§5 — the cut, the drift, and the recovery. Note `connection #5`: the plugin
dialled five times, three of which the blackout terminated on arrival, while the
host counted only two real attachments:

```
=== 5. The connection drops mid-session ===
  host's status label before anything breaks : "3 open · 1 refreshes"
  pressing "Background burst" (node-12:onClick); the plugin now has pending work
  socket terminated, and the server is refusing new connections (blackout)

  status after the blackout, host side : "3 open · 1 refreshes"
  controller.getStatus()               : {"mode":"websocket","connected":false,"lastError":"connection closed"}
  blackout lifted; waiting for the plugin's own reconnect loop...
    [Plugin WS info] plugin process online: pid=244846 node=v25.2.1 connection #5 to ws://127.0.0.1:41135/plugins/tickets
    [Plugin WS info] background tick: plugin's status label is now "3 open · 2 refreshes"
    [Plugin WS info] background tick: plugin's status label is now "3 open · 3 refreshes"
    [Plugin WS info] background tick: plugin's status label is now "3 open · 4 refreshes"
  socket attachments so far            : 2

  DRIFT, measured:
    mutation frames the plugin could not send : 3
    the host still renders                    : "3 open · 1 refreshes"
    the plugin's buffered log lines just above: what it was really showing

  RECOVERY — syncTree(), the member that exists for exactly this:
    host now renders : "3 open · 4 refreshes"
    drift closed     : true
```

§6 and §7 — re-delivery, and a clean exit:

```
=== 6. Re-delivery: the failure syncTree does NOT fix ===
  replaying a captured frame: {"t":"q","id":"3","op":"call","p":["applyMutations"],"a":[[{"type":"setProps","nodeId":"node… (+434 chars)
    host text before the replay : "3 open · 4 refreshes"
    host text after  the replay : "3 open · 1 refreshes"

=== 7. Shutdown ===
  after destroy(): {"mode":"websocket","connected":false}
  plugin process exited: code=0 signal=null
  ws server closed

  TOTALS FOR THE WHOLE RUN
    frames out / in     : 87 / 87
    bytes  out / in     : 3363 / 76237
    socket attachments  : 2 (1 initial + reconnects)
    host re-renders     : 38
    plugin process      : pid 244846, exited cleanly
```

The lines worth staring at: `same process? : false` next to a rendering built
entirely from parsed text; `1403.3 µs` where step 12 printed a few hundred µs
*and* a shared stack frame; `mutation frames the plugin could not send : 3` with
no error raised anywhere; and the replay in §6, where a perfectly valid,
correctly-parsed, in-order-applied batch walks the UI backwards because the
protocol has no revision to check it against.

## Sources

- [packages/host-sdk/src/controllers/websocket.ts](../../packages/host-sdk/src/controllers/websocket.ts) —
  the file this step distills: `hostAPI`, `connect`/`disconnect`, `syncTree` as
  an RPC, and the absence of any `close` handler or reconnect logic
- [packages/host-sdk/src/controllers/worker.ts](../../packages/host-sdk/src/controllers/worker.ts) —
  the same controller over a Worker; diff it against the file above and the only
  differences are the transport and `getStatus().mode`
- [packages/host-sdk/src/controllers/main.ts](../../packages/host-sdk/src/controllers/main.ts) —
  the main-thread controller and its full-tree backstop, the trade this transport
  cannot make
- [packages/host-sdk/src/validate.ts](../../packages/host-sdk/src/validate.ts) —
  `validateIncomingTree` / `validateIncomingMutations`, and why they are off by
  default
- [packages/react-runtime/src/ws-client.ts](../../packages/react-runtime/src/ws-client.ts) —
  the reconnect loop, `runtime.stop()` on close, and the note about the earlier
  hand-copied fork that had drifted
- [packages/react-runtime/src/ws-client-entry.ts](../../packages/react-runtime/src/ws-client-entry.ts) —
  `connectToHostServer`, the entry point a server-side plugin actually calls
- [packages/react-runtime/src/runtime.ts](../../packages/react-runtime/src/runtime.ts) —
  the shared plugin runtime: the `incremental` fork with no full-tree backstop,
  `syncTree`, `assertProtocolVersion`, and the `debug`-gated byte counters
- [packages/protocol/src/rpc.ts](../../packages/protocol/src/rpc.ts) —
  `HostToPluginAPI` / `PluginToHostAPI`, `syncTree`'s "recovery from drift"
  comment, and `initialize`'s `env` that neither controller sends
- [packages/protocol/src/version.ts](../../packages/protocol/src/version.ts) —
  `PROTOCOL_VERSION = 3`, the number that only matters once the two ends are
  separately deployed artifacts
- [examples/bridge-server/src/bridge.ts](../../examples/bridge-server/src/bridge.ts) —
  the real topology: connection pairing by `pluginId`, `normalizeMessage`'s
  trailing newline, the ping/pong heartbeat, the bounded host wait and the
  buffered-message flush
- [examples/bridge-server/README.md](../../examples/bridge-server/README.md) and
  [examples/bridge-server/AGENTS.md](../../examples/bridge-server/AGENTS.md) —
  why plugins dial the bridge rather than the reverse, and "NEVER add business
  logic here - keep it as a transparent proxy"
- [packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift](../../packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift) —
  the revisioned applier that would catch §6's replay, and which no JS host has
- [learn/docs/12-main-thread.md](./12-main-thread.md) — the baseline this step's
  table extends, and the two findings it is contrasted against
- [learn/docs/05-incremental-mutations.md](./05-incremental-mutations.md) — "only
  send what changed", which stops being a nicety here
- [learn/docs/10-native-host.md](./10-native-host.md) — the revision guard, and
  why it is a transport-failure guard
- [learn/steps/12-main-thread/main.ts](../steps/12-main-thread/main.ts) — the
  renderer, host, controller shape and printing style this step carries forward
