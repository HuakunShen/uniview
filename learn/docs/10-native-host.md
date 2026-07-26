# 10. A host in a language with no JS runtime, and what the protocol must therefore guarantee

## Why

Steps 08 and 09 wrote hosts in Svelte, Vue and React. Every one of them received
a `UINode` that was *already a JavaScript object* — structured-cloned out of a
Worker in the same browser, read with `node.props.disabled`, never parsed and
never able to fail. `packages/UniviewAppKit` is Swift. It receives bytes. It has
no `Object`, no `undefined`, no structural typing, no `any`, and — the part that
actually shaped the protocol — no way to be handed a closure.

`CLAUDE.md` says why that case is the one that matters: "The renderer is what
gets **reimplemented on every platform** (macOS AppKit today; Windows and
HarmonyOS next)", and `UniviewNativeCore` "is deliberately small enough to
reimplement per platform in about a week — which is why we can afford *not* to
fight C++ interop across three platforms." A week is only achievable if the wire
format decodes straight into plain structs. String ids, JSON-only props, handler
*ids* instead of functions, text as an explicit `#text` node kind: every one of
those step-01 decisions is there so a `Codable` conformance is enough, and so
that no host ever needs an embedded JS engine to understand the tree.

**This step did not compile or run any Swift.** There is no Swift toolchain on
the machine this curriculum was written on — `swift` and `swiftc` are both
absent, and `learn/DECISIONS.md` records the constraint. `main.ts` implements
the same algorithms in TypeScript, deliberately written *without* the JS
conveniences a statically typed host does not have, and every Swift excerpt
below is copied verbatim from the repository rather than reconstructed.

## Why this approach, and not the obvious alternative

The obvious alternative for a native host is **embed a JavaScript engine**:
JavaScriptCore ships with macOS, so the Swift side could run the same
`@uniview/host-sdk` the web hosts run and skip the protocol work entirely.
Raycast is the cited cautionary tale — `CLAUDE.md`: "it is the bet Raycast lost
when they had to take an app's UI to a second platform and retreated to a
WebView." A JS runtime inside the host makes the "week to reimplement" claim
false on any platform that does not have one lying around (Windows, HarmonyOS),
turns every primitive into a bridge call, and re-introduces the very thing the
protocol exists to avoid: the renderer depending on the authoring language.

The second alternative is **a self-describing or schemaless wire format** —
send arbitrary JSON and let each host pick out what it recognizes. A JS host can
do that, because `props.anything` is always legal. A Swift host cannot: it has
to name a type to decode into. That constraint is why `Mutation` is a closed set
of six kinds decoded by a `switch` with a throwing `default:`, and why `props`
is `[String: JSONValue]` — a *typed* union of the six JSON kinds, not `Any`.

The third alternative is **no revision on the batch**: apply whatever arrives,
which is what every JS host in this repository does. `ShadowTree` refuses to,
and it is the sharpest divergence in Stage C. A web host lives inside one page
whose lifetime is the connection's; a native host outlives connections, is
reconnected to, and asks for `syncTree()` recovery. Once a batch can arrive
twice, "apply it again" is a corruption, and the cost of the guard is one
integer comparison.

One thing the source disagrees with a natural reading of the brief, and it is
worth stating plainly: **an unknown node `type` is not a decode error.** Node
types are a bare `String` on purpose so a plugin can ship its own primitive; the
decoder accepts any of them and the *registry* answers with a visible
placeholder. Mutation kinds are the opposite — closed, and rejected at the door.
The same document holds one open set and one closed set, deliberately.

## What changed since step 09

Steps 07-09 built hosts in JavaScript: step 07 defined the `PluginController` /
`ComponentRegistry` seam and rendered one tree two ways, steps 08 and 09 wrote
that seam in Svelte, then in Vue and React. All three received a live object
graph. This step is the first host that receives a *document*, and everything in
`main.ts` follows from that:

- **A decode step, which no previous step had.** `KeyedContainer`,
  `decodeJSONValue`, `decodeUINode`, `decodeMutation` — a miniature
  `KeyedDecodingContainer` where the input is `unknown` and every field is
  pulled through a typed accessor that records a coding path. There is no path
  from bytes into the tree that skips it.
