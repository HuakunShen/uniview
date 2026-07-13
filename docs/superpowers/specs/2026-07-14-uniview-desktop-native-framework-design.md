# Uniview Desktop Native Framework — Design (macOS AppKit first)

**Date:** 2026-07-14
**Status:** Draft for review
**Driving plan:** `~/Downloads/uniview-desktop-native-framework-plan.md`
**Scope of this spec:** the **first increment** (a vertical slice), plus the overall
decomposition for context. Later increments get their own specs.

---

## 1. Vision

Turn uniview from a universal UI **protocol** into a **React-Native-style framework that
renders real native desktop applications**. Author a plugin/app UI once with web-like
ergonomics (React/Solid + Tailwind/style); render it as genuine native controls with a real
flexbox layout engine. macOS AppKit first, Windows WinUI 3 second, HarmonyOS later. This is
not an Electron replacement — no web view, real native views.

```
React/Solid  →  Uniview Protocol (UINode + Commit/Mutations + Events)
             →  ResolvedStyle (Tailwind/style → normalized, in TS)
             →  Shadow Tree (Yoga flexbox → computed frames)
             →  Native Host (AppKit → NSView; later WinUI, ArkUI)
```

## 2. Where we are (grounded in the code)

The two Swift POCs prove the **reconciliation loop works end to end**, but none of the
framework substance exists yet.

- `examples/host-appkit-demo` — a serious pure-AppKit host: `NodeViewModel` (reference
  mirror + dirty bitfield), `TreeReconciler` (keyed id diff), `MutableUINodeTree` (applies
  mutations to a retained tree), handlerId event transport, a standalone `swiftc` headless
  test runner + an Xcode XCUITest target. **But:** it consumes **full-tree snapshots** (no
  revision/commit model), its only layout is `NSStackView` vertical/horizontal switched by a
  `className.contains("flex")` string hack (`ContainerView.swift:34`), its keyed diff only
  works for `NSStackView` subtrees, and its rich component vocabulary is a **1:1 port of
  Raycast's `@raycast/api`** (`List/Grid/Form/Detail/ActionPanel/...`), not a general
  primitive set.
- `examples/host-macos-demo` — a lighter SwiftUI host that rebuilds the whole tree per
  update. Reference only.
- `@uniview/protocol` (v3) — solid: `UINode` tree, mutation union (`appendChild`,
  `insertBefore`, `removeChild`, `setText`, `setProps`, `setRoot`), explicit `#text` nodes,
  handler-registry events. **No** `revision`, **no** commit batch, **no** style/layout schema.

**Gap to close in this increment:** a real style/layout foundation and a clean, testable
native rendering core, replacing the string-hack layout and the Raycast-hardcoded vocabulary
with Yoga-driven flexbox and a general primitive set.

## 3. Confirmed architecture decisions (2026-07-14)

1. **Layout engine: Yoga.** The portable flexbox engine (same one React Native Fabric uses).
   Yoga owns the box tree and computes frames from `ResolvedStyle`. The native host owns
   **native-specific** layout/container behavior: `Text` measurement delegates to AppKit text
   sizing, and future composite containers (`List/Table/ScrollView/SplitPane`) act as
   **Yoga-leaf boundaries** — they occupy a Yoga-computed box but lay out their own internals
   natively.
2. **Fresh SPM library.** A new Swift Package `UniviewAppKit` (library + XCTest target),
   built TDD-first with `swift test` (windowless, fast). A thin demo app consumes it. The
   existing `host-appkit-demo` stays as reference until superseded.
3. **Tailwind classNames + style objects, resolved in TS.** Authors write
   `className="flex flex-row gap-4 p-4"` and/or `style={{ ... }}`; a shared TS resolver
   compiles both into one normalized `ResolvedStyle` object placed in `props.style`. The
   native host only ever sees normalized numbers/enums. Style schema lives in a new
   `@uniview/style` package — **not** in `@uniview/protocol` (protocol stays product-agnostic;
   it only carries opaque JSON props).

