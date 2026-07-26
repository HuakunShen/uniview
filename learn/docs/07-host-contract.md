# 07. What a new host must implement, and what it must never assume

## Why

Step 02 ended with a `MutableTree` holding a correct `UINode` tree. A correct
tree in a variable draws nothing. Stage C is the fan-out that pays for the whole
protocol — Svelte, Vue, React, a terminal grid, AppKit in Swift, all from one
tree — and this step defines the seam every one of them plugs into: a
`PluginController` the host *calls*, and a `ComponentRegistry` the host *fills*.

The failure mode it exists to prevent is not a crash, it is a slow leak.
`CLAUDE.md` is blunt about it: "The renderer must not know what a 'sidebar', a
'launcher' or a 'command palette' is." A host that grows one branch for one
product concept has to have that branch ported into every future platform —
"three copies of one opinion, in three languages" — and the renderer becomes
usable by exactly one product. The registry exists so the host has nowhere to
put that branch: a node `type` is a key, the app supplies the value, and the
renderer has one generic path plus a fallback.

## Why this approach, and not the obvious alternative

The obvious alternative is a **`switch` on `node.type` inside the renderer**.
Every host starts there, and Uniview's native host literally did — the real
Swift registry's first line of documentation is that it "Replaces the POC's
hardcoded `switch`; product-specific primitives register here rather than
editing a central factory"
([packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift:4](../../packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift#L4)).
What the switch cannot do is let a plugin ship a primitive. `type` is a bare
`string` in the protocol precisely so a product can add one without touching
`@uniview/protocol`; a central switch takes that back, because now adding a
primitive means a pull request against the renderer, in three languages, per
platform. The registry moves the map from the renderer's source to the host's
runtime, which is the only place it can live if the protocol is to stay
app-agnostic.

The second alternative is to **put the component map in the protocol** — one
canonical `Button`, `Card`, `List` that every host implements. That is banned
outright: "MUST NOT define product-specific components (Button, Card, etc.) -
keep protocol agnostic" (`CLAUDE.md`). It would also be a lie, because the hosts
genuinely cannot implement the same set: a terminal has no `img`, AppKit has a
native menu bar that is not a view at all (hence `registerSurface`,
[ComponentRegistry.swift:20](../../packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift#L20)).

The third alternative is to skip `PluginController` and **let each host talk to
the transport directly**. That collapses the moment you have more than one
transport: the host-sdk's own anti-pattern list says "NEVER expose raw RPC
channel - encapsulate entirely in controller", and the payoff is stated as a
property — "All controllers implement `PluginController` - host code unchanged
when switching modes." `main.ts` demonstrates the same property in the other
direction: one controller instance, two subscribers, two hosts that share no
rendering code at all. Both fan-outs are the same interface read from opposite
ends.

One consequence worth naming, because it looks like a bug: `registry.get()`
returns `T | undefined`, and a host receiving a `type` it has never heard of is
**the normal case, not an error case**. The plugin was written by someone else,
possibly against a newer version of the product. Both of Uniview's real hosts
independently chose the same answer — render a visible placeholder reading
`Unknown: <type>`, never throw, never silently drop.

## What changed since step 02

Sections 1 and 2 of `main.ts` are step 02's protocol types and `MutableTree`,
carried forward with the commentary trimmed; a diff of the two files should show
them as unmoved. `NaiveTree` and step 02's ordering demonstrations are gone —
they made their point. Everything after is new:

- **`ComponentRegistry<T>` + `createComponentRegistry<T>()`**, matching the real
  five-method shape. `T` is generic because a "component" is a Svelte
  `Component`, a React `ComponentType`, a Swift `Component`, or — here — a
  function returning lines of markup, or one returning draw commands.
- **`PluginController` + `HostMode`**, the interface Stage D implements three
  times. Step 02 named this type in its "leaves out" section; step 07 is where
  it arrives.
- **A `ScriptedController`** that implements it. It is not a real controller —
  it replays a script — but it copies the two structural details that matter: a
  `Set` of subscribers fanned out on every batch, and `new MutableTree()` on
  disconnect so a stale index cannot survive a reconnect.
- **Two hosts.** Host A is recursive and produces a string tree (the web idiom:
  one component per node). Host B is iterative and produces a flat list of
  absolutely positioned draw commands, painted afterwards into a character grid
  (the terminal / AppKit idiom: lay out, then mount). They share zero rendering
  code, and the run prints the computed proof: `shared implementations : 0`.
- **The same event, two readings.** Step 02 treated `_onClickHandlerId: "h_1"`
  as an opaque prop. Here host A binds it to `on:click` and host B turns it into
  a hit-target marker — and the click actually round-trips:
  `controller.executeHandler("h_1")` is what *causes* step 02's exact three
  mutations to arrive.
- **Registry divergence in both directions.** Host A knows `badge` and not
  `sparkline`; host B knows `sparkline` and not `badge`. Neither drops the type
  it does not know.

## How Uniview really does it

The seam, verbatim — note that `syncTree`'s doc comment names the exact failure
it exists for, which is the divergence step 02 could only report:

```typescript
  /**
   * Request plugin to send current full tree
   * Used for recovery from drift or explicit sync request
   */
  syncTree(): Promise<void>;

  /**
   * Get current status
   */
  getStatus(): { mode: HostMode; connected: boolean; lastError?: string };

  /**
   * Get current tree
   */
  getTree(): UINode | null;
```

[packages/host-sdk/src/types.ts:31](../../packages/host-sdk/src/types.ts#L31)
(lines 31-45). The full interface is `connect` / `disconnect` / `updateProps` /
`executeHandler` / `destroy` / `syncTree` / `getStatus` / `getTree` /
`subscribe`, plus an optional `subscribeErrors`.

The registry — five methods, and the `undefined` that forces every host to have
a fallback:

```typescript
export interface ComponentMetadata {
  version?: string;
  propTypes?: Record<string, unknown>;
}

export interface ComponentRegistry<T = unknown> {
  register(type: string, component: T, metadata?: ComponentMetadata): void;
  get(type: string): T | undefined;
  has(type: string): boolean;
  list(): string[];
  clear(): void;
}
```

[packages/host-sdk/src/types.ts:60](../../packages/host-sdk/src/types.ts#L60)
(lines 60-71)

And the same idea reached independently in Swift, where the fallback is not
optional but a constructor parameter with a default:

```swift
    /// The component for a type, or the fallback (visible placeholder) when
    /// unregistered — nodes are never silently dropped.
    public func component(for type: String) -> Component {
        components[type] ?? fallback
    }
```

[packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift:41](../../packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift#L41)
(lines 41-45). The two hosts even converged on the same *string*: Svelte renders
`<div class="uniview-unknown">Unknown: {node.type}</div>`
([packages/host-svelte/src/ComponentRenderer.svelte:263](../../packages/host-svelte/src/ComponentRenderer.svelte#L263))
and AppKit's `UnknownComponent` sets `label.stringValue = "Unknown: \(node.type)"`
in red
([packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift:868](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift#L868)).
`main.ts` copies that convention for both of its hosts.

Worth reading next to those: the Svelte host's dispatch order, which is exactly
the five branches this step teaches — bare string, `TEXT_NODE_TYPE`, void
elements, specific layout tags, generic `LAYOUT_TAGS`, `registry.has(...)`,
fallback
([ComponentRenderer.svelte:181](../../packages/host-svelte/src/ComponentRenderer.svelte#L181),
lines 181-264) — and the terminal host, which has **no registry at all** and
dispatches on `richtext` / a text-type set / a generic box
([packages/host-tui/src/convert.ts:156](../../packages/host-tui/src/convert.ts#L156)).
Three hosts, three different answers to the same question, one protocol.

## What this step leaves out

- **Connection lifecycle.** `connect()` here flips a boolean. The real one
  constructs a kkrpc `RPCChannel` over a Worker or WebSocket transport, then
  performs the `initialize` handshake carrying `PROTOCOL_VERSION` so a
  mismatched plugin is rejected rather than silently mis-parsed. Step 13.
  [packages/host-sdk/src/controllers/worker.ts:96](../../packages/host-sdk/src/controllers/worker.ts#L96),
  [packages/protocol/src/rpc.ts:15](../../packages/protocol/src/rpc.ts#L15)
- **Drift recovery.** `syncTree()` here re-notifies local subscribers. The real
  one calls *into the plugin* (`await api.syncTree()`), which re-serializes and
  pushes its whole tree back — the escape hatch that makes step 02's "append as
  recovery" acceptable. Steps 12-14.
  [packages/host-sdk/src/controllers/worker.ts:134](../../packages/host-sdk/src/controllers/worker.ts#L134),
  [packages/protocol/src/rpc.ts:54](../../packages/protocol/src/rpc.ts#L54)
- **Error propagation.** `subscribeErrors` here is fed by the controller's own
  applier. In production the plugin calls a `reportError` RPC *back into the
  host*, which records `lastError`, logs, and fans out to error subscribers —
  a second channel travelling the opposite way to the tree. Steps 13-15.
  [packages/host-sdk/src/controllers/worker.ts:64](../../packages/host-sdk/src/controllers/worker.ts#L64),
  [packages/protocol/src/rpc.ts:86](../../packages/protocol/src/rpc.ts#L86)
- **The environment push.** Nothing here tells the plugin it is in dark mode.
  The host pushes `HostEnvironment` (`colorScheme`, `accentColor`,
  `reduceMotion`, `highContrast`) via `setEnvironment` — deliberately *state*,
  not events, and deliberately not the mechanism behind semantic color tokens:
  "semantic color tokens travel to the host as names and are resolved natively,
  per view, so they change with the appearance without a re-render or a round
  trip." Step 15, and step 16 for the tokens.
  [packages/protocol/src/environment.ts:1](../../packages/protocol/src/environment.ts#L1),
  [packages/protocol/src/rpc.ts:37](../../packages/protocol/src/rpc.ts#L37)
- **Payload validation.** The controller optionally runs Zod over every incoming
  tree and mutation batch before applying it — "Off by default: validation walks
  the whole payload and is not free."
  [packages/host-sdk/src/validate.ts:15](../../packages/host-sdk/src/validate.ts#L15)
- **Real event plumbing.** `handlerEventName` here is one regex. The real host
  maps eleven whitelisted `EventPropName`s onto DOM listeners, serializes
  keyboard payloads field-for-field, prevents default on `submit`, and passes
  *unrecognised* handler props straight through so registered components can
  relay them.
  [packages/host-svelte/src/ComponentRenderer.svelte:41](../../packages/host-svelte/src/ComponentRenderer.svelte#L41)
- **What a real component actually has to do.** Host A returns strings; host B
  returns draw commands; both re-render everything on every frame. A real
  component creates a view once and patches it *in place* — `makeView` /
  `update` / `intrinsicSize` / `viewKind` / `contentView` / `didApplyLayout`,
  with a comment explaining that keying view reuse on `type` alone left a `<div>`
  that grew a `material` prop stuck with its old view forever. Steps 08-11.
  [packages/UniviewAppKit/Sources/UniviewAppKit/Component.swift:22](../../packages/UniviewAppKit/Sources/UniviewAppKit/Component.swift#L22)
- **Non-view node types.** AppKit's registry has a second map for *surfaces* — a
  menu bar, a window, a notification: "The mounter hands the whole subtree to
  the surface instead of building views, and the layout engine skips it." There
  is no equivalent in the JS `ComponentRegistry`.
  [packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift:17](../../packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift#L17)
- **Layout.** Host B's "layout" is a vertical stack that ignores `gap` and
  `padding` entirely. The real native host runs Yoga (`packages/UniviewYoga`)
  behind a `NodeMeasurer` seam, and the terminal host has its own flexbox
  implementation. Step 11.
  [packages/host-tui/src/convert.ts:26](../../packages/host-tui/src/convert.ts#L26)
- **`ComponentMetadata` is write-only.** The interface accepts it on `register`
  and the implementation stores it, but there is no accessor on
  `ComponentRegistry` to read it back — nothing in the repository can currently
  observe a registered component's `version` or `propTypes`.
  [packages/host-sdk/src/registry.ts:16](../../packages/host-sdk/src/registry.ts#L16)

## Trade-offs

- **A registry instead of a switch** means the renderer never has to be edited
  to support a new primitive — the app registers one at runtime, in its own
  language, and the same renderer binary serves any product. The cost is that a
  typo in a `type` string is a runtime placeholder rather than a compile error,
  and every host pays for a fallback branch it hopes never to hit.
- **A fallback that renders `Unknown: <type>` rather than throwing or dropping**
  keeps a partially-supported plugin usable and makes the gap visible to whoever
  is looking at the screen. The cost is that a systematically misconfigured
  registry produces a UI full of red placeholders rather than one loud failure
  anyone gets paged for.
- **One `PluginController` for three transports** is what lets a host swap
  main-thread for Worker for WebSocket without touching a line of rendering
  code. The cost is that every method is `Promise`-returning even in main-thread
  mode where nothing is asynchronous, so the host pays a microtask and an `await`
  for a call that never leaves the stack — and genuinely synchronous host code
  becomes impossible to write.
- **Subscription rather than polling** is what makes two hosts on one controller
  work at all (`main.ts` proves both received the identical tree *object*). The
  cost is a `Set` of callbacks whose lifetime the host must manage; forget the
  returned unsubscribe function and a torn-down host keeps rendering forever.
- **Layout tags hardcoded, product primitives via the registry** gives a host a
  guaranteed floor it can rely on — `LAYOUT_TAGS` is append-only by policy. The
  cost is a split personality: the two hosts here treat `button` as a built-in,
  the Svelte host special-cases six tags before its generic branch, and AppKit
  registers `["Button", "button"]` *in the registry* instead. The protocol
  guarantees the tag list, not the dispatch strategy, so every host draws that
  line somewhere slightly different.

## Run it

```
pnpm tsx steps/07-host-contract/main.ts
```

Real output, **trimmed** from 123 lines to the 20 that carry the idea. Elided:
sections 1-3 (the empty controller, the first frame, and the click round trip),
section 5's command dump, sections 6(a)/(b) and 7 in full, and all trailing
commentary. Every line below is verbatim; lines were removed between them, never
altered.

Section 4 — the same three mutation batches, rendered by two hosts that share no
code, one of which knows `badge` and not `sparkline` while the other knows
`sparkline` and not `badge`:

```
=== 4. Two product primitives neither host wrote ===
  HOST A — outline host (string tree, recursive)                          HOST B — grid host (draw commands, iterative)
  ---------------------------------------------------------------------   ---------------------------------------------
  <column gap=8 padding=16>                                               ┌ column ──────────────────────────────┐
    Clicked 1 times                                                       │ Clicked 1 times                      │
    <button disabled=false on:click="h_1" style="color: var(--accent)">   │ ~[button] Click me                 * │
      Click me                                                            │ last click: just now                 │
    </button>                                                             │ Unknown: badge                       │
    last click: just now                                                  │ ▂▄▆█▆▃                               │
    <badge tone="info">synced</badge>                                     └──────────────────────────────────────┘
    Unknown: sparkline
  </column>
```

Sections 6(c) and 8 — the brand-agnostic check, and the summary:

```
      hex literals in either rendering: 0
=== 8. Same input, two hosts, zero shared rendering code ===
  frames delivered to host A / host B     : 5 / 5
  both hosts received the same tree OBJECT: true  (one subscriber Set, one fan-out)
  final rendering: A 9 lines / 228 bytes, B 7 lines / 462 bytes
  rendering functions: A has 6, B has 9
    shared implementations : 0
    shared names only      : 1  [resolveColor]
```

The lines worth staring at: `Unknown: badge` appearing on one side while
`Unknown: sparkline` appears on the other (the registry is per host, not
global); `same tree OBJECT: true` (one controller, one subscriber fan-out, two
completely different screens); and `shared implementations : 0`, computed by
intersecting the two hosts' actual function objects rather than asserted. The
single shared *name*, `resolveColor`, is the finding rather than a flaw — both
hosts had to turn the semantic token `accent` into something drawable, and
neither was allowed to answer with a hex literal, so one produced
`var(--accent)` and the other a terminal palette slot.

## Sources

- [packages/host-sdk/src/types.ts](../../packages/host-sdk/src/types.ts) —
  `PluginController`, `HostMode`, `ComponentRegistry`, `ComponentMetadata`: the
  two interfaces this step is about
- [packages/host-sdk/src/registry.ts](../../packages/host-sdk/src/registry.ts) —
  `createComponentRegistry`, the whole 32-line implementation
- [packages/host-sdk/src/index.ts](../../packages/host-sdk/src/index.ts) — what
  a host is actually handed: the types, the registry factory, three controller
  factories, and `MutableTree`
- [packages/host-sdk/src/controllers/main.ts](../../packages/host-sdk/src/controllers/main.ts) —
  the simplest real controller, and the one step 12 rebuilds
- [packages/host-sdk/src/controllers/worker.ts](../../packages/host-sdk/src/controllers/worker.ts) —
  the `initialize` handshake, `reportError`, and the real `syncTree`
- [packages/host-sdk/src/validate.ts](../../packages/host-sdk/src/validate.ts) —
  optional payload validation, and why it is off by default
- [packages/protocol/src/tree.ts](../../packages/protocol/src/tree.ts) —
  `LAYOUT_TAGS`, `TEXT_NODE_TYPE`, `isLayoutTag`, `isTextUINode`, `textContent`:
  how a host tells the three kinds of `type` apart
- [packages/protocol/src/rpc.ts](../../packages/protocol/src/rpc.ts) —
  `initialize`, `setEnvironment`, `syncTree`, `reportError`
- [packages/protocol/src/environment.ts](../../packages/protocol/src/environment.ts) —
  `HostEnvironment`, and why it is state rather than events
- [packages/host-svelte/src/ComponentRenderer.svelte](../../packages/host-svelte/src/ComponentRenderer.svelte) —
  a real host's dispatch order, event mapping, and `Unknown:` fallback
- [packages/host-tui/src/convert.ts](../../packages/host-tui/src/convert.ts) —
  a real host with no registry at all
- [packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift) —
  the same registry in Swift, plus surfaces and `standard()`
- [packages/UniviewAppKit/Sources/UniviewAppKit/Component.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Component.swift) —
  what a native component must implement beyond "draw"
- [packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift) —
  `UnknownComponent`, the visible placeholder
- [examples/host-react-demo/src/App.tsx](../../examples/host-react-demo/src/App.tsx) and
  [examples/host-svelte-demo/src/routes/+page.svelte](../../examples/host-svelte-demo/src/routes/+page.svelte) —
  the application layer filling a registry (`Button`, `Input`, `Switch`,
  `Toggle`) and choosing a controller
- [CLAUDE.md](../../CLAUDE.md) — "THE PRIME DIRECTIVE", the app-agnostic and
  brand-agnostic clauses, and the host-sdk anti-patterns
- [learn/docs/02-mutable-tree.md](./02-mutable-tree.md) and
  [learn/steps/02-mutable-tree/main.ts](../steps/02-mutable-tree/main.ts) — the
  `MutableTree` and the mutation batch this step feeds to two hosts at once
