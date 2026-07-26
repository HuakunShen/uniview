# 15. Callbacks coming back, and why hover / scroll / dark-mode must never round-trip

## Why

Steps 12-14 carried the tree *outward* and priced three transports. Everything a
user does travels the other way, and if that return path is treated as one
undifferentiated channel the architecture stops working — not slowly, but
incorrectly. `CLAUDE.md` states it as one of the two constraints the prime
directive implies:

> **High-frequency interaction is local, never RPC.** Scrolling, typing, hover
> and focus are handled natively and must never stream per-event across the
> transport. This is why style variants (`dark:`, `hover:`, `focus:`) travel
> *with* the node and are resolved by the host, instead of being pushed to the
> plugin for a re-render: a round trip per mouse-enter is wasteful locally and
> fatal when the plugin runs on another machine.
> ([CLAUDE.md:61](../../CLAUDE.md#L61))

So the return path has exactly two lanes and one prohibition. **Events** —
click, submit, change, a *declared* key — cross as RPC, because the user decided
something and the plugin's logic must run. **Environment** — dark mode, accent
color, reduced motion — crosses as *state*, pushed on change, because it is a
value the plugin reads, not a stream it consumes. And **hover, focus, scroll,
key repeat and pointer position** do not cross at all.

## Why this approach, and not the obvious alternative

**Alternative 1: make hover and focus plugin state, like React on the web does.**
This is the default a competent React author will write —
`onMouseEnter={() => setHovered(id)}` — and `main.ts` runs exactly that plugin.
One realistic gesture (a pointer crossing a six-row list at 60 fps, 40 samples
over 0.64 s, then a tab, then one click) becomes **52 round trips**. On a
simulated LAN socket that is 15.2 ms of measured wall clock; extrapolated to a
plugin on another machine at 20 ms each way it is **2.08 s of network for 0.64 s
of mouse movement**, and the gap grows for as long as the user keeps moving. The
highlight would be permanently rows behind the pointer. The same file times the
host-side alternative directly: **0.686 µs per hover transition**, a set lookup
and a map join with nothing crossing anything.

The measured detail that makes the argument worse for the alternative: of those
52 round trips, only **12** produced a React commit. Most ended in
`setHovered(sameValue)`, React bailed out, and nothing changed. The transport was
paid in full anyway. A pointer-rate event is expensive even when the answer is
"nothing happened" — which is precisely the case the host can decide alone.

**Alternative 2: let the handler receive the DOM event.** It cannot travel.
`main.ts` builds a 28-field keyboard event with a `target` that points back at a
document that points back at the target, plus `preventDefault`, and puts it
through both transports: `structuredClone` throws `DataCloneError` on the method,
`JSON.stringify` throws `TypeError` on the cycle. The real host says so in one
line: *"Converts Svelte component event callback arguments into JSON-safe values
before they cross Worker/kkrpc boundaries. DOM Event objects are not
structured-cloneable."*
([packages/host-svelte/src/event-handlers.ts:1](../../packages/host-svelte/src/event-handlers.ts#L1))
So the host narrows per event name *before* crossing: a keydown becomes six
fields (91 B), a change becomes one string, and **a click becomes `[]`** — the
plugin already knows which node it put the handler on, so the event carries
nothing it does not have. The narrow shape is deliberately a *subset of the DOM's*
shape rather than an invention, so a terminal or AppKit host with no `Event` class
reads the same field names.

**Alternative 3: fold the color scheme into the plugin's props.** The protocol
rejects this explicitly, and on ownership grounds rather than performance ones:
*"Separate from `updateProps` on purpose: props belong to whoever mounted the
plugin, and a host that folded the color scheme into them would be writing into
someone else's namespace."*
([packages/protocol/src/rpc.ts:31](../../packages/protocol/src/rpc.ts#L31))

**Alternative 4: push the color scheme and let the plugin restyle.** Partly
right, and the protocol is careful about which part. `main.ts` flips a host to
dark and pushes 279 B: the plugin's **chart palette changes**, because there is
no semantic token for "series 2 of a burndown" and picking `#60a5fa` over
`#2563eb` is an authoring judgement about legibility. On the same node,
`bg-card` and `text-foreground` **do not move at all** — they were already names
in the tree — and `dark:border-zinc-700` on the rows resolves from the host's own
state. One push, one commit, two mutations, and most of the visual change
happened without the plugin being asked.

## What changed since step 14

Steps 12, 13 and 14 built the same `PluginController` over three transports and
measured the outbound cost of each. This step reverses the arrow. Concretely:

- **`executeHandler` gets a real payload.** In steps 12-14 the handler arguments
  were empty or scripted. Here the host runs step 08's `serializeHandlerArgs`
  first, so what crosses is the JSON subset, per event name — and section 2 shows
  the fat event that would otherwise have been handed to it.
- **A second inbound channel, which is not events.** `setEnvironment(env)` and a
  module-level plugin-side store with a `shallowEqual` no-op guard, read through
  `useHostEnvironment()` / `useColorScheme()`. Nothing in steps 12-14 pushed
  anything *into* the plugin except props.
- **The host now keeps state of its own.** `OutlineHost.styleState(nodeId)`
  returns `{"light"|"dark"} ∪ {"hover"?} ∪ {"focus"?}` and joins it against the
  `hover:` / `focus:` / `dark:` prefixes already present in `className`. Step 12's
  host was stateless; this one resolves 51 of 52 interactions without touching the
  controller.
- **The boundary grew a latency leg.** Step 12's `Boundary` did the transport's
  real work (`structuredClone` / `JSON.stringify`) and counted bytes. This one
  adds a busy-wait that actually elapses, so a socket round trip costs time and
  not just CPU. Step 12's own baseline table — main thread 0 B, Worker
  ~23.72 µs/cross, WebSocket ~11.43 µs/cross for a 1786 B payload — is where the
  transport figures quoted below come from; `docs/13-worker.md` and
  `docs/14-websocket.md` were not yet published when this step was written, so no
  number is cited from them.
- **The plugin is written twice**, identical except for where hover lives, so the
  two versions can be run against the same gesture and differenced.

## How Uniview really does it

The clearest statement of this step's thesis is a doc comment, and it is worth
reading in full before the code:

```typescript
/**
 * What the plugin knows about the machine it is being displayed on.
 *
 * This is *state*, not events. React Native draws the same line: a view is a
 * declarative host component, but "is the system in dark mode" is a value you
 * read (`Appearance.getColorScheme()`) and subscribe to. It never belongs in the
 * UI tree, and it never belongs in the plugin's own props — the host owns it.
 *
 * Note what is deliberately NOT solved here. `bg-card` does not consult this:
 * semantic color tokens travel to the host as names and are resolved natively,
 * per view, so they change with the appearance without a re-render or a round
 * trip. This is for the decisions only the plugin can make — which chart palette,
 * which illustration, whether to animate at all.
 */
export type ColorScheme = "light" | "dark";

export interface HostEnvironment {
  /** Dark or light, as the *host* resolves it — a window may override the system. */
  colorScheme: ColorScheme;
```

[packages/protocol/src/environment.ts:1](../../packages/protocol/src/environment.ts#L1) (lines 1-19)

The event payloads are subsets on purpose, and the comment says which purpose —
portability, not bandwidth:

```typescript
/**
 * The payload an `onKeyDown` handler receives.
 *
 * Deliberately a subset of the DOM's `KeyboardEvent`, field for field: the same
 * plugin tree renders on a web host, where `onKeyDown` is handed the real thing.
 * A native host that invented its own field names would mean one tree that reads
 * its keys two different ways depending on who renders it.
 *
 * Native hosts only send keys the node *declared* (`keyDownEvents`) — see the
 * prop's documentation. `key` is the declared name (`"Escape"`, `"ArrowDown"`).
 */
export interface KeyDownEvent {
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  repeat: boolean;
}
```

[packages/protocol/src/events.ts:24](../../packages/protocol/src/events.ts#L24) (lines 24-42)

And the environment channel on the wire, with the ownership argument attached:

```typescript
  /**
   * Push host/system state (dark mode, accent color, reduced motion…) into the
   * plugin. Merged over what's there, so a host can send only what changed.
   *
   * Separate from `updateProps` on purpose: props belong to whoever mounted the
   * plugin, and a host that folded the color scheme into them would be writing
   * into someone else's namespace. The plugin reads this through `useColorScheme()`
   * — the same shape React Native gives you.
   */
  setEnvironment(env: Partial<HostEnvironment>): Promise<void>;
```

[packages/protocol/src/rpc.ts:28](../../packages/protocol/src/rpc.ts#L28) (lines 28-37)

Three findings the example prints rather than paraphrases, all verifiable in the
repository today:

1. **No TypeScript controller exposes `setEnvironment`.** It is on the RPC
   contract above and implemented by both runtimes
   ([react-runtime/src/runtime.ts:191](../../packages/react-runtime/src/runtime.ts#L191),
   [solid-runtime/src/runtime.ts:210](../../packages/solid-runtime/src/runtime.ts#L210)),
   but `PluginController`
   ([packages/host-sdk/src/types.ts](../../packages/host-sdk/src/types.ts)) does
   not mention it and none of `main.ts` / `worker.ts` / `websocket.ts` defines it.
   The only caller in the repository is Swift
   ([UniviewBridge/PluginConnection.swift:101](../../packages/UniviewAppKit/Sources/UniviewBridge/PluginConnection.swift#L101)).
2. **The main-thread controller performs no handshake.**
   [worker.ts:96](../../packages/host-sdk/src/controllers/worker.ts#L96) and
   [websocket.ts:87](../../packages/host-sdk/src/controllers/websocket.ts#L87)
   both call `initialize({ protocolVersion: PROTOCOL_VERSION, props })`;
   `controllers/main.ts` calls `createElement` + `render` directly. Since
   `initialize` is also where the environment is seeded —
   [react-runtime/src/runtime.ts:138](../../packages/react-runtime/src/runtime.ts#L138),
   *"so a plugin that keys off `useColorScheme()` doesn't paint a light tree,
   ship it to the host, and then repaint dark a round trip later"* — a
   main-thread plugin cannot be dark on its first frame. Neither TS controller
   passes `env` either, though the field exists
   ([rpc.ts:19](../../packages/protocol/src/rpc.ts#L19)) and the schema is
   careful to keep it
   ([validators.ts:52](../../packages/protocol/src/validators.ts#L52)); the only
   host that seeds it is
   [Shell.swift:131](../../packages/UniviewAppKit/Sources/UniviewDemoApp/Shell.swift#L131).
3. **`EventPropName` is a subset the renderer does not enforce.**
   `serializeProps` tests `/^on[A-Z]/`
   ([react-renderer/src/serialization/serialize-props.ts:50](../../packages/react-renderer/src/serialization/serialize-props.ts#L50)),
   so `onMouseMove` gets a `_onMouseMoveHandlerId` in the tree on every commit,
   `extractEventName` returns `null` for it
   ([events.ts:84](../../packages/protocol/src/events.ts#L84)), every host's
   `EVENT_MAP` has ten entries and no slot for it, and it is never called — with
   no warning, in a file that *does* warn about nested functions in object props.

The host side of "hover is local" is a set of strings assembled per view:

> ```swift
> var state: Set<String> = []
> state.insert(dark ? "dark" : "light")
> if isHovered { state.insert("hover") }
> if isPressed { state.insert("active") }
> if let responder = window?.firstResponder as? NSView, responder === self {
>     state.insert("focus")
> }
> ```
> ([Support.swift:32](../../packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift#L32))

…and the same idea applied to the keyboard is the *declare-interest* model, whose
doc comment names the failure better than a table can: *"The alternative — stream
every `keyDown` to the plugin and let it decide — is the one thing this framework
cannot do. A keystroke would cross a process boundary (and, in bridge mode, a
*network*) before the letter appears; and every key the plugin ignored would have
been stolen from the responder chain on the way, so ⌘C, the arrow keys inside a
text field, and IME composition would all quietly stop working."*
([Keyboard.swift:13](../../packages/UniviewAppKit/Sources/UniviewAppKit/Keyboard.swift#L13))

## What this step leaves out

- **The real transports.** `Boundary` is `structuredClone` / `JSON.stringify`
  plus a busy-wait. The real controllers run kkrpc over `workerTransport` or
  `webSocketClientTransport`, with connection failure, reconnection, request
  correlation and `destroy()` teardown.
  [packages/host-sdk/src/controllers/worker.ts](../../packages/host-sdk/src/controllers/worker.ts),
  [packages/host-sdk/src/controllers/websocket.ts](../../packages/host-sdk/src/controllers/websocket.ts)
- **Validation of everything inbound.** `HostEnvironmentSchema` and
  `ExecuteHandlerArgs` are Zod schemas applied at the boundary; this step trusts
  its own payloads. The `env` field's schema entry carries a comment about the
  bug its absence caused.
  [packages/protocol/src/validators.ts:37](../../packages/protocol/src/validators.ts#L37)
- **The Style IR.** Section 3's policy C splits `hover:bg-muted` on a colon.
  The real thing resolves a class string into a structured `ResolvedStyle` with a
  `variants` map plugin-side, and the host overlays matching keys least-specific
  first — that is step 16, and it is also where semantic tokens like `card` stay
  symbolic so the OS can answer them per view.
  [learn/docs/16-style-ir.md](./16-style-ir.md),
  [packages/UniviewNativeCore/StyleIR.swift:275](../../packages/UniviewAppKit/Sources/UniviewNativeCore/StyleIR.swift#L275)
- **Declare-interest keyboard handling.** `keyDownEvents={["Escape", "cmd+k"]}`
  is parsed into `KeyChord`s with exact modifier matching, matched against the
  responder chain, and anything undeclared is never taken from AppKit. This step
  only shows the *payload* a keydown produces.
  [packages/UniviewAppKit/Sources/UniviewAppKit/Keyboard.swift:4](../../packages/UniviewAppKit/Sources/UniviewAppKit/Keyboard.swift#L4)
- **How a host knows the environment changed.** `HostEnvironmentObserver` watches
  `accessibilityDisplayOptionsDidChangeNotification`, app activation and
  `viewDidChangeEffectiveAppearance()` (AppKit has no notification for the last
  one, so a container view has to own it), deduplicates against its last value,
  and unregisters its tokens from a `nonisolated deinit` via a side object. This
  step just assigns `envHost.state.colorScheme = "dark"`.
  [packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift:67](../../packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift#L67)
- **Per-view appearance.** `HostEnvironment.current(for:)` is deliberately not
  `NSApp.effectiveAppearance`, because a window can carry
  `<Window appearance="light">` while the system is dark, and `controlAccentColor`
  is dynamic so it has to be resolved inside
  `performAsCurrentDrawingAppearance` before a hex can be handed to the plugin.
  [packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift:34](../../packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift#L34)
- **The Solid half of the environment store.** Identical semantics in Solid's
  idiom — a module-level `createSignal`, an accessor instead of a hook, so
  non-component code can read it.
  [packages/solid-runtime/src/environment.ts:16](../../packages/solid-runtime/src/environment.ts#L16)
- **Tracking areas and focus repaint timing.** A native view only installs
  pointer tracking when its IR actually mentions `hover:` / `active:`, and a
  `focus:` repaint has to be deferred a turn because the window has not moved
  first responder yet when `becomeFirstResponder` runs.
  [packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift:80](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift#L80),
  [packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift:131](../../packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift#L131)
- **`serializeHandlerArgs`'s fourth branch, and a hole in it.** When a
  *registered component* invokes a callback with a plain value, the args fall
  through to `args.filter(isJsonValue)`. `isJsonValue` walks
  `Object.values(value)` — and a real DOM event keeps its fields on the
  prototype, so `Object.values` is empty and the guard returns `true`. Nothing
  in the repository binds a handler that reaches this branch with a live event
  today (the only unhandled `EventPropName` is `onWheel`, which no host binds),
  so it is latent rather than broken; this step does not exercise it.
  [packages/host-svelte/src/event-handlers.ts:71](../../packages/host-svelte/src/event-handlers.ts#L71)

## Trade-offs

- **The protocol has no word for a pointer sample, so a plugin cannot ask for
  one — ever.** That is the enforcement mechanism, and it is total: a
  drag-to-reorder or a canvas that follows the cursor cannot be written as a
  plugin the way it would be written on the web. What it buys is that no plugin
  can accidentally make the UI unusable over a socket.
- **Hover being host-resolved means the plugin cannot know it is hovered.** A
  tooltip that needs to fetch on hover, or an analytics event on dwell, has no
  hook. Styling is covered by variants; behaviour is not. The payoff is 0.686 µs
  instead of a round trip, and correctness while the plugin's machine is busy.
- **The narrowed payload throws away fields nobody has needed yet.**
  `event.target.dataset`, modifier state on a click, mouse coordinates — all
  gone before the boundary. Adding one means editing `serializeHandlerArgs` in
  every web host plus the native encoders. The payoff is that a click's argument
  list is `[]` and a terminal host can serve the same tree.
- **Environment is a module-level singleton, which is exactly right for two of
  the three runtimes.** In a Worker or another process the premise holds by
  construction. On the main thread it does not: `main.ts` mounts a second plugin
  in the same process and it silently inherits the first one's dark mode, which
  is the wrong answer for a host that (like AppKit's) reads appearance *per
  view*.
- **`shallowEqual` makes re-pushing free, and makes partial pushes subtle.**
  Two identical pushes produced 0 notifications and 0 commits in the run below.
  The flip side is that `setEnvironment` merges, so a host that stops sending a
  field does not clear it — the plugin keeps the last value it ever saw.

## Run it

```
pnpm tsx steps/15-events-and-environment/main.ts
```

Real output, **trimmed** from 239 lines to the ~70 that carry the argument.
Elided: §1's prose, §2's commentary, §4's and §5's explanatory paragraphs, §6 in
full, and §7's closing quotation. Every line below is verbatim, including the
trailing padding in the tables; lines were removed between them, never altered.

§2 — one fat DOM event, narrowed. The `onClick` row is the surprising one:

```
=== 2. One fat DOM event, narrowed ===

  the event the browser handed the host: 28 own fields
    across a Worker  (structuredClone) : DataCloneError  <- a method
    across a socket  (JSON.stringify)  : TypeError  <- target -> document -> target

  what actually crosses, per event name:
    onKeyDown -> [{"key":"d","code":"KeyD","altKey":false,"ctrlKey":false,"metaKey":false,"shiftKey":false}]
    onChange  -> ["dark mo"]
    onClick   -> []   <- nothing at all

    28 fields in, 6 out for a keydown; 91 B on the wire.

  the same six fields, at a host with no DOM (step 11's terminal, step 10's
  AppKit): d -> toggle done
```

§3 — the table this whole step exists to print. One gesture, three policies,
three transports. `RPCs` is how many interactions became an `executeHandler`
call; `local` is how many the host resolved alone:

```
=== 3. One gesture across a list, priced three ways ===

  the gesture: 52 interactions — 40 pointerSample, 5 mouseEnter, 4 mouseLeave, 1 blur, 1 focus, 1 click
  in a person's time that is 0.64s of mouse movement at 60 fps,
  then a tab, then one click.

  policy                    transport           RPCs  local  commits  muts   bytes  total ms
  ------------------------------------------------------------------------------------------
  A  everything round-trips main thread (12)      52      0       12    81       0      2.82
  A  everything round-trips Web Worker (13)       52      0       12    81   26574      3.05
  A  everything round-trips WS, LAN (14)          52      0       12    81   26574     15.23

  B  EventPropName subset   main thread (12)      12     40       12    81       0      1.77
  B  EventPropName subset   Web Worker (13)       12     40       12    81   26494      1.87
  B  EventPropName subset   WS, LAN (14)          12     40       12    81   26494      6.52

  C  + host-side variants   main thread (12)       1     51        2    11       0      0.39
  C  + host-side variants   Web Worker (13)        1     51        2    11    3121      0.34
  C  + host-side variants   WS, LAN (14)           1     51        2    11    3121      0.75

  The numbers to read are the first and last rows of the socket column:
    A over a LAN socket : 52 RPCs, 26574 B, 15.2 ms
    C over a LAN socket : 1 RPCs, 3121 B, 0.7 ms
    ratio               : 20x
```

…and the same gesture with the plugin on another machine, plus the local
alternative timed directly:

```
  EXTRAPOLATED (arithmetic on the measured RPC counts, not a measurement):
  the same gesture with the plugin on another machine, 20 ms each way:

    policy                      RPCs   network alone
    ------------------------------------------------
    A  everything round-trips     52          2.08 s
    B  EventPropName subset       12          0.48 s
    C  + host-side variants        1          0.04 s

  and the thing policy C does instead of an RPC, timed directly:
    200,000 variant resolutions in 137.1 ms = 0.686 µs per hover transition
    (checksum 600000, so the loop cannot be optimised away)
```

§4 — the environment channel. Note which line changed and which did not:

```
=== 4. The environment channel: state, pushed on change ===

  connected with env = { colorScheme: 'light' }:
    <chart id="burndown" series=["#2563eb","#dc2626","#16a34a"] gridColor="#e4e4e7" values=[12,4,31,7,19,2] />
    <column class="p-4 rounded-lg bg-card text-foreground">
    <row id="t1" class="p-2 rounded-md">

  host flips to dark and pushes { colorScheme: 'dark' }:
    <chart id="burndown" series=["#60a5fa","#f87171","#4ade80"] gridColor="#3f3f46" values=[12,4,31,7,19,2] />
    <column class="p-4 rounded-lg bg-card text-foreground">
    <row id="t1" class="p-2 rounded-md border-zinc-700">

    279 B crossed, 1 React commit(s), 2 mutation(s) came back.

  two more pushes of the SAME environment (hosts re-send it on window
  activation): 0 store notifications, 0 React commits.

  environment pushes so far: 3, store notifications: 1. Not a stream — a value.
```

§5 — the asymmetry, and what a main-thread host does instead:

```
=== 5. What a main-thread host has to do out of band ===

                                  main (12)   worker (13)   websocket (14)
    initialize() handshake        no          yes           yes
    PROTOCOL_VERSION check        no          yes           yes
    seeds env at connect          no          no*           no*
    setEnvironment on controller  no          no            no
    setEnvironment on the wire    n/a         yes           yes

  (the store survived section 4's destroy() — {"colorScheme":"dark","accentColor":"#3478f6"} — resetting it by hand)

    first frame (no env seeded)      : <chart id="burndown" series=["#2563eb","#dc2626","#16a34a"] gridColor="#e4e4e7" values=[12,4,31,7,19,2] />
    after setHostEnvironment(dark)   : <chart id="burndown" series=["#60a5fa","#f87171","#4ade80"] gridColor="#3f3f46" values=[12,4,31,7,19,2] />

    a SECOND main-thread plugin mounts in the same page. Nobody pushed an
    environment to it:
      plugin 2's first frame : <chart id="burndown" series=["#60a5fa","#f87171","#4ade80"] gridColor="#3f3f46" values=[12,4,31,7,19,2] />
      getHostEnvironment()   : {"colorScheme":"dark"}
```

The wall-clock columns move a little between runs (`total ms` includes a real
busy-wait standing in for network latency, and the 200,000-iteration timing is a
real `performance.now()` measurement). Every count — RPCs, local resolutions,
commits, mutations, bytes — is deterministic.

## Sources

- [packages/protocol/src/events.ts](../../packages/protocol/src/events.ts) —
  `HandlerId`, `EventPropName`, `EVENT_PROPS`, `KeyDownEvent`, `handlerIdProp`,
  `isHandlerIdProp`, `extractEventName`
- [packages/protocol/src/environment.ts](../../packages/protocol/src/environment.ts) —
  `HostEnvironment`, `ColorScheme`, `DEFAULT_HOST_ENVIRONMENT`, and the doc
  comment this step is built around
- [packages/protocol/src/rpc.ts](../../packages/protocol/src/rpc.ts) —
  `HostToPluginAPI.initialize` / `setEnvironment` / `executeHandler`,
  `PluginToHostAPI`
- [packages/protocol/src/validators.ts](../../packages/protocol/src/validators.ts) —
  `HostEnvironmentSchema`, `InitializeRequestSchema` and why `env` must be in it
- [packages/react-runtime/src/environment.ts](../../packages/react-runtime/src/environment.ts) —
  the module-level store, `shallowEqual`, `setHostEnvironment`,
  `useHostEnvironment`, `useColorScheme`
- [packages/solid-runtime/src/environment.ts](../../packages/solid-runtime/src/environment.ts) —
  the same store as a Solid signal
- [packages/react-runtime/src/runtime.ts](../../packages/react-runtime/src/runtime.ts) —
  `initialize`'s env seeding (line 138) and `setEnvironment` (line 191)
- [packages/solid-runtime/src/runtime.ts](../../packages/solid-runtime/src/runtime.ts) —
  the same two, lines 206 and 210
- [packages/host-sdk/src/types.ts](../../packages/host-sdk/src/types.ts) —
  `PluginController`, and the member it does not have
- [packages/host-sdk/src/controllers/main.ts](../../packages/host-sdk/src/controllers/main.ts),
  [worker.ts](../../packages/host-sdk/src/controllers/worker.ts),
  [websocket.ts](../../packages/host-sdk/src/controllers/websocket.ts) — the
  three runtimes, and which of them handshakes
- [packages/host-svelte/src/event-handlers.ts](../../packages/host-svelte/src/event-handlers.ts) —
  `serializeHandlerArgs`, `EVENT_ONLY_HANDLER_NAMES`, `serializeKeyboardEvent`,
  `isJsonValue`
- [packages/react-renderer/src/serialization/serialize-props.ts](../../packages/react-renderer/src/serialization/serialize-props.ts) —
  where a function prop becomes a handler id, and the regex that decides
- [packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift) —
  `HostEnvironment.current(for:)`, `HostEnvironmentObserver`,
  `AppearanceReportingView`
- [packages/UniviewAppKit/Sources/UniviewAppKit/Keyboard.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Keyboard.swift) —
  the declare-interest model and `KeyChord`
- [packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift) —
  `StyleStateView.styleState`, the per-view hover/focus/dark set
- [packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift) —
  tracking areas installed only when the IR mentions `hover:`
- [packages/UniviewAppKit/Sources/UniviewBridge/PluginConnection.swift](../../packages/UniviewAppKit/Sources/UniviewBridge/PluginConnection.swift) —
  the only caller of the `setEnvironment` RPC in the repository
- [packages/UniviewAppKit/Sources/UniviewDemoApp/Shell.swift](../../packages/UniviewAppKit/Sources/UniviewDemoApp/Shell.swift) —
  the only host that seeds `initialize({ env })`
- [CLAUDE.md](../../CLAUDE.md) — "High-frequency interaction is local, never RPC"
- [learn/docs/12-main-thread.md](./12-main-thread.md) — the baseline table the
  transport costs quoted here come from
- [learn/docs/16-style-ir.md](./16-style-ir.md) — the mechanism this step argues
  for
- [learn/steps/08-recursive-host/main.ts](../steps/08-recursive-host/main.ts) —
  where `serializeHandlerArgs` was first built
