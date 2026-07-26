# 08. Recursive component rendering, the web host in its natural idiom

> **Scope note, up front.** `learn/` has no Svelte compiler and this step does
> not add one. **Nothing in this step was run through Svelte.** `main.ts`
> implements the *algorithm* that `packages/host-svelte/src/ComponentRenderer.svelte`
> embodies — recursive dispatch, prop transformation, handler binding, event
> serialization — in plain TypeScript, branch for branch in the real file's
> order, printing markup where the real one creates DOM nodes. The Svelte
> quoted below is quoted, not executed. Step 09 runs the same algorithm inside
> two frameworks that `learn/` *can* run.

## Why

Step 07 defined the seam and proved it was real by hanging two hosts off one
controller. It did not say what writing one of those hosts actually involves.
This step is that: the single file every web host adapter is a variation of.

The failure it prevents is the one every "just render the tree" attempt hits on
day two. A `UINode` tree is arbitrarily deep, its `type` field is a bare string,
and its interactive props are *strings pretending to be functions*
(`_onClickHandlerId: "node-10:onClick"`). Render it with a tree-walking loop and
you get markup, but nothing is clickable; wire the handler naively and you hand
a live DOM `Event` to `controller.executeHandler`, which in Worker mode is a
structured-clone boundary and throws — the anti-pattern list says it in one
line: "NEVER pass functions directly over RPC - use handler-registry pattern"
([CLAUDE.md](../../CLAUDE.md)). The recursive component solves the depth, the
prop transformer solves the strings, and `serializeHandlerArgs` solves the
event. Those three are the whole adapter.

## Why this approach, and not the obvious alternative

