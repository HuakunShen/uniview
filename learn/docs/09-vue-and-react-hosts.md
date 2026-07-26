# 09. The same three jobs in two more frameworks — what is shared, what is adapter-specific

## Why

Stage C's promise is that one plugin tree renders on Svelte, Vue, React, a
terminal and AppKit. Step 08 delivered the first web host and it is easy to
finish that step believing the interesting work lives in Svelte. It does not:
the same tree has to render in Vue and in React, and the only way to know
whether the protocol is really framework-neutral is to write the other two
adapters and check that they produce the same screen. This step does exactly
that — both hosts run for real in `main.ts`, and the run prints
`IDENTICAL AFTER NORMALIZATION: true`.

The failure mode this guards against is the protocol quietly acquiring a home
framework. A `UINode` field that only React can express, an event payload only a
DOM `Event` can carry, a children convention that assumes varargs — any of those
and "many hosts" becomes "React, plus two ports that mostly work". Writing the
second and third adapter is how you find out, and it is why the three real
renderers in this repository ended up structurally identical while sharing no
code at all.

## Why this approach, and not the obvious alternative

The obvious alternative is a **shared framework-agnostic core**: one
`renderTree(node, emit)` in `@uniview/host-web` that all three web adapters call,
with a thin per-framework shim. It sounds like it removes triplication. It
cannot be written, and the printed table in section 5 is the list of reasons.
The core would have to decide, for every node, whether the class attribute is
`className` or `class`, whether children are a third positional argument
(React), a `VNode[]` (Vue), an `{#each}` block (Svelte), or a slots record; and
whether events are element props (React, Vue) or `addEventListener` calls made
by an action (Svelte —
[packages/host-svelte/src/ComponentRenderer.svelte:133](../../packages/host-svelte/src/ComponentRenderer.svelte#L133)).
Every one of those decisions is a `switch` on the framework, so the "shared
core" is three implementations wearing a trench coat, plus an abstraction that
must be extended before anyone can add a fourth host. The real repository's
answer — three files that each look completely natural to someone who knows that
framework — costs about two hundred lines apiece and lets a Vue developer read
`ComponentRenderer.vue` without learning Uniview's rendering abstraction first.

The second alternative is to **push the framework differences into the
protocol**: emit `className` for React hosts, `class` for the others, negotiated
at `initialize`. That breaks the property the whole system is built on — one
serialized tree, any host — and it puts host concerns into a package whose
`CLAUDE.md` rule is that it must stay agnostic. It also does not scale past the
web: AppKit has no `class` attribute in either spelling.

What is left, once you accept per-framework adapters, is the actual finding of
this step: **the differences are all spelling and calling convention, never
tree structure.** `main.ts` normalizes exactly three artefacts — HTML comment
anchors, Vue's `<span>` wrapper around text children, and React's self-closing
void tags — and the two outputs are then byte-identical. If a fourth
normalization were ever needed, that would be a real divergence and a bug in one
adapter.

## What changed since step 08

Step 08 wrote one web host, in Svelte, and established the recursive shape.
Step 09 keeps that shape and changes only the framework — twice, at once:

- **Two adapters instead of one, in the same file, over one controller.** The
  React host is distilled from
  `examples/host-react-demo/src/lib/plugin/{PluginContext.ts,PluginHost.tsx,ComponentRenderer.tsx}`
  and the Vue host from
  `examples/host-vue-demo/src/lib/plugin/{usePluginContext.ts,PluginHost.vue,ComponentRenderer.vue}`.
  Both actually render: `renderToStaticMarkup` from `react-dom/server` and
  `renderToString` from `vue/server-renderer`, both installed in `learn/`. The
  HTML in "Run it" came out of the frameworks.
- **The three jobs are named and then located.** Section 8 of the output prints
  which function does JOB 1 (recurse), JOB 2 (transform props) and JOB 3
  (resolve `type`) in each adapter, from the real function objects. That naming
  is the deliverable: it is what lets you write the fourth host.
- **The context mechanism is now the subject, not a detail.** Step 08's host got
  the controller from `getContext("uniview:controller")`. This step shows
  React's `createContext`/`useContext` and Vue's `provide`/`inject` with an
  `InjectionKey` symbol doing the same job, and counts the reads: React resolves
  context **13** times for a 14-node tree (once per node, because each recursion
  is a new component instance); Vue resolves it **once**, because its recursion
  is a plain function inside one `setup()`.
- **The registry is finally generic over something.** Step 07 introduced
  `ComponentRegistry<T>`; here `T` is `ComponentType` in one host and Vue's
  `Component` in the other, from the identical interface, holding two
  implementations of one `Badge`.
- **The event round trip is symmetric.** Step 07 fired one handler through one
  host. Here a click is fired through the React binding and another through the
  Vue binding into one controller, and both hosts then render `Clicked 2 times`
  — one plugin, one source of truth, two screens.
- **What step 07's `ScriptedController` did with `MutableTree`, this one does by
  rebuilding.** Deliberate: a host only ever receives `UINode | null` from
  `subscribe`, so how the controller produced it is stage D's business and
  including step 02's applier again would have been 180 lines of noise in a step
  about adapters.

## How Uniview really does it

The two context mechanisms, verbatim. React's is a context **object** created at
module scope, with a `Provider` component and a hook:

```typescript
export const PluginContext = createContext<PluginContextValue | null>(null);

export function usePluginContext() {
  const context = useContext(PluginContext);
  if (!context) {
    throw new Error("usePluginContext must be used within a PluginHost");
  }
  return context;
}
```

[examples/host-react-demo/src/lib/plugin/PluginContext.ts:10](../../examples/host-react-demo/src/lib/plugin/PluginContext.ts#L10)
(lines 10-18)

Vue's is a **Symbol** used as an injection key — nothing about it is a
component, which is why the Vue adapter can do its recursion with a plain
function:

```typescript
export const PluginContextKey: InjectionKey<PluginContextValue> =
  Symbol("uniview:plugin");

export function usePluginContext(): PluginContextValue {
  const context = inject(PluginContextKey);
  if (!context) {
    throw new Error("usePluginContext must be used within a PluginHost");
  }
  return context;
}
```

[examples/host-vue-demo/src/lib/plugin/usePluginContext.ts:9](../../examples/host-vue-demo/src/lib/plugin/usePluginContext.ts#L9)
(lines 9-18). Two files in two directories, written for two frameworks, that
throw the *same sentence* — `main.ts` triggers both and prints
`same sentence, two independently written files: true`. Svelte's third answer is
two separate string-keyed contexts rather than one object:
`getContext<PluginController>("uniview:controller")`
([packages/host-svelte/src/ComponentRenderer.svelte:16](../../packages/host-svelte/src/ComponentRenderer.svelte#L16)).

And JOB 1 in Vue, which is where the one visible output difference comes from —
`renderChildren` wraps every string child in a keyed `<span>`, because it is
assembling a `VNode[]` and gives every entry an identity:

```typescript
function renderNode(node: UINode | string): VNode | string {
  if (typeof node === "string") {
    return node;
  }

  if (node.type === TEXT_NODE_TYPE) {
    return node.text ?? "";
  }

  const { type, props: nodeProps, children } = node;
  const p = transformProps(nodeProps);

  const renderChildren = (): VNode[] =>
    children.map((child, index) => {
      const rendered = renderNode(child);
      return typeof rendered === "string"
        ? h("span", { key: index }, rendered)
        : rendered;
    });
```

[examples/host-vue-demo/src/lib/plugin/ComponentRenderer.vue:121](../../examples/host-vue-demo/src/lib/plugin/ComponentRenderer.vue#L121)
(lines 121-139). React's equivalent returns the bare string and recurses through
the component itself
([ComponentRenderer.tsx:37](../../examples/host-react-demo/src/lib/plugin/ComponentRenderer.tsx#L37)
and the `children.map(...)` calls that follow), which is why the React rendering
has no wrapper spans and the Vue one has four.

The deepest structural difference is how a **registered** component receives its
children: React appends them as trailing varargs to `createElement`
([ComponentRenderer.tsx:244](../../examples/host-react-demo/src/lib/plugin/ComponentRenderer.tsx#L244),
lines 244-255), Vue passes a slots record `{ default: () => [...] }`
([ComponentRenderer.vue:223](../../examples/host-vue-demo/src/lib/plugin/ComponentRenderer.vue#L223),
lines 223-237), and Svelte writes them between the component's tags
([ComponentRenderer.svelte:250](../../packages/host-svelte/src/ComponentRenderer.svelte#L250),
lines 250-261). Same three lines of intent, three unrelated mechanisms.

One faithful oddity worth knowing about, because `main.ts` reproduces it rather
than quietly fixing it: all three adapters compute a merged class for `<button>`
(a `cursor-pointer` prefix plus whatever the plugin authored) and then spread
`p.attrs` *after* it, so an authored class silently overwrites the merged value
([ComponentRenderer.tsx:141](../../examples/host-react-demo/src/lib/plugin/ComponentRenderer.tsx#L141),
[ComponentRenderer.vue:145](../../examples/host-vue-demo/src/lib/plugin/ComponentRenderer.vue#L145),
[ComponentRenderer.svelte:190](../../packages/host-svelte/src/ComponentRenderer.svelte#L190)).
A button whose plugin authored a `className` therefore loses `cursor-pointer`
entirely. The run shows it: the button renders as `class="primary"`, in both
hosts, identically. Three adapters, one bug, which is its own kind of evidence
that they were written from the same reading of the protocol.

## What this step leaves out

- **The subscription and the lifecycle.** Server rendering has no effects, so
  `main.ts` holds the tree in the driver. The real React host owns
  `useState`/`useEffect`, subscribes, calls `connect()`, and keeps a
  `controllerRef` so a late callback from a *replaced* controller cannot
  overwrite the tree
  ([PluginHost.tsx:23](../../examples/host-react-demo/src/lib/plugin/PluginHost.tsx#L23),
  lines 23-43). The Vue host does it in `watch(() => props.controller, ...,
  { immediate: true })` plus `onUnmounted`, and provides the context through
  *getters* so swapping the controller prop re-resolves for every descendant
  without re-providing
  ([PluginHost.vue:19](../../examples/host-vue-demo/src/lib/plugin/PluginHost.vue#L19)).
  The Svelte host additionally renders `subscribeErrors` output as an inline
  alert
  ([packages/host-svelte/src/PluginHost.svelte](../../packages/host-svelte/src/PluginHost.svelte)).
- **Seven of the eleven events, and the whole payload story.** `main.ts` wires
  `onClick`/`onInput`/`onChange`/`onKeyDown`; the real adapters wire all of
  `EVENT_PROPS` ([packages/protocol/src/events.ts:47](../../packages/protocol/src/events.ts#L47))
  and special-case `textarea`, `select`, `a` and `form` — including
  `event.preventDefault()` on submit. Svelte serializes keyboard events
  field-for-field through `serializeHandlerArgs`, after a bug where
  `() => handler()` meant plugins never learned which key was pressed
  ([packages/host-svelte/src/event-handlers.ts:15](../../packages/host-svelte/src/event-handlers.ts#L15),
  [ComponentRenderer.svelte:117](../../packages/host-svelte/src/ComponentRenderer.svelte#L117)).
- **What Svelte passes that the other two drop.** A handler-id prop outside the
  whitelist (`_onSearchTextChangeHandlerId`, present in this step's tree) is
  dropped by React and Vue and *relayed as an attribute* by Svelte, so a
  registered host component can call `executeHandler` itself
  ([ComponentRenderer.svelte:82](../../packages/host-svelte/src/ComponentRenderer.svelte#L82)).
  Svelte also passes `_childNodes` and `_nodeId` to registered components and
  skips `_style` on the web, neither of which the React or Vue adapter does
  ([ComponentRenderer.svelte:91](../../packages/host-svelte/src/ComponentRenderer.svelte#L91),
  [ComponentRenderer.svelte:236](../../packages/host-svelte/src/ComponentRenderer.svelte#L236)).
  This is a real inconsistency between the three hosts, not a simplification of
  mine.
- **Routing and URL-shared state.** The Svelte demo is a SvelteKit app whose
  framework / demo / runtime / update-mode selection is read from and written
  back to query params, so a session is a shareable link
  ([examples/host-svelte-demo/src/routes/+page.svelte:20](../../examples/host-svelte-demo/src/routes/+page.svelte#L20)).
  Nothing here has a URL.
- **Benchmark modes.** The demos can load `benchmark-full` / `benchmark-incremental`
  plugin builds rendering 1000 list items (max 2000) to compare whole-tree
  serialization against incremental mutations — step 05's argument, measured
  ([examples/host-svelte-demo/src/routes/+page.svelte:65](../../examples/host-svelte-demo/src/routes/+page.svelte#L65),
  [examples/plugin-example/src/benchmark-incremental.worker.ts](../../examples/plugin-example/src/benchmark-incremental.worker.ts)).
- **Styling, and the components a registry actually holds.** `Badge` here emits
  one `<em class="badge badge-info">`. The demos register `Button`, `Input`,
  `Switch`, `Toggle`
  ([examples/host-react-demo/src/App.tsx:40](../../examples/host-react-demo/src/App.tsx#L40)),
  each a wrapper that maps plugin-level variant names onto a shadcn-style
  component (`primary` -> `default`, and so on)
  ([examples/host-react-demo/src/lib/components/plugin/PluginButton.tsx](../../examples/host-react-demo/src/lib/components/plugin/PluginButton.tsx),
  [examples/host-vue-demo/src/lib/components/plugin/PluginButton.vue](../../examples/host-vue-demo/src/lib/components/plugin/PluginButton.vue)),
  over Tailwind v4 with oklch design tokens and a `@source` directive that scans
  the *plugin's* source for class names
  ([examples/host-react-demo/src/index.css:1](../../examples/host-react-demo/src/index.css#L1)).
- **Dev tooling.** Vite, the framework plugin, the `@` alias and a fixed port per
  demo, so three hosts can run at once against one bridge server
  ([examples/host-react-demo/vite.config.ts:1](../../examples/host-react-demo/vite.config.ts#L1)).
- **Choosing a runtime at all.** `main.ts` uses a scripted controller. The demos
  build a real one — `createWorkerController`, `createWebSocketController` or
  `createMainController` — from a radio button, and tear the old one down on
  every switch
  ([examples/host-react-demo/src/App.tsx:52](../../examples/host-react-demo/src/App.tsx#L52),
  lines 52-76). That is stage D, steps 12-14.
- **Hydration, reactivity and re-render cost.** Both hosts here render to a
  string, once, from scratch. In a browser React reconciles and Vue patches; a
  new tree from the controller updates only what changed, and neither adapter
  does any keying work beyond the array index — which is exactly the kind of
  thing the native host had to solve properly
  ([packages/UniviewAppKit/Sources/UniviewAppKit/Component.swift:22](../../packages/UniviewAppKit/Sources/UniviewAppKit/Component.swift#L22)).

## Trade-offs

- **Two hundred lines per framework, duplicated three times** buys an adapter a
  Vue developer can read without learning a Uniview abstraction, and a fourth
  host that needs no changes to any existing one. The cost is real: the
  `_onSearchTextChangeHandlerId` pass-through and the `_style`/`_childNodes`
  extras exist in Svelte and in neither of the others, so the three hosts have
  quietly drifted apart at the edges.
- **Context (React) / provide-inject (Vue) / setContext (Svelte) instead of
  prop-threading** keeps `controller` out of the signature of every node, which
  matters because the tree is arbitrarily deep and the transport is supposed to
  be invisible. The cost is a runtime error instead of a compile error when the
  renderer is used outside a host — both files throw the same hand-written
  sentence — and, in React, one context resolution per node: 13 for a 14-node
  tree, against Vue's 1.
- **Making the handler id into a closure at transform time** means each render
  allocates a fresh function per event prop, and any framework memoization
  keyed on prop identity sees a change every frame. What it buys is that a
  `<button>` deep in the tree can invoke a callback living in another process
  without knowing that a boundary exists.
- **Rendering an unknown `type` as a visible `Unknown: <type>` div** keeps a
  partially-supported plugin usable and makes the gap obvious on screen. The
  cost is that a systematically wrong registry yields a page of placeholders
  rather than one loud failure — and that both adapters must carry the branch.
- **Vue's keyed `<span>` around text children** gives every VNode a stable
  identity for patching. The cost is a wrapper element in the DOM that the
  React and Svelte hosts do not emit, so the same tree is *not* byte-identical
  across hosts — only structurally equivalent. Any test asserting on host HTML
  has to know which host produced it.

## Run it

```
pnpm tsx steps/09-vue-and-react-hosts/main.ts
```

Real output, **trimmed** from 158 lines. Elided: section 1 (the input tree),
the right-hand half of section 2 below, most of section 5's table, and
sections 6-7. Every line shown is verbatim; lines were removed between blocks,
never altered.

Section 2 — both hosts, actually rendered. The left column is
`react-dom/server`, the right is `vue/server-renderer`; this excerpt keeps the
first third of a side-by-side that runs 30 lines:

```
=== 2. Two real hosts, rendered ===

  REACT  (react-dom/server)                     VUE  (vue/server-renderer)
  -------------------------                     --------------------------
  <div class="card">                            <div class="card">
    <p class="muted">                             <p class="muted">
      Clicked 0 times                               <span>
    </p>                                              Clicked 0 times
    <button class="primary">                        </span>
      Click me                                    </p>
    </button>                                     <button class="primary">
    <input class="field" placeholder="note"/>       <span>
```

Section 3 — the comparison that is the point of the step:

```
  react bytes raw / normalized : 271 / 270
  vue   bytes raw / normalized : 322 / 270
  normalizations applied       : comments, Vue's <span> text wrapper,
                                 React's self-closing void tags

  IDENTICAL AFTER NORMALIZATION: true
```

Section 4 — the two context mechanisms, and what they cost:

```
                       React                      Vue
  -------------------  -------------------------  ------------------------------
  mechanism            createContext() object     InjectionKey (a Symbol)
  publish              <Context.Provider value>   provide(key, value) in setup()
  consume              useContext(Context)        inject(key)
  scope                per React element subtree  per component instance tree
  reads during render  13                         1

  renderer used outside a PluginHost:
    react -> usePluginContext must be used within a PluginHost
    vue   -> usePluginContext must be used within a PluginHost
    same sentence, two independently written files: true
```

Section 5 — five of the thirteen rows of per-framework difference:

```
  dimension           React                      Vue                         Svelte (step 08)
  ------------------  -------------------------  --------------------------  --------------------------------
  class attr          attrs.className = v        attrs.class = v             attrs.class = v
  click field         onClick                    onClick                     onclick
  component children  varargs to createElement   slots: {default: () => []}  slot between tags
  text child          returned as a bare string  wrapped in h("span",{key})  rendered by <Self>
  non-DOM handler id  dropped                    dropped                     passed through as attr
```

Section 6 — one handler, two hosts, one method:

```
  react button onClick -> {"handlerId":"h_click","args":[]}
  vue   button onClick -> {"handlerId":"h_click","args":[]}
  react input  onInput -> {"handlerId":"h_input","args":["from react"]}
  vue   input  onInput -> {"handlerId":"h_input","args":["from vue"]}

  the plugin's state after four events: clicks=2 note="from vue"
```

Section 8 — where the three jobs live, and what was actually shared:

```
  job                  React                          Vue
  -------------------  -----------------------------  ------------------------------
  1. recurse           ComponentRenderer (component)  renderNode (function in setup)
  2. transform props   reactTransformProps            vueTransformProps
     handler id -> fn  createHandler (in component)   createHandler (in setup)
  3. resolve type      isLayoutTag / registry.get     isLayoutTag / registry.get
     fallback          "Unknown: " + type             "Unknown: " + type

  adapter functions: react 6, vue 4
    shared implementations : 0
    shared with protocol   : 4  [isHandlerIdProp, extractEventName, textContent, isLayoutTag]
```

The lines worth staring at: `IDENTICAL AFTER NORMALIZATION: true` after only
three cosmetic normalizations; `reads during render 13 / 1`, which is the price
of React's recursion being a component and Vue's being a function; and
`shared implementations : 0` next to `shared with protocol : 4`, computed by
intersecting the two hosts' real function objects. Four functions and a data
format are the entire thing two independently written renderers had in common.

## Sources

- [examples/host-react-demo/src/lib/plugin/ComponentRenderer.tsx](../../examples/host-react-demo/src/lib/plugin/ComponentRenderer.tsx) —
  the React adapter: `transformProps`, `createHandler`, the tag branches, the
  registry branch and the `Unknown:` fallback
- [examples/host-react-demo/src/lib/plugin/PluginContext.ts](../../examples/host-react-demo/src/lib/plugin/PluginContext.ts) —
  `createContext` + `usePluginContext`
- [examples/host-react-demo/src/lib/plugin/PluginHost.tsx](../../examples/host-react-demo/src/lib/plugin/PluginHost.tsx) —
  subscribe/connect/disconnect, and the `controllerRef` staleness guard
- [examples/host-vue-demo/src/lib/plugin/ComponentRenderer.vue](../../examples/host-vue-demo/src/lib/plugin/ComponentRenderer.vue) —
  the Vue adapter: `renderNode`, the keyed `<span>` text wrapper, slots for
  registered components
- [examples/host-vue-demo/src/lib/plugin/usePluginContext.ts](../../examples/host-vue-demo/src/lib/plugin/usePluginContext.ts) —
  `InjectionKey` + `inject`
- [examples/host-vue-demo/src/lib/plugin/PluginHost.vue](../../examples/host-vue-demo/src/lib/plugin/PluginHost.vue) —
  `provide` with getters, and `watch(..., { immediate: true })`
- [packages/host-svelte/src/ComponentRenderer.svelte](../../packages/host-svelte/src/ComponentRenderer.svelte) —
  the third adapter: `use:attachEvents`, handler-prop pass-through, `_style`
  skipping, `_childNodes` / `_nodeId`
- [packages/host-svelte/src/PluginHost.svelte](../../packages/host-svelte/src/PluginHost.svelte) —
  `setContext` with two string keys, plus error rendering
- [packages/host-svelte/src/event-handlers.ts](../../packages/host-svelte/src/event-handlers.ts) —
  `serializeHandlerArgs`: what a DOM event becomes on the wire
- [packages/protocol/src/events.ts](../../packages/protocol/src/events.ts) —
  `EVENT_PROPS`, `isHandlerIdProp`, `extractEventName`, `KeyDownEvent`
- [packages/protocol/src/tree.ts](../../packages/protocol/src/tree.ts) —
  `UINode`, `LAYOUT_TAGS`, `TEXT_NODE_TYPE`, `textContent`
- [packages/host-sdk/src/types.ts](../../packages/host-sdk/src/types.ts) —
  `PluginController` and `ComponentRegistry<T>`, the two interfaces both
  adapters are written against
- [examples/host-react-demo/src/App.tsx](../../examples/host-react-demo/src/App.tsx) and
  [examples/host-svelte-demo/src/routes/+page.svelte](../../examples/host-svelte-demo/src/routes/+page.svelte) —
  the application layer: filling a registry, choosing a runtime, routing,
  benchmark modes
- [examples/host-react-demo/src/lib/components/plugin/PluginButton.tsx](../../examples/host-react-demo/src/lib/components/plugin/PluginButton.tsx) and
  [examples/host-vue-demo/src/lib/components/plugin/PluginButton.vue](../../examples/host-vue-demo/src/lib/components/plugin/PluginButton.vue) —
  what a registered component really is, in two frameworks
- [learn/docs/07-host-contract.md](./07-host-contract.md) — the contract these
  two adapters implement
- [CLAUDE.md](../../CLAUDE.md) — the prime directive, and the protocol's
  agnosticism rules
