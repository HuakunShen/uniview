# 01. `UINode` + six `Mutation` kinds — the entire contract between every layer

## Why

Uniview claims three independent fan-outs at once: author in React or Solid,
render in Svelte / Vue / React / a terminal / native AppKit, and run on the main
thread / in a Worker / in another process. Wired directly that would be an
N x M x K explosion of adapters. It isn't, because everything in the middle is
squeezed through one contract — a tree of `{id, type, props, children}` plus six
mutation kinds — and `CLAUDE.md` is what forces that contract to stay small:
"Uniview is a renderer. It renders what the tree says. It has no opinions of its
own." A renderer with no opinions has nothing to say beyond *here is the tree*
and *here is what changed*, so the protocol is exactly those two sentences and
nothing else. Get the shape wrong here and every failure downstream is a
protocol change that has to land in three languages simultaneously.

## Why this approach, and not the obvious alternative

The obvious alternative is the one every prototype starts with: **send the whole
tree on every render, and let the host re-mount it.** It is genuinely simpler —
one message shape, no ids needed, no ordering hazards — and Uniview still
supports it (`UpdateMode = "full" | "incremental"`,
[packages/protocol/src/mutations.ts:8](../../packages/protocol/src/mutations.ts#L8)).
What it cannot do is scale with the *size of the UI* rather than the *size of
the change*. Type one character into a search box nested in a 200-node list and
the full-tree encoding re-serializes all 200 nodes, structured-clones them
across the Worker boundary, and hands the host a tree with no identity
information — so the host either rebuilds every component (losing focus,
scroll position and caret) or has to invent a diff of its own, differently, in
each of five host adapters. `main.ts` prints the curve: the same three-field
edit costs 2.7x a mutation list inside a 4-row list and **124.8x** inside a
400-row one, while the mutation payload stays flat at 274 bytes.

The second alternative — *let each host diff two trees itself* — is worse in a
subtler way. It moves an identical, fiddly algorithm into every host, including
the one written in Swift with no JS runtime, and `CLAUDE.md` is explicit that
the ported surface must stay tiny: `UniviewNativeCore` is "deliberately small
enough to reimplement per platform in about a week". Six operations is a week.
A reconciler is not.

That is also why `props` is `Record<string, JSONValue>` and not
`Record<string, unknown>`. The narrowest boundary the tree must survive wins,
and the narrowest one is a Swift decoder with no JS in the room — after
structured clone has already eaten functions, prototypes and getters. Which is
precisely why an `onClick` closure cannot travel and shows up in the props as
the string `_onClickHandlerId` instead.

## How Uniview really does it

The node type, verbatim — four required fields and one optional:

```typescript
export interface UINode {
  /** Unique identifier for this node (for reconciliation) */
  id: string;
  /** Component type - layout tag, product primitive, or TEXT_NODE_TYPE */
  type: string;
  /** Props object with only JSON-serializable values */
  props: Record<string, JSONValue>;
  /** Child nodes or text content */
  children: (UINode | string)[];
  /** Text content — only set when `type` is TEXT_NODE_TYPE */
  text?: string;
}
```

[packages/protocol/src/tree.ts:126](../../packages/protocol/src/tree.ts#L126)

`JSONValue` is the whole reason `props` is safe to send anywhere:

```typescript
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue };
```

[packages/protocol/src/tree.ts:4](../../packages/protocol/src/tree.ts#L4)

And the union that every host must implement in full and may not extend — the
list is six long, and that is the entire ported surface:

```typescript
export type Mutation =
	| AppendChildMutation
	| InsertBeforeMutation
	| RemoveChildMutation
	| SetTextMutation
	| SetPropsMutation
	| SetRootMutation;
```

[packages/protocol/src/mutations.ts:80](../../packages/protocol/src/mutations.ts#L80)

The individual members carry rules this step only mentions in comments — notably
that `appendChild` and `insertBefore` are **moves** when the node id already
exists in the host's tree, and that `setProps` sends full props rather than a
diff. Both are documented at
[packages/protocol/src/mutations.ts:10](../../packages/protocol/src/mutations.ts#L10)
(lines 10-75).

## What this step leaves out

- **Runtime validation.** The real protocol ships a Zod schema for every type —
  `UINodeSchema`, `MutationSchema`, `JSONValueSchema` and per-RPC-method request
  schemas — plus `validateUINode` / `isValidMutations` guards. This step trusts
  its own literals; production cannot, because the tree arrives as an anonymous
  blob out of `JSON.parse`.
  [packages/protocol/src/validators.ts:7](../../packages/protocol/src/validators.ts#L7)
- **Version negotiation.** `PROTOCOL_VERSION` is currently `3`, and the host
  passes `protocolVersion` in the `initialize()` handshake so a mismatched
  plugin is rejected rather than silently mis-parsed. Nothing here has a
  version at all.
  [packages/protocol/src/version.ts:9](../../packages/protocol/src/version.ts#L9),
  [packages/protocol/src/rpc.ts:15](../../packages/protocol/src/rpc.ts#L15)
- **Event and handler plumbing.** `main.ts` hardcodes the string
  `_onClickHandlerId: "h_1"` to show that a function cannot ride in `props`. The
  real mapping is machinery: eleven supported `EventPropName`s, `handlerIdProp()`
  / `isHandlerIdProp()` / `extractEventName()` to convert both directions, a
  `KeyDownEvent` payload shaped field-for-field like the DOM's so a native host
  cannot invent its own names, and an `executeHandler` RPC to call back into the
  plugin. Steps 13 and 15.
  [packages/protocol/src/events.ts:4](../../packages/protocol/src/events.ts#L4)
- **The richer text-node representation.** This step defines `TEXT_NODE_TYPE`
  and `isTextUINode`, but skips `textContent()`, the helper that reads a child
  whether it is a v3 explicit text node *or* a legacy bare string. Hosts must
  keep rendering bare strings — "NEVER drop text children" is a listed
  anti-pattern in `CLAUDE.md` — and this step's `show()` handles them only well
  enough to label them.
  [packages/protocol/src/tree.ts:159](../../packages/protocol/src/tree.ts#L159)
- **The full layout-tag set.** `LAYOUT_TAGS` here is 7 tags; the real one is 40,
  exported as a runtime array so hosts can check membership, with `isLayoutTag`
  as a type guard. The list is append-only by policy: "NEVER remove
  LAYOUT_TAGS — hosts may rely on existing tags."
  [packages/protocol/src/tree.ts:61](../../packages/protocol/src/tree.ts#L61)
- **Everything the protocol package carries besides the tree.** The RPC
  contracts in both directions (`HostToPluginAPI` / `PluginToHostAPI`) and the
  host environment push (`setEnvironment`, color scheme / accent color /
  reduce-motion) are protocol too, and are why hover and dark mode never
  round-trip to the plugin.
  [packages/protocol/src/rpc.ts:10](../../packages/protocol/src/rpc.ts#L10),
  [packages/protocol/src/environment.ts:1](../../packages/protocol/src/environment.ts#L1)
- **Applying any of this.** Nothing in this step mutates anything. The host-side
  tree, the id index, and the move-vs-insert handling are step 02.

## Trade-offs

- **Every node needs a stable `id`, forever.** That is real bookkeeping pushed
  onto each renderer (React and Solid must both mint and preserve ids). It buys
  the ability to address a single text node across a process boundary — which
  is what makes a 274-byte update possible instead of a 34 KB one.
- **`props` is JSON-only, so functions cannot travel.** Every callback becomes
  a registry id plus a round trip. The payoff is that the *same* tree renders in
  Swift with no JS runtime, and the transport can be swapped from "nothing" to
  structured clone to a WebSocket without the protocol noticing.
- **Six operations is a hard ceiling.** No `setAttribute`, no batched
  reorder, no partial prop diff. Anything richer must be expressed as a
  composition of the six, which sometimes costs bytes — `setProps` resends
  props that did not change. What it buys is a renderer a team can port to a
  new platform in about a week.
- **`type` is a bare `string`, not an enum.** A product can add primitives
  without touching `@uniview/protocol`, which is the app-agnostic half of the
  prime directive. The cost is that an unknown `type` is a runtime problem in
  the host, not a compile-time one in the plugin.
- **Text as a node, not a string, makes small trees bigger.** `"hi"` becomes
  ~60 bytes of `{id, type, props, children, text}`. It buys addressability:
  `setText` by node id, and text nodes usable as `insertBefore` anchors — the
  thing the pre-v3 parent-plus-child-index scheme got wrong.

## Run it

```
pnpm tsx steps/01-protocol/main.ts
```

Real output, **trimmed** to the two parts that carry the idea. Elided: the
second pretty-printed tree, the two full `JSON.stringify(..., null, 2)` dumps
(about 70 lines), and section 4's `insertBefore` / `removeChild` records. Every
line below is verbatim.

```
=== 1. A UI, as data ===
<column#n1 gap=8 padding=16>  // product primitive
  #text#n2 "Clicked 0 times"
  <button#n3 disabled=true _onClickHandlerId="h_1">  // layout tag
    #text#n4 "Click me"

311 bytes of JSON.

  whole tree :   422 bytes
  mutations  :   274 bytes
  ratio      : 1.54x

  the same edit inside a larger UI:
    +  4 rows   whole tree    746 B   mutations    274 B   2.7x
    + 40 rows   whole tree   3722 B   mutations    274 B   13.6x
    +400 rows   whole tree  34202 B   mutations    274 B   124.8x
```

The three trailing lines of section 3 are the whole argument for step 05: the
mutation payload is flat at 274 bytes because it is proportional to what
changed, while the full-tree payload grows with how big the UI *is*.

## Sources

- [packages/protocol/src/tree.ts](../../packages/protocol/src/tree.ts) —
  `JSONValue`, `UILayoutTag`, `LAYOUT_TAGS`, `TEXT_NODE_TYPE`, `UINode`,
  `isLayoutTag`, `isTextUINode`, `textContent`
- [packages/protocol/src/mutations.ts](../../packages/protocol/src/mutations.ts) —
  `UpdateMode` and the six mutation interfaces behind the `Mutation` union
- [packages/protocol/src/validators.ts](../../packages/protocol/src/validators.ts) —
  Zod schemas and validation guards
- [packages/protocol/src/version.ts](../../packages/protocol/src/version.ts) —
  `PROTOCOL_VERSION`
- [packages/protocol/src/events.ts](../../packages/protocol/src/events.ts) —
  `HandlerId`, `EventPropName`, `KeyDownEvent`, handler-prop helpers
- [packages/protocol/src/rpc.ts](../../packages/protocol/src/rpc.ts) —
  `HostToPluginAPI`, the `initialize` handshake, `setEnvironment`
- [packages/protocol/src/environment.ts](../../packages/protocol/src/environment.ts) —
  `HostEnvironment`
- [packages/protocol/src/index.ts](../../packages/protocol/src/index.ts) and
  [packages/protocol/src/core.ts](../../packages/protocol/src/core.ts) — what the
  package actually exports
- [CLAUDE.md](../../CLAUDE.md) — "THE PRIME DIRECTIVE", the primitive-set ceiling,
  and the protocol anti-patterns
- [learn/steps/00-scaffold-probe/main.ts](../steps/00-scaffold-probe/main.ts) —
  the `show()` printing style this step extends