- **`DecodingError` with three real cases** (`typeMismatch`, `keyNotFound`,
  `dataCorrupted`) and the coding path, printed. Steps 08-09 had nothing to
  reject.
- **`JSONValue` as an enum with associated values** rather than a bare TS union,
  and props as a `Map` rather than an object literal — so reading a prop is
  `props.get("disabled")` → `JSONValue | undefined` → matched, exactly the
  double-unwrap the real `node.props["disabled"]?.boolValue ?? false` performs.
- **The union in `children` is gone.** The decoder normalizes a bare-string child
  into a `#text` node, so `children: UINode[]`. The web hosts carry
  `(UINode | string)[]` all the way down to their render functions.
- **`ShadowTree` replaces step 02's `MutableTree`.** Same six cases, two
  structural inversions: it is *revisioned* (`if batch.revision <= revision {
  return false }`) and it mutates `ShadowNode` — a `final class` — **in place**,
  where `MutableTree` clones the whole path to the root for reference-equality
  change detection. `NaiveShadowTree` is step 02's `NaiveTree` ported here,
  carrying step 02's original "no detach before append" bug plus one new one:
  no revision.
- **`ComponentRegistry` takes `fallback:` in its initializer**, and
  `component(for:)` is non-optional. Step 07's TS registry returned
  `T | undefined` and made every host write its own fallback branch.
- **The Style IR is decoded field by field**, with `StyleDecodeIssue` messages
  reported verbatim — the answer to "a prop whose type does not match" that a
  wire format shared with independently versioned plugins actually needs.

## How Uniview really does it

The decode that removes the `UINode | string` union before the rest of the host
ever sees it — a private throwaway enum, tried string-first, flattened
immediately:

```swift
    /// A child entry that may arrive as a bare string or a full node object.
    private enum ChildEntry: Decodable {
        case node(UINode)
        case string(String)

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let string = try? container.decode(String.self) {
                self = .string(string)
            } else {
                self = .node(try container.decode(UINode.self))
            }
        }
    }
```