## 4. Overall decomposition (roadmap)

Each is its own spec → plan → build cycle. **This spec covers increments 1 + 2** (one
coherent vertical slice); later increments are listed for context only.

1. **Style + layout foundation** — `@uniview/style` (TS resolver) + Yoga-backed shadow tree.
2. **AppKit rendering core** — `UniviewAppKit` SPM library: shadow tree → NSView reconciler
   under a commit/revision model; primitives `View / Text / Button / TextInput`; visual
   styling; full `swift test` coverage.
3. Rich components — `List / Table / ScrollView / SplitPane / Toolbar / Menu / Dialog / Tabs`.
4. App shell — sidebar + command palette + plugin loading ("Uniview Desktop Studio").
5. Plugin SDK — `@uniview/sdk` (`definePlugin`, typed components).
6. Snapshot + accessibility test layers.
7. Windows WinUI 3 host (reuses 1, 3–6).

## 5. First increment — detailed design

**Goal:** author a React plugin using Tailwind classNames + style objects → render it as real
native AppKit views with correct flexbox layout, visual styling, and working events — fully
unit-tested at every layer. Concretely: a styled counter + a small form (Text, Button,
TextInput laid out with flex row/column, gap, padding) rendering natively and reacting to
clicks/typing over the existing bridge.

### 5.1 New/changed units

#### A. `@uniview/style` (new TS package)

- **`ResolvedStyle`** — the normalized, JSON-safe style contract:
  - *Layout (box):* `flexDirection`, `justifyContent`, `alignItems`, `alignSelf`,
    `flexGrow`, `flexShrink`, `flexBasis`, `flexWrap`, `gap`,
    `padding{Top,Right,Bottom,Left}`, `margin{...}`, `width`, `height`,
    `minWidth/minHeight/maxWidth/maxHeight`, `position` (`relative`/`absolute`),
    `top/right/bottom/left`. Dimensions accept `number` (px), `"N%"`, or `"auto"`.
  - *Visual:* `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius`, `opacity`.
  - *Typography:* `color`, `fontSize`, `fontWeight`, `fontFamily`, `textAlign`, `lineHeight`.
  - Every field optional; unset = inherit/default. Colors are resolved to hex/rgba strings.
- **`resolveStyle({ className?, style? }, theme?) → ResolvedStyle`** — parses a Tailwind
  **subset** (documented allowlist) and deep-merges the explicit `style` object on top
  (object wins). Supported classes (first cut): `flex`, `flex-row|col`, `flex-wrap`,
  `items-{start|center|end|stretch}`, `justify-{start|center|end|between|around}`,
  `self-*`, `grow[-0]`, `shrink[-0]`, `gap-N`, `p{,x,y,t,r,b,l}-N`, `m{...}-N`, `w-N|w-full`,
  `h-N|h-full`, `min-w/h`, `max-w/h`, `bg-<token>`, `border`, `border-<token>`, `rounded[-N]`,
  `opacity-N`, `text-<token|size>`, `font-{normal|medium|semibold|bold}`, `text-{left|center|right}`.
  Unknown classes are ignored with an optional dev warning.
- **`Theme`** — `{ colors: Record<string,string>; spacing: (n:number)=>number; radii; fonts }`.
  Default theme: spacing scale `n → n*4` px (Tailwind-like), a base color palette
  (`background`, `foreground`, `primary`, `muted`, `border`, …) with light/dark variants.
- **Depends on:** nothing (pure, portable). **Consumers:** the SDK/renderer (plugin-side) and,
  as a documented schema, every native host (mirrored in Swift).
- **Tests (Vitest):** class→style for each supported class; spacing/color token resolution via
  theme; `style` object precedence over className; unit parsing (`%`/`auto`/px); dark theme;
  unknown-class handling.