The obvious alternative to a self-importing component is **one function that
walks the tree and builds a DOM subtree**, the way step 07's host A built a
string tree. It works, and it is what the terminal host does
([packages/host-tui/src/convert.ts:156](../../packages/host-tui/src/convert.ts#L156)).
On the web it costs you the framework. Svelte's keyed `{#each}` reuses a DOM
node when `child.id` is unchanged; a manual walker re-creates the subtree, and
re-creating a subtree destroys focus, scroll position, text selection, IME
composition state and any in-flight CSS transition on every frame. A plugin that
re-renders on each keystroke — which is exactly what a filter input does, and
what section 7 of `main.ts` prints — would clear the input on every character.
The recursion has to be *in the component system*, because only the component
system knows how to leave a DOM node alone. That is why the real file's line 8
is `import Self from "./ComponentRenderer.svelte"`: it is not a stylistic
choice, it is how you get the framework's identity tracking applied per node.

The alternative to `serializeHandlerArgs` is to **forward the event object and
let the transport deal with it**. It cannot. A DOM `Event` holds `target`, an
element, which holds `ownerDocument`, which holds the whole document — cyclic,
and full of host objects. `main.ts` reproduces the shape in two lines and prints
what the platform says:

```
  JSON.stringify(event) -> Converting circular structure to JSON
```

In a browser `structuredClone` fails the same way with `DataCloneError`. The
second-most-obvious alternative — pick a fixed field set for *all* events — is
what the real file used to do for keyboard events, and the fix comment is still
in the source: keydown/keyup "were wrapped as `() => handler()`, so plugins
never saw which key was pressed"
([ComponentRenderer.svelte:117](../../packages/host-svelte/src/ComponentRenderer.svelte#L117)).
The answer is a table keyed by event name: a click sends `[]`, an input sends
one string, a keydown sends six named fields — the same six that
`packages/protocol/src/events.ts` declares as `KeyDownEvent` so a native host
with no DOM at all can produce them too
([events.ts:35](../../packages/protocol/src/events.ts#L35)).

## What changed since step 07

Step 07's host A was a recursive string renderer already — deliberately, because
it was standing in for this. The delta is everything that makes it a *real* web
host rather than an outline printer:

- **The protocol's real event helpers.** Step 07 read handler props with one
  regex, `/^_on([A-Z][A-Za-z]*)HandlerId$/`, and lower-cased the capture. That
  is replaced by `isHandlerIdProp` / `extractEventName` / `handlerIdProp` copied
  from `packages/protocol/src/events.ts`, plus the eleven-name `EVENT_PROPS`
  whitelist. The difference is a whole branch: `extractEventName` returns `null`
  for a prop the host cannot fire, and that prop is **passed through as an
  attribute**, neither bound nor dropped.
- **`LAYOUT_TAGS` is now the full 40 entries**, not step 07's subset of seven,
  because this step special-cases six tags and needs the other 34 to fall
  through to.
- **`transformProps`.** New. Step 07 serialized every prop into an attribute
  string. This one has seven outcomes — skipped, bound, passed through, renamed
  to `class`, renamed to `for`, flattened from a style object to a CSS string,
  copied — and `main.ts` prints the table for a node that exercises all of them.
- **`serializeHandlerArgs`.** New, mirroring
  `packages/host-svelte/src/event-handlers.ts` including its duck-typing
  (`looksLikeDomEvent`, not `instanceof Event`).
- **`attachEvents` / `wrapEventListener`.** New. Step 07 rendered
  `on:click="h_1"` as text. Here the ten-entry `EVENT_MAP` is real, listeners
  are recorded per node, and `main.ts` fires them: click, input, keydown, submit.
- **Real plugin-side closures.** Step 07's `ScriptedController` mapped a handler
  id to a fixed mutation batch and *ignored the args*. Here the map holds
  closures that read them — typing `beta` is what causes the `removeChild`.
- **Seven dispatch branches instead of five.** Void elements and the six
  special-cased tags (`button`, `input`, `textarea`, `select`, `a`, `form`) are
  new, and their position in the chain is load-bearing (see below).
- Gone from step 07: host B, the grid painter, the side-by-side comparison, and
  `styleColorToken`. They made their point.

## How Uniview really does it

The recursion, and the keying that makes it worth doing — the generic
`LAYOUT_TAGS` branch, verbatim:

```svelte
{:else if LAYOUT_TAGS.includes(node.type as typeof LAYOUT_TAGS[number])}
	{@const p = transformProps(node.props)}
	<svelte:element this={node.type} {...p.attrs} use:attachEvents={p}>
		{#each node.children as child, i (typeof child === "string" ? `str-${i}` : child.id)}
			<Self node={child} />
		{/each}
	</svelte:element>
```

[packages/host-svelte/src/ComponentRenderer.svelte:222](../../packages/host-svelte/src/ComponentRenderer.svelte#L222)
(lines 222-228). `Self` is the file importing itself
([line 8](../../packages/host-svelte/src/ComponentRenderer.svelte#L8)). The
`(child.id)` key expression is why step 01 insisted every node carry a stable
id; bare string children have none, hence the `str-${i}` fallback.

The bridge from a prop string to a function — five lines, and every bound
handler in the host goes through it:

```typescript
	function createHandler(handlerId: string, eventName: string) {
		return async (...args: unknown[]) => {
			await controller.executeHandler(handlerId, serializeHandlerArgs(eventName, args));
		};
	}
```

[packages/host-svelte/src/ComponentRenderer.svelte:21](../../packages/host-svelte/src/ComponentRenderer.svelte#L21)
(lines 21-25)

And the per-event field picking, which is the entire reason `event-handlers.ts`
exists ("DOM Event objects are not structured-cloneable" is its file comment):

```typescript
export function serializeHandlerArgs(eventName: string, args: unknown[]): JSONValue[] {
  if (args.length === 0) return [];
  if (EVENT_ONLY_HANDLER_NAMES.has(eventName) && looksLikeDomEvent(args[0])) return [];
  if ((eventName === "onInput" || eventName === "onChange") && looksLikeDomEvent(args[0])) {
    return [readTargetValue(args[0])];
  }
  if ((eventName === "onKeyDown" || eventName === "onKeyUp") && looksLikeKeyboardEvent(args[0])) {
    return [serializeKeyboardEvent(args[0])];
  }
  return args.filter(isJsonValue);
}
```

[packages/host-svelte/src/event-handlers.ts:15](../../packages/host-svelte/src/event-handlers.ts#L15)
(lines 15-25)

Two details of the real file worth reading next to those. The `{#if}` chain's
**order** is part of the contract: `VOID_ELEMENTS` (`hr`, `br`, `img`, `wbr`) is
tested at
[line 185](../../packages/host-svelte/src/ComponentRenderer.svelte#L185), before
the six special tags and long before the generic `LAYOUT_TAGS` branch — which is
why `hr` never gets an event listener even though it is a layout tag that could
carry a handler prop, and why `wbr` renders at all despite *not* being in
`LAYOUT_TAGS`. And the fallback at
[line 263](../../packages/host-svelte/src/ComponentRenderer.svelte#L263) is
`<div class="uniview-unknown">Unknown: {node.type}</div>` — the same string
AppKit's `UnknownComponent` reaches independently
([Primitives.swift:868](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift#L868)).

The wiring above it is small enough to summarise: `PluginHost.svelte` puts the
controller and registry into Svelte context
([PluginHost.svelte:22](../../packages/host-svelte/src/PluginHost.svelte#L22)),
subscribes and connects on mount, disconnects on destroy, and renders exactly
one `<ComponentRenderer node={tree} />`
([PluginHost.svelte:65](../../packages/host-svelte/src/PluginHost.svelte#L65)).
Context is how a component twelve levels deep reaches `executeHandler` without
twelve levels of prop drilling.

### The transformation table

Every rule in `transformProps`, with the branch it comes from
([ComponentRenderer.svelte:41](../../packages/host-svelte/src/ComponentRenderer.svelte#L41),
lines 41-115):

| Raw prop on the `UINode` | Becomes |
|---|---|
| `children`, `key` | dropped (framework-internal) |
| `_onClickHandlerId: "id"` | `onclick = () => executeHandler("id", [])` |
| `_onInputHandlerId: "id"` | `oninput = (e) => executeHandler("id", [e.target.value])` |
| `_onChangeHandlerId: "id"` | **both** `oninput` and `onchange` — React's `onChange` fires per keystroke, the DOM's fires on commit |
| `_onKeyDownHandlerId: "id"` | `onkeydown = (e) => executeHandler("id", [{key, code, altKey, ctrlKey, metaKey, shiftKey}])` |
| `_onSubmitHandlerId: "id"` | `onsubmit`, wrapped so `preventDefault()` runs first |
| `_onFocus/_onBlur/_onMouseEnter/_onMouseLeaveHandlerId` | bound; serialize to `[]` |
| `_onWheelHandlerId` | **falls through to an attribute** — on the protocol whitelist, no branch in the host |
| any other `_...HandlerId` | attribute, so a registered component can relay it |
| `_style` | dropped on the web; it is the Style IR for hosts with no CSS engine (step 16) |
| `className` | `class` |
| `htmlFor` | `for` |
| `style: {fontSize: "14px"}` | `style="font-size: 14px"` |
| everything else | copied to `attrs` unchanged |

## What this step leaves out

- **Patching. The whole of it.** `main.ts` re-renders the entire markup and
  rebuilds every listener on every frame. Svelte does not: each `<Self>` is a
  live component instance, `{#each ... (child.id)}` reuses DOM nodes across
  frames, and the `attachEvents` action returns `{ update, destroy }` so
  listeners are swapped rather than re-created. Without that, focus and caret
  position in the filter input would be lost on every keystroke.
  [packages/host-svelte/src/ComponentRenderer.svelte:158](../../packages/host-svelte/src/ComponentRenderer.svelte#L158)
- **The DOM.** There is no `document` here; `attachEvents` records a listener
  against a node id instead of calling `el.addEventListener`, and `dispatch()`
  invokes it directly. Real events bubble, can be cancelled by an ancestor, and
  arrive with a real `target` — none of which this file can show.
  [packages/host-svelte/src/ComponentRenderer.svelte:133](../../packages/host-svelte/src/ComponentRenderer.svelte#L133)
- **`<svelte:element>`.** The generic branch renders *any* of the 34 remaining
  layout tags with one line, using a Svelte feature with no plain-TypeScript
  equivalent. `main.ts` emits a string instead.
  [packages/host-svelte/src/ComponentRenderer.svelte:224](../../packages/host-svelte/src/ComponentRenderer.svelte#L224)
- **The host lifecycle.** `PluginHost.svelte` owns connect-on-mount,
  disconnect-on-destroy, a `loading` snippet, a fatal-error panel, and a
  dismissable runtime-error banner fed by `subscribeErrors` and cleared whenever
  a fresh tree arrives. `main.ts` calls `connect()` and prints.
  [packages/host-svelte/src/PluginHost.svelte:25](../../packages/host-svelte/src/PluginHost.svelte#L25)
- **A registered component's real job.** `Badge` here returns two lines of
  markup. A real one receives `_childNodes` (the raw `UINode[]`, so it can
  render children itself rather than accepting the host's), `_nodeId`, and a
  `title` fallback synthesised from text children — and it is the component's
  job to decide whether to render the default children snippet at all.
  [packages/host-svelte/src/ComponentRenderer.svelte:233](../../packages/host-svelte/src/ComponentRenderer.svelte#L233)
- **Two gaps in the real file that `main.ts` reproduces rather than fixes.**
  `_onWheelHandlerId` is on `EVENT_PROPS` but has no branch in `transformProps`,
  so it silently becomes an attribute
  ([ComponentRenderer.svelte:78](../../packages/host-svelte/src/ComponentRenderer.svelte#L78));
  and `componentProps` for a registered component passes `onclick` … `onkeyup`
  but **not** `onmouseenter` / `onmouseleave`, so a registered component can
  never receive hover callbacks
  ([ComponentRenderer.svelte:241](../../packages/host-svelte/src/ComponentRenderer.svelte#L241)).
- **One place `main.ts` deliberately deviates.** The real `button` branch is
  `<button class="cursor-pointer {p.attrs.class || ''}" {...p.attrs} …>` — the
  spread comes *after* the composed class, so a plugin that sets `className`
  overrides it and `cursor-pointer` is lost. `main.ts` puts the composed class
  last, i.e. the intent rather than the letter. Flagged in a comment at the
  branch.
  [packages/host-svelte/src/ComponentRenderer.svelte:190](../../packages/host-svelte/src/ComponentRenderer.svelte#L190)
- **Style IR resolution.** `_style` is dropped here with a one-line comment, as
  in the real web host. The hosts that have to *resolve* it — AppKit, the
  terminal — are steps 10, 11 and 16.
  [packages/host-svelte/src/ComponentRenderer.svelte:91](../../packages/host-svelte/src/ComponentRenderer.svelte#L91)
- **`isJsonValue` has no depth or cycle guard.** It recurses through
  `Object.values` on any object a component hands its callback; a cyclic plain
  object overflows the stack rather than being rejected. It is also an O(n) walk
  of the payload on every event.
  [packages/host-svelte/src/event-handlers.ts:71](../../packages/host-svelte/src/event-handlers.ts#L71)
- **The transport.** `executeHandler` here is a method call on an object in the
  same module. Steps 13 and 14 put a structured-clone boundary and then a socket
  under it, which is when `serializeHandlerArgs` stops being a precaution and
  starts being load-bearing.
  [packages/host-sdk/src/controllers/worker.ts:96](../../packages/host-sdk/src/controllers/worker.ts#L96)

## Trade-offs

- **A component that imports itself** costs one framework component instance per
  node — a 500-node tree is 500 instances, each with its own props and lifecycle
  — and buys the framework's per-node identity tracking, which is the only thing
  that keeps a focused input focused across a re-render. The alternative, a
  manual DOM walker, is faster to write and destroys focus on every frame.
- **Sending `[]` for a click** makes the wire payload for the most common event
  in any UI exactly zero bytes of arguments, and means a plugin that genuinely
  needs `event.clientX` cannot have it without changing the protocol. The bet is
  that a plugin already knows which node it attached the handler to, so position
  and target are redundant nine times out of ten.
- **Passing unrecognised `_...HandlerId` props through as attributes** rather
  than dropping them lets an app define handlers the protocol has never heard of
  (`_onSearchTextChangeHandlerId`) and relay them from a registered component.
  The cost is that a typo in a whitelisted name — `_onCLickHandlerId` — is not
  an error anywhere: it becomes a silent DOM attribute and the button does
  nothing, forever.
- **Hardcoding six tags before the generic branch** gets you a real `<input>`
  with real `value` binding and a `<form>` that does not navigate on submit. The
  cost is a chain whose order is now load-bearing and undocumented in the type
  system: move `VOID_ELEMENTS` below `LAYOUT_TAGS` and `wbr` stops rendering,
  move it above `button` and buttons stop being clickable.
- **Re-rendering from the tree root on every mutation batch**, which is what
  `main.ts` does and what `PluginHost.svelte` sets up by assigning `tree = newTree`,
  is trivially correct and pushes all the incremental work onto the framework's
  diff. It also means the cost of one keystroke is proportional to the size of
  the whole tree, which is exactly the pressure step 05 answered on the plugin
  side and step 11 has to answer again in a terminal with no framework to lean on.

## Run it

```
pnpm tsx steps/08-recursive-host/main.ts
```

Real output, **trimmed** from 216 lines to the 87 that carry the idea. Elided:
section 1 (the 21-node input tree), five rows of section 3's table, section 4
(the listener table), sections 8, 10 and 11, and most trailing commentary. Every
line below is verbatim, indentation included; lines were removed between them,
never altered.

Section 2 — one function, called once per node, calling itself for children.
Note `<hr />` with no listener, the `Unknown:` div where `Sparkline` should be,
and the two handler props that survived as attributes on the `<input>`:

```
=== 2. One function, called once per node, calling itself for children ===
  <div class="panel" style="padding: 16px; border-radius: 8px">
    <header>
      <h2>
        Tunnels
      </h2>
      <p class="muted">
        Clicked 0 times
      </p>
    </header>
    <form use:attachEvents={submit}>
      <label for="filter-field">
        Filter
      </label>
      <input value="" placeholder="filter tunnels" class="field" style="font-size: 14px; border-radius: 6px" _onWheelHandlerId="node-9:onWheel" _onSearchTextChangeHandlerId="node-9:onSearchTextChange" use:attachEvents={input,keydown} />
      <button disabled={false} class="cursor-pointer" use:attachEvents={click}>
        Add tunnel
      </button>
    </form>
    <hr />
    <ul>
      <li>
        alpha - up
      </li>
      <li>
        beta - up
      </li>
    </ul>
    <Badge tone="info" title="2 online" onclick={fn} _nodeId="node-18" _childNodes={1}>
      2 online
    </Badge>
    <div class="uniview-unknown">Unknown: Sparkline</div>
  </div>

  dispatch branches taken, in the real file's test order:
    bare string    0
    text node      7
    void element   1
    special tag    3
    layout tag     8
    registry       1
    unknown        1
```

Section 3 — the prop transformation table for `<input#node-9>`, raw props in,
attributes and bound handlers out (six of the eleven rows shown):

```
  raw prop                          value                          -> becomes
  ------------------------------------------------------------------------------------------------
  className                         "field"                        renamed        class
  style                             {"fontSize":"14px","borderR…   flattened      style="font-size: 14px; border-radius: 6px"
  _style                            {"color":"accent"}             skipped        — (Style IR is for non-CSS hosts; step 16)
  _onInputHandlerId                 "node-9:onInput"               BOUND          oninput() -> executeHandler
  _onWheelHandlerId                 "node-9:onWheel"               no DOM binding attrs["_onWheelHandlerId"] (a component must relay it)
  _onSearchTextChangeHandlerId      "node-9:onSearchTextChange"    off whitelist  attrs["_onSearchTextChangeHandlerId"] (a component must relay it)
```

Section 5 — why the event cannot travel, and what does instead:

```
=== 5. A live DOM event cannot cross the boundary ===
  JSON.stringify(event) -> Converting circular structure to JSON
  structuredClone(event) fails the same way in a browser (DataCloneError on
  the element reference). So the host extracts a JSON subset per event name:
    onClick   -> []                       (nothing at all)
    onInput   -> ["beta"]
    onKeyDown -> [{"key":"Enter","code":"Enter","altKey":false,"ctrlKey":false,"metaKey":true,"shiftKey":false}]
```

Sections 6-7 — a click and a keystroke, end to end. The `[host]` line is
everything that crosses the boundary; the `[plugin]` line is the closure on the
other side receiving it:

```
=== 6. A user clicks the button ===
      [user]   click on <button#node-10>
      [host]   executeHandler("node-10:onClick", [])   <-- the ONLY bytes that cross
      [plugin] closure "node-10:onClick" ran with args []
      [host]   listener found and fired: true
      [host]   subscriber re-rendered; what changed in the markup:
        - Clicked 0 times
        + Clicked 1 times

=== 7. The user types, then presses Enter ===
      [user]   input on <input#node-9>, value now "beta"
      [host]   executeHandler("node-9:onInput", ["beta"])   <-- the ONLY bytes that cross
      [plugin] closure "node-9:onInput" ran with args ["beta"]
        - alpha - up
        - 2 online
        + 1 online

      [user]   keydown Enter on <input#node-9> (with Meta held)
      [host]   executeHandler("node-9:onKeyDown", [{"key":"Enter","code":"Enter","altKey":false,"ctrlKey":false,"metaKey":true,"shiftKey":false}])   <-- the ONLY bytes that cross
      [plugin] closure "node-9:onKeyDown" ran with args [{"key":"Enter","code":"Enter","altKey":false,"ctrlKey":false,"metaKey":true,"shiftKey":false}]
        + beta-2 - starting
        + 2 online
```

And section 9 — the fallback is the registry's business, not the renderer's.
Registering `Sparkline` and re-rendering changes the output without changing a
line of the renderer:

```
=== 9. The type this host has never heard of ===
  <div class="uniview-unknown">Unknown: Sparkline</div>
  registry.list() -> [Badge]
  registry.has("Sparkline") -> false
  The subtree was not dropped and nothing threw. Register it and the SAME
  renderer draws it — the renderer never changed:
  <Sparkline>▂▄▆█▆▃</Sparkline>
```

The lines worth staring at: `executeHandler("node-10:onClick", [])` — a click
sends *no arguments at all*; the branch tally, where 21 nodes took seven
different paths through one function; and `- alpha - up` disappearing because a
plugin closure on the other side of a boundary decided a row no longer matched.

## Sources

- [packages/host-svelte/src/ComponentRenderer.svelte](../../packages/host-svelte/src/ComponentRenderer.svelte) —
  the file this step distils: `Self`, `createHandler`, `transformProps`,
  `wrapEventListener`, `attachEvents`, the seven-branch dispatch chain, and the
  `Unknown:` fallback
- [packages/host-svelte/src/event-handlers.ts](../../packages/host-svelte/src/event-handlers.ts) —
  `serializeHandlerArgs` and the per-event field picking
- [packages/host-svelte/src/PluginHost.svelte](../../packages/host-svelte/src/PluginHost.svelte) —
  context, subscribe, connect-on-mount, the error banner
- [packages/protocol/src/events.ts](../../packages/protocol/src/events.ts) —
  `EVENT_PROPS`, `handlerIdProp`, `isHandlerIdProp`, `extractEventName`,
  `KeyDownEvent`
- [packages/protocol/src/tree.ts](../../packages/protocol/src/tree.ts) —
  `LAYOUT_TAGS` (all 40), `TEXT_NODE_TYPE`, `isLayoutTag`, `isTextUINode`,
  `textContent`
- [packages/host-sdk/src/types.ts](../../packages/host-sdk/src/types.ts) —
  `PluginController` and `ComponentRegistry`, carried forward from step 07
  unchanged
- [packages/host-sdk/src/controllers/worker.ts](../../packages/host-sdk/src/controllers/worker.ts) —
  the boundary that makes event serialization mandatory rather than tidy
- [packages/host-tui/src/convert.ts](../../packages/host-tui/src/convert.ts) —
  the same job done by a walker instead of a recursive component, for contrast
- [packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift) —
  `UnknownComponent`, the same `Unknown: <type>` string reached in Swift
- [CLAUDE.md](../../CLAUDE.md) — "NEVER pass functions directly over RPC", "NEVER
  drop text children", "NEVER access `window` or `document` in plugins"
- [learn/docs/07-host-contract.md](./07-host-contract.md) and
  [learn/steps/07-host-contract/main.ts](../steps/07-host-contract/main.ts) —
  the contract this step implements one side of
- [learn/steps/04-serializing-the-tree/main.ts](../steps/04-serializing-the-tree/main.ts) —
  where `node-10:onClick` was minted, and the registry that still holds the
  closure