[packages/UniviewAppKit/Sources/UniviewNativeCore/UINode.swift:53](../../packages/UniviewAppKit/Sources/UniviewNativeCore/UINode.swift#L53)
(lines 53-66; the flattening is at lines 75-82, and the normalized node gets
`id: ""` because a bare string never had one).

The closed set, and what happens at its edge — this is the whole of "a
statically typed host cannot just render it anyway":

```swift
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown mutation type: \(type)"
            )
        }
```

[packages/UniviewAppKit/Sources/UniviewNativeCore/Mutation.swift:52](../../packages/UniviewAppKit/Sources/UniviewNativeCore/Mutation.swift#L52)
(lines 52-58)

And the divergence this step exists for — twelve lines the JS hosts do not have:

```swift
    /// Apply a commit batch in revision order. A batch whose revision is not
    /// newer than the last applied is ignored (idempotent replay / drift
    /// guard); returns whether it was applied.
    @discardableResult
    public func apply(_ batch: CommitBatch) -> Bool {
        if batch.revision <= revision { return false }
        for mutation in batch.mutations {
            apply(mutation)
        }
        revision = batch.revision
        return true
    }
```

[packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift:26](../../packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift#L26)
(lines 26-37). Its unit test is the one to read next: `staleOrDuplicateRevisionIsIgnored`
re-delivers revision 5 to a tree already at 5 and asserts both `applied == false`
and that the batch's node never entered the index
([Tests/UniviewNativeCoreTests/ShadowTreeTests.swift:90](../../packages/UniviewAppKit/Tests/UniviewNativeCoreTests/ShadowTreeTests.swift#L90)).

Two more that `main.ts` mirrors rather than quoting at length. The registry's
fallback is a real constructor parameter —
`public init(fallback: Component = UnknownComponent())`, with `component(for:)`
returning a non-optional `Component`
([ComponentRegistry.swift:13](../../packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift#L13),
and `component(for:)` at
[line 43](../../packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift#L43)) —
and `UnknownComponent` sets `label.stringValue = "Unknown: \(node.type)"` with
`label.textColor = .systemRed`
([Primitives.swift:857](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift#L857),
lines 857-871). The Style IR's field-by-field decode explains its own trade in a
comment worth reading in full: "All-or-nothing decoding is the wrong trade here:
the tree is a wire format shared with plugins that version independently of the
host"
([StyleIR.swift:351](../../packages/UniviewAppKit/Sources/UniviewNativeCore/StyleIR.swift#L351)).

### Where the revision number actually comes from

Nothing in the TypeScript half of Uniview mints one. `PluginToHostAPI` is
`applyMutations(mutations: Mutation[])` and has no revision field
([packages/protocol/src/rpc.ts:74](../../packages/protocol/src/rpc.ts#L74)). The
counter is stamped on the **host** side, by the Swift bridge:

`private func emit(_ mutations: [Mutation], _ onCommit: CommitHandler) async {
revision += 1; await onCommit(CommitBatch(revision: revision, mutations:
mutations)) }`
([PluginConnection.swift:128](../../packages/UniviewAppKit/Sources/UniviewBridge/PluginConnection.swift#L128),
lines 128-132).

That is worth being precise about, because it changes what the guard defends
against. As written today it protects against *host-side* re-delivery and
replay — a batch handed to `ShadowTree.apply` twice, a reconnect that re-runs a
frame, a `syncTree()` recovery racing a live commit, and out-of-order
application in general. It does **not** currently deduplicate a frame duplicated
on the wire, because a duplicated frame reaching `emit` gets a *fresh, higher*
revision. `CommitBatch` is `Codable`, so the day the plugin mints the counter
instead, the same six lines become a wire-level dedupe with no other change.

## What this step leaves out

- **Actual view construction.** `main.ts`'s "components" return strings. A real
  `Component` has seven members — `makeView`, `update`, `intrinsicSize`,
  `viewKind`, `contentView`, `didApplyLayout`, `mountsChildren` — and produces
  an `NSView` that is patched *in place*, never rebuilt. The comment on
  `viewKind` is the one to read: keying view reuse on the node's `type` alone
  meant "a `<div>` that grew a `material` prop kept its old plain view forever
  and the prop looked dead."
  [packages/UniviewAppKit/Sources/UniviewAppKit/Component.swift:22](../../packages/UniviewAppKit/Sources/UniviewAppKit/Component.swift#L22)
- **The mounter.** `mount()` here re-renders everything, every frame. The real
  `Mounter` reconciles the live `NSView` tree against the shadow tree keyed by
  node id, reuses views, removes departed ones, reorders siblings, and tears
  down surfaces that left the tree.
  [packages/UniviewAppKit/Sources/UniviewAppKit/Mounter.swift:1](../../packages/UniviewAppKit/Sources/UniviewAppKit/Mounter.swift#L1)
- **Layout.** There is none here at all — `styleSummary` prints `gap=8` and
  nothing acts on it. The real host runs a flexbox engine behind a
  `NodeMeasurer` seam, with a Yoga implementation, then `Mounter.applyLayout`
  writes frames and clamps `borderRadius` to half the box because "`rounded-full`
  asks for a pill by naming an absurd radius (9999)" and only the layout pass
  knows the final size.
  [packages/UniviewAppKit/Sources/UniviewNativeCore/LayoutEngine.swift:1](../../packages/UniviewAppKit/Sources/UniviewNativeCore/LayoutEngine.swift#L1),
  [packages/UniviewAppKit/Sources/UniviewYoga/YogaLayoutEngine.swift:1](../../packages/UniviewAppKit/Sources/UniviewYoga/YogaLayoutEngine.swift#L1),
  [Mounter.swift:36](../../packages/UniviewAppKit/Sources/UniviewAppKit/Mounter.swift#L36)
- **Focus and keyboard.** `autoFocus`, first-responder management, the
  `focusFieldOnce` dance in `TextInputComponent`, and a whole keyboard module
  that maps `onKeyDown` and moves focus between rows without a round trip to the
  plugin — because "high-frequency interaction is local, never RPC"
  (`CLAUDE.md`).
  [packages/UniviewAppKit/Sources/UniviewAppKit/Keyboard.swift:1](../../packages/UniviewAppKit/Sources/UniviewAppKit/Keyboard.swift#L1),
  [packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift:631](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift#L631)
- **Accessibility.** Nothing here has any. The real host gets most of it for free
  by building *native* controls (an `NSButton` is accessible because it is an
  `NSButton`), and feeds the user's settings back to the plugin as environment
  rather than as per-node props: `reduceMotion` and `highContrast` come from
  `NSWorkspace.accessibilityDisplayShouldReduceMotion` /
  `…ShouldIncreaseContrast` and are re-pushed on
  `accessibilityDisplayOptionsDidChangeNotification`. Per-node accessibility
  labels are not modelled in the protocol at all today.
  [packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift:46](../../packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift#L46)
- **Non-view nodes.** The registry here has one map. The real one has a second,
  for *surfaces* — a menu bar, a window, a notification: "The mounter hands the
  whole subtree to the surface instead of building views, and the layout engine
  skips it."
  [packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift:17](../../packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift#L17),
  [NativeSurface.swift:1](../../packages/UniviewAppKit/Sources/UniviewAppKit/NativeSurface.swift#L1),
  [MainMenu.swift:1](../../packages/UniviewAppKit/Sources/UniviewAppKit/MainMenu.swift#L1)
- **The transport.** The JSON in `main.ts` is a string literal. In production it
  arrives over kkrpc on a real channel, with `initialize`, `setEnvironment`,
  `executeHandler` and `destroy` going the other way.
  [packages/UniviewAppKit/Sources/UniviewBridge/PluginConnection.swift:1](../../packages/UniviewAppKit/Sources/UniviewBridge/PluginConnection.swift#L1)
- **The Style IR, all of it.** Seven fields here; fifty in the real `Field` enum,
  plus gradients-as-geometry, shadows-as-geometry, and `variants` — the `dark:` /
  `hover:` overlays that are resolved *by the host, per view* so a mouse-enter
  never becomes a round trip. Step 16.
  [packages/UniviewAppKit/Sources/UniviewNativeCore/StyleIR.swift:1](../../packages/UniviewAppKit/Sources/UniviewNativeCore/StyleIR.swift#L1)
- **The other Swift applier.** The repository contains two. `ShadowTree` is the
  library one. `MutableUINodeTree` is the earlier demo's, and it is *not* the
  same algorithm: it has no revision guard, and `applyAppendChild` does not
  detach an existing node first — which is exactly step 02's `NaiveTree` BUG 1,
  so an `appendChild` of an id already in that tree duplicates it. Its own tests
  never exercise a move.
  [examples/host-appkit-demo/HostAppKitDemo/ViewModels/MutableUINodeTree.swift:77](../../examples/host-appkit-demo/HostAppKitDemo/ViewModels/MutableUINodeTree.swift#L77),
  [examples/host-appkit-demo/tests/MutableUINodeTreeTests.swift:61](../../examples/host-appkit-demo/tests/MutableUINodeTreeTests.swift#L61)
- **Compiling any of this.** No Swift toolchain was available; nothing in this
  step was built or executed as Swift, and none of the output below came from a
  Swift process.

## Trade-offs

- **A JSON wire format with a fixed schema** is what makes a host in a language
  with no JS runtime a week of work instead of a port of a runtime. The cost is
  paid on every frame by the JS hosts too: they serialize and structured-clone a
  document nobody on their side needed, and they can never pass a live object,
  a `Date`, a `Map` or a function — even on the main thread where it would
  work (step 12 measures exactly that).
- **A closed set of mutation kinds and an open set of node types** buys both
  properties the project wants: a malformed frame cannot enter the tree, and a
  plugin can still ship a primitive the host has never heard of. The cost is
  that the two halves of one document fail in completely different ways, and a
  typo in `"appendchild"` is a hard rejection while a typo in `"Buton"` is a red
  placeholder — which is arguably backwards, since the second is the one a user
  sees.
- **A `fallback:` constructor parameter instead of `T | undefined`** removes the
  branch every host would otherwise have to remember to write. The cost is that
  "render nothing for unknown types" becomes inexpressible: a Swift host that
  wanted silence has to register a component that draws nothing, and a
  systematically misconfigured registry produces a screen of red labels rather
  than one loud failure.
- **The revision guard** turns "a batch arrived twice" from corruption into a
  no-op, for one integer comparison per batch. The cost is a counter someone has
  to mint correctly and monotonically: mint it in the wrong place — as today,
  host-side in `PluginConnection.emit` — and it defends against replay but not
  against wire-level duplication, which looks identical from the guard's side.
- **Mutating the shadow tree in place** avoids allocating a fresh path to the
  root per mutation, which the AppKit host would then throw away — it reconciles
  by id, not by reference equality. The cost is that the native host can never
  be driven by a framework that *does* diff by reference, and that "what did
  this batch change?" cannot be answered by comparing two trees; it has to be
  answered by the mounter walking the whole tree it just mutated.
- **Field-by-field Style IR decoding** keeps a plugin built against a newer
  `@uniview/style` usable — the node still gets its width, color and padding.
  The cost is a slow path (decode the object, and if that fails, decode it again
  key by key) and a failure mode that is silent unless the host wires up
  `onStyleIssue`: "unset means the drops stay silent."

## Run it

```
pnpm tsx steps/10-native-host/main.ts
```

Real output, **trimmed** from 119 lines to 41. Elided: section 1, most of
section 2, section 4's commentary, section 5's registry probes and mounted view
tree, section 6, and section 8's table (already reproduced in "What changed
since step 09" in prose). Every line below is verbatim; lines were removed
between them, never altered.

Section 3 — the decoder refusing three different malformed frames, and naming
the field:

```
=== 3. Input the decoder refuses, and what it says ===

  an unknown mutation kind:
    DecodingError.dataCorrupted at mutations[0].type: Unknown mutation type: swapChildren

  a field whose type does not match the schema:
    DecodingError.typeMismatch at mutations[0].node.children[0].text: Expected to decode String but found a number instead.

  a required key that is not there:
    DecodingError.keyNotFound at mutations[0].nodeId: No value associated with key "nodeId".
```

Section 4 — a prop whose type does not match, in the one place the protocol has
a schema for props, and then in the place it does not:

```
=== 4. A prop whose type does not match is a different problem ===
  props sent : gap=8  width="wide"  glow=3  color="accent"  height=null
  style kept : {gap=8 color=accent}
  reported   :
    node n1: style: unknown field 'glow' — ignored
    node n1: style: field 'width' has an unusable value — ignored (got "wide")
    props["disabled"] = .string("true")  ->  boolValue = nil  ->  isEnabled = true
    props["disabled"] read as an object  ->  objectValue = nil
```

Section 5 — the explicit fallback, and what an unregistered type looks like on
screen (`.systemRed`, in the real host):

```
  registry.isRegistered("sparkline") -> false
  registry.component("sparkline") === the fallback -> true
    [NSView #n1] {gap=8 color=accent}
      [NSTextField #n2t] "Clicked 0 times"
      [NSButton #n3] "Click me" enabled=false  target->executeHandler("h_1")
      Unknown: sparkline    <- NSTextField, .systemRed
```

Section 7 — the same batch delivered twice, then a stale batch, against the
revisioned applier and against step 02's naive one:

```
=== 7. The same batch, delivered twice ===
  apply(revision 1) -> guarded: true
  guarded children [n2t, n3, n5, n6]   revision=1
  naive   children [n2t, n3, n5, n6]

  ...the transport re-delivers revision 1 (reconnect / retry):
  guarded apply() returned false  (batch.revision <= revision)
  guarded children [n2t, n3, n5, n6]   revision=1
  naive   children [n2t, n3, n5, n6, n6]   <- n6 twice
  guarded tree unchanged? true
  naive   tree unchanged? false

  ...and a stale batch overtaken by a newer one:
  apply(revision 2) then apply(revision 1, late)
  guarded returned false -> n2 = "Clicked 2 times"
  naive  applied it     -> n2 = "Clicked 1 times"   <- the UI went backwards

  root object identity after a mutation: UNCHANGED
```

The lines worth staring at: `DecodingError.typeMismatch at
mutations[0].node.children[0].text` — a native host names the field, where a JS
host would have rendered `42` and moved on; `Unknown: sparkline` reached through
a non-optional `component(for:)` rather than a fallback branch someone had to
remember; and the last block, where one integer comparison is the difference
between an idempotent replay and a UI that shows a count going backwards.

## Sources

- [packages/UniviewAppKit/Sources/UniviewNativeCore/UINode.swift](../../packages/UniviewAppKit/Sources/UniviewNativeCore/UINode.swift) —
  the struct, and the `Codable` conformance that normalizes bare-string children
- [packages/UniviewAppKit/Sources/UniviewNativeCore/Mutation.swift](../../packages/UniviewAppKit/Sources/UniviewNativeCore/Mutation.swift) —
  the six-case enum, its throwing `default:`, and `CommitBatch`
- [packages/UniviewAppKit/Sources/UniviewNativeCore/JSONValue.swift](../../packages/UniviewAppKit/Sources/UniviewNativeCore/JSONValue.swift) —
  the enum with associated values, the Bool-before-Double ordering, and the
  Optional-returning accessors every component reads props through
- [packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift](../../packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift) —
  the revisioned applier and the idempotent-replay guard
- [packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowNode.swift](../../packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowNode.swift) —
  the reference-type node, `handlerId(for:)`, `renderedText`, `resolveStyle`
- [packages/UniviewAppKit/Sources/UniviewNativeCore/StyleIR.swift](../../packages/UniviewAppKit/Sources/UniviewNativeCore/StyleIR.swift) —
  field-by-field decoding, `StyleDecodeIssue`, and why all-or-nothing is wrong
- [packages/UniviewAppKit/Tests/UniviewNativeCoreTests/ShadowTreeTests.swift](../../packages/UniviewAppKit/Tests/UniviewNativeCoreTests/ShadowTreeTests.swift) —
  `staleOrDuplicateRevisionIsIgnored`, and the move-without-duplicating test
- [packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/ComponentRegistry.swift) —
  `init(fallback:)`, the non-optional `component(for:)`, surfaces, `standard()`
- [packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift) —
  `UnknownComponent`, and what reading a prop through an Optional accessor looks
  like in real component code
- [packages/UniviewAppKit/Sources/UniviewAppKit/Component.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Component.swift) —
  the seven members a real native component implements
- [packages/UniviewAppKit/Sources/UniviewAppKit/Mounter.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Mounter.swift) —
  NSView reconciliation by id, and `applyLayout`
- [packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift) —
  where accessibility settings actually enter the system
- [packages/UniviewAppKit/Sources/UniviewBridge/PluginConnection.swift](../../packages/UniviewAppKit/Sources/UniviewBridge/PluginConnection.swift) —
  the transport, and `emit`, where the revision counter is minted
- [examples/host-appkit-demo/HostAppKitDemo/ViewModels/MutableUINodeTree.swift](../../examples/host-appkit-demo/HostAppKitDemo/ViewModels/MutableUINodeTree.swift)
  and [examples/host-appkit-demo/tests/MutableUINodeTreeTests.swift](../../examples/host-appkit-demo/tests/MutableUINodeTreeTests.swift) —
  the earlier, unrevisioned Swift applier and its tests
- [packages/protocol/src/rpc.ts](../../packages/protocol/src/rpc.ts) —
  `applyMutations(mutations)`, which carries no revision
- [packages/protocol/src/validators.ts](../../packages/protocol/src/validators.ts) and
  [packages/host-sdk/src/validate.ts](../../packages/host-sdk/src/validate.ts) —
  the JS hosts' equivalent of a decoder, and why it is off by default
- [CLAUDE.md](../../CLAUDE.md) — "reimplemented on every platform", "small enough
  to reimplement per platform in about a week", and "high-frequency interaction
  is local, never RPC"
- [learn/DECISIONS.md](../DECISIONS.md) — the no-Swift-toolchain constraint this
  step was written under
- [learn/docs/02-mutable-tree.md](./02-mutable-tree.md) and
  [learn/docs/07-host-contract.md](./07-host-contract.md) — the JS applier this
  step is contrasted against, and the registry seam it re-reads in Swift