Resolution runs **plugin-side** (SDK/renderer path), so the resolved object crosses the wire
in `props.style`. Native hosts never parse Tailwind.

#### B. `UniviewAppKit` (new Swift SPM library, at `native/appkit/`)

Package layout: `Package.swift`, `Sources/UniviewAppKit/`, `Tests/UniviewAppKitTests/`.
Yoga is integrated via SPM (raw Yoga C API so we own the shadow tree; exact dependency
mechanism — `facebook/yoga` SwiftPM target vs. vendored sources — pinned during planning).

- **Protocol types (Swift):** `UINode`, `Mutation`, `CommitBatch`, `ResolvedStyle` decoders.
  Ported from the proven demo decoders; superjson/kkrpc wire concerns stay out of the core.
- **`ShadowNode`** — `{ id, type, props, style: ResolvedStyle, children: [ShadowNode],
  var layout: LayoutRect, layoutMode: .flex | .nativeManaged, weak var view: NSView? }`. Built
  and mutated from commits. Treated as immutable per node except `layout`/`view` (matches the
  repo's "don't mutate InternalNode" ethos).
- **`ShadowTree`** — applies a `CommitBatch` (revision-ordered, idempotent) to produce/patch
  the shadow tree; maintains an `id → node` index.
- **`YogaLayout`** — maps `ResolvedStyle` → Yoga node config, builds the Yoga tree mirroring
  the shadow tree, runs `YGNodeCalculateLayout(width, height)`, writes absolute frames back
  into each `ShadowNode.layout`. `Text` registers a **measure function** delegating to AppKit
  text sizing. `.nativeManaged` nodes are Yoga leaves (measured, not descended).
- **`Reconciler`** — after layout, mounts/patches `NSView`s from the shadow tree: create views
  for new nodes, apply changed props/style, set frames from computed layout, remove departed
  nodes, reorder. Keyed by `id`, **generalized to all container types** (not NSStackView-only).
  Geometry comes from Yoga frames (manual `view.frame`), not Auto Layout.
- **Components (this increment):** `View` (styled `NSView` container — background/border/radius
  via `CALayer`, opacity), `Text` (`NSTextField` label + typography + measure), `Button`
  (`NSButton` + `onClick`), `TextInput` (`NSTextField` + `onChange`, with an
  `isUpdatingFromHost` guard to break the value feedback loop). A `ComponentRegistry` maps
  `type` → component; unknown types render a visible placeholder (never silently dropped).
- **Events:** reuse the handlerId convention. The core exposes a `HandlerExecutor`
  (`(handlerId, [JSONValue]) -> Void`) injection point so tests assert firing **without** a
  bridge, and the demo wires it to RPC.
- **Transport-agnostic:** the core's input is `CommitBatch`/`UINode`; its output is handler
  events. No WebSocket/kkrpc inside the library. This keeps it windowless-testable and reusable.
- **Tests (`swift test`, XCTest):**
  - *Layout math* (the plan's "protocol/native fixture" layers): fixtures → assert computed
    frames — flex row/column, `gap`, padding/margin, `flexGrow` distribution, `%`/`auto`
    dimensions, wrap, nesting, `alignItems`/`justifyContent`.
  - *Reconciliation:* apply `CommitBatch` sequences → assert shadow + NSView tree shape;
    keyed reorder; revision ordering & idempotence (replaying a batch is a no-op).
  - *Component prop mapping:* Button title/disabled, TextInput value + feedback guard, Text
    typography, View background/border/radius/opacity onto the layer.
  - *Event wiring:* click → executor called with the right handlerId; input change → executor
    with the typed value.

#### C. Protocol change (additive)

- Add **`CommitBatch { revision: number; mutations: Mutation[] }`** and a plugin→host
  **`applyCommit(batch)`** method, alongside the existing `applyMutations`/`updateTree`.
  `revision` is a monotonic counter enabling ordering, idempotence, and drift detection. This
  is **additive** (new optional method + new type; existing shapes unchanged), so per the
  repo's versioning rule it does **not** force a `PROTOCOL_VERSION` bump; hosts advertise
  support. (Revisit only if we alter an existing message shape.)
- `props.style: ResolvedStyle` is documented as a **convention** carried as an opaque JSON
  prop. The schema stays in `@uniview/style` (mirrored in Swift), keeping `@uniview/protocol`
  agnostic per its anti-patterns.

#### D. Thin demo app + example plugin

- `examples/host-appkit-studio/` — a minimal AppKit app embedding `UniviewAppKit`, connecting
  to the existing bridge (`ws://localhost:3000/host/<pluginId>`, reusing the demo's proven
  kkrpc-compatible client), rendering a plugin into a single content view. Its only job is to
  prove the core in a real window.
- An example plugin (React via the existing renderer, `style`/`className` props) — a styled
  counter + small form — to drive the demo. May reuse `examples/plugin-example` patterns.

### 5.2 Data flow

```
React render → react-renderer → UINode (+ props.style resolved by @uniview/style)
  → MutationCollector → CommitBatch{revision, mutations} → kkrpc/bridge
  → demo app RPC client → UniviewAppKit.ShadowTree.apply(commit)
  → YogaLayout.calculate() → frames → Reconciler.mount/patch → NSView
User interaction → NSView target/action → HandlerExecutor(handlerId, args)
  → demo RPC client → executeHandler → plugin → setState → next CommitBatch
```

### 5.3 Verification (AI dev loop)

`edit → swift test (+ vitest) → build demo → launch → computer-use screenshot/interact →
assert → fix`. Automated tests are the primary gate (per the goal: "auto unit test is the
best"); computer-use drives the running demo to confirm real native rendering and capture
screenshots for the record.

## 6. Testing strategy (mapped to the plan's layers)

- **1. Protocol tests** — TS: React mutation/commit === expected `CommitBatch`; `@uniview/style`
  resolver correctness.
- **2. Native host fixture tests** — Swift `swift test`, windowless: layout math,
  reconciliation, prop mapping, event wiring (the plan's `TestHost`/`find` pattern).
- **3. Screenshot tests** — deferred to increment 6, but this increment captures baseline
  screenshots via computer-use during verification.
- **4. Accessibility tests** — role/label/identifier exposure begins as assertions in the
  component tests; full a11y suite in increment 6.

## 7. Out of scope (this increment)

Rich components (List/Table/SplitPane/etc.), the app shell / command palette, the `@uniview/sdk`
authoring package, embedded Node, Windows/Harmony hosts, snapshot-diff CI, and the full Desktop
Studio milestone. The demo app is intentionally minimal.

## 8. Risks & mitigations

- **Yoga SPM integration** (C/C++ dep, build friction) → verify the dependency mechanism early
  in planning; isolate all Yoga calls behind `YogaLayout` so it can be swapped.
- **Text measurement fidelity** (Yoga measure func vs. AppKit sizing) → cover with explicit
  measure tests; accept small tolerances.
- **Manual-frame vs. Auto Layout** (giving up AppKit's autoresizing) → the core owns geometry
  from Yoga; `.nativeManaged` boundaries hand control back to AppKit where needed.
- **Scope creep toward Raycast components** → this increment ships only View/Text/Button/
  TextInput; rich components are a separate spec.

## 9. Success criteria

- `@uniview/style` resolves the supported Tailwind subset + style objects, fully unit-tested.
- `UniviewAppKit` renders View/Text/Button/TextInput with correct Yoga flexbox layout and
  visual styling, driven by revisioned commits, with green `swift test` covering layout,
  reconciliation, props, and events.
- The demo app renders the example plugin natively; clicks/typing round-trip through the
  bridge; computer-use confirms correct layout and interaction with a captured screenshot.
