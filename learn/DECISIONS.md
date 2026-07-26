# Decisions taken while building this curriculum

Judgment calls made without stopping to ask, and the open questions they leave.
Read the "Open questions" section at the bottom first — those are the ones that
may want your answer.

## Structural decisions

### `learn/` is standalone, not a pnpm workspace member

**Why.** The first attempt added `learn` to `pnpm-workspace.yaml` and the install
failed: `vendors/kkrpc` and `vendors/svelte-react-render` are git submodules that
are not initialized in this checkout, so `kkrpc@workspace:*` cannot resolve and
**no** workspace install succeeds — with or without `learn`.

Rather than initialize submodules (a change to your repo state that the
curriculum does not need), `learn/` installs on its own:

```bash
cd learn && pnpm install --ignore-workspace
```

**What this buys.** A reader can clone, enter `learn/`, install, and run every
step without building Uniview at all. That is a genuinely better property for a
teaching artifact.

**What it costs.** A second `node_modules` (already covered by the root
`.gitignore`), no turbo caching, and dependency versions that must be kept in
sync with the real packages by hand rather than by the catalog. Versions were
pinned to match the root catalog at the time of writing: react `^19.2.4`,
react-reconciler `^0.33.0`, solid-js `1.9.10`, kkrpc `^2.0.0`.

`pnpm-workspace.yaml` was edited and then reverted; it is unchanged from HEAD.

### Steps do not import `@uniview/*`

This is reconstruction, not reference. Each step rebuilds a miniature of the
thing it teaches. The real packages are quoted and linked, never called. A step
that imported `@uniview/protocol` would skip the exact understanding the step
exists to produce.

### Steps do not import each other

Each `steps/NN-slug/` directory stands alone and runs alone, copying forward what
it needs from the previous step.

**Cost:** real duplication across directories.
**Benefit:** any two adjacent steps can be diffed to see precisely what changed,
each step runs in isolation, and steps could be written in parallel. For a
curriculum whose whole point is watching a design assemble itself, the diffability
is worth more than the DRY-ness.

### `steps/00-scaffold-probe/` is kept, not deleted

It is not a lesson. It proves `tsx`, `react-reconciler@0.33` and
`solid-js@1.9.10` actually work before any lesson depends on them, and it
documents a trap that costs an hour to rediscover (below). Keeping it makes it a
smoke test.

## Technical findings that shaped the content

### `react-reconciler@0.33` fails at runtime, not at type-check time

A host config missing `resolveEventTimeStamp`, `resolveEventType` or
`trackSchedulerEvent` type-checks fine and then dies with
`TypeError: resolveEventTimeStamp is not a function` on the first
`updateContainer`. Found by running the probe, not by reading. The real host
config sets them at
[packages/react-renderer/src/reconciler/host-config.ts:296-304](../packages/react-renderer/src/reconciler/host-config.ts#L296).

### No Swift toolchain on this machine

Step 10 ("a host in a language with no JS runtime") therefore cannot be verified
by compiling the real AppKit host. It implements the same mutation-applying
algorithm in TypeScript, deliberately written without leaning on JS-only
conveniences, and quotes the real Swift
([examples/host-appkit-demo/HostAppKitDemo/ViewModels/MutableUINodeTree.swift](../examples/host-appkit-demo/HostAppKitDemo/ViewModels/MutableUINodeTree.swift)).
The step's "What this step leaves out" section says so explicitly.

### Step 04 was re-scoped mid-build

Originally "building the tree" (`createInstance` / `appendChild` / `commitUpdate`).
Step 03's example turned out to cover tree growth thoroughly already — it logs
every host-config callback as the reconciler fires it — so a step 04 on the same
material would have been filler.

Re-scoped to **serialization**: live host instances → a JSON-safe `UINode`, and
how a function prop becomes a `HandlerId`. That gap is real, distinct, and is
what makes Stage D (Worker, WebSocket) and step 10 (a host with no JS runtime)
possible at all. Step 03 even surfaced the motivating bug: `JSON.stringify` on
raw React props throws on a circular structure.

Slug changed from `04-building-the-tree` to `04-serializing-the-tree`; the
README row was updated to match.

### `vue` and `react-dom` were added so step 09 renders for real

Step 09 claims one tree renders through two independently written host adapters.
Asserting that is weak; showing it is not. `vue@^3.5` and `react-dom@^19.2` were
added to `learn/package.json` and verified under `tsx` before the step was
briefed — both `renderToStaticMarkup` and Vue's `renderToString` produce real
markup from `h()`/`createElement()` calls with no compiler configured.

**Svelte was deliberately NOT added.** `.svelte` files need a compiler step, and
wiring one in would make one step run differently from the other fifteen. Step 08
therefore implements the algorithm `ComponentRenderer.svelte` embodies, in plain
TypeScript, and quotes the real Svelte source — and says so rather than implying
Svelte ran.

Step slugs shifted accordingly: `08-svelte-host` → `08-recursive-host`,
`09-vue-and-react-hosts` → `09-react-and-vue-hosts`.

### The curriculum grew from 12 steps to 16

The first proposal under-weighted two things you called out: how one tree renders
into many different hosts, and how one plugin runs in many different runtimes.
Stages C (05 steps) and D (04 steps) are the result.

## Things found in the production code while writing this

Reported, not fixed — all of them are outside `learn/`.

### `MutableTree` asymmetric error reporting (`packages/host-sdk/src/mutable-tree.ts`)

`setText` against an unknown id and a missed `insertBefore` anchor both
`console.error`. But `appendChild` / `insertBefore` / `setProps` / `removeChild`
against an unknown **parent** return silently. The silent path is the one that
can lose an entire subtree, so the loud/quiet split is arguably backwards.
Step 02 prints this behaviour.

### Style resolution is two-staged, and the obvious mental model is wrong

`resolve.ts`'s own header states it "Runs plugin-side: a native host receives the
finished `ResolvedStyle` and never parses a class name." So: class string →
`ResolvedStyle` happens in the **plugin**; semantic name → system color, and
variant selection, happen in the **host**. A single host-side resolve would mean
every native host shipping a Tailwind parser — precisely what `@uniview/style`
exists to prevent. Only tokens in `theme.nativeTokens` survive as names; palette
colors like `bg-zinc-800` are deliberately frozen to hex plugin-side.

### `host-sdk` is coupled to React, which its own docs forbid

`packages/host-sdk/src/controllers/main.ts:1` imports `react` and
`@uniview/react-renderer` directly and takes a React `ComponentType`. There is no
Solid main-thread controller, so a Solid plugin can only reach a host through the
Worker or WebSocket runtimes. `CLAUDE.md:184` lists "NEVER couple host-sdk to
specific framework" as an anti-pattern. Step 06 documents this as known debt
rather than design, and step 12 picks it up.

### Solid resolves to its SSR build under Node, silently

A bare `import "solid-js"` under Node/tsx takes the package's `"node"` export
condition to `dist/server.js` — the SSR build, where signals are plain values and
`createRenderEffect` runs once. The first working draft of step 06 built a
perfect tree and then printed an **empty** update trace, with no error at all.

Step 06 therefore vendors `universal.js` beside its `main.ts` with its one import
repointed at `solid-js/dist/solid.js`, so the step runs with no extra flags. The
real `@uniview/solid-renderer` vendors the same file for an unrelated reason (it
adds an 11th primitive, `createSlotNode`, as a `<Show>`/`<For>` anchor).

**Decision:** accepted the vendoring. The alternative — a special run command for
one step, or a Node flag in the docs — would break the curriculum's "every step
runs the same way" property, which matters more here than avoiding three vendored
files.

### Incremental mode barely helps without `memo`

Measured in step 05, not assumed. React 19 marks a host fiber for update whenever
its props *object* changes identity, so a list whose rows are not memoised emits
a `setProps` per re-rendered node. For a one-character edit in a 400-row list:

| | mutations | incremental | full tree | saving |
|---|---|---|---|---|
| memoised rows | 6 | 460 B | 172 KB | **374x** |
| no memo | 1203 | 101 KB | 174 KB | 1.7x |

So "send only what changed" is a property of the plugin's authoring discipline as
much as of the protocol. Worth knowing before trusting the headline number.

Two related measurements from the same step: mount is slightly *worse* under
incremental mode (2768 B vs 2709 B, because React emits `setRoot null` first), and
unmount emits only `setRoot null` with no per-node `removeChild`, so handlers
survive it — which is why `HandlerRegistry.clear()` exists.

### Three real gaps in `packages/host-svelte`, found by writing step 08

Each was reproduced faithfully in the teaching version rather than silently
"fixed", and each is worth an issue against the real package.

1. **`onWheel` is dead.** `EVENT_PROPS` in `packages/protocol/src/events.ts`
   whitelists eleven event names; `transformProps` in `ComponentRenderer.svelte`
   handles ten. A plugin setting `onWheel` gets `_onWheelHandlerId` left on the
   node as a plain DOM attribute — no error, no handler, silently non-functional.

2. **Registered components never receive hover.** `ComponentRenderer.svelte:233-249`
   passes `onclick` … `onkeyup` down to registry components but omits
   `onmouseenter`/`onmouseleave`, so a product primitive cannot get them even
   though the host bound them.

3. **`button`'s class composition is overridden by its own spread — in all three
   adapters.** `ComponentRenderer.svelte:190`, `ComponentRenderer.tsx:141` and
   `ComponentRenderer.vue:145` each build `cursor-pointer ${authored class}` and
   *then* spread `p.attrs` after it, so a plugin that sets `className` wins and
   `cursor-pointer` is silently lost. Three independently written adapters, the
   same bug — which suggests it was copied forward rather than reasoned about.
   The teaching versions put the composed class last, which is evidently the
   intent, and flag the divergence in a comment.

4. **The three adapters disagree on unknown handler-id props.** A prop like
   `_onSearchTextChangeHandlerId` (a handler id whose event is not in
   `EVENT_PROPS`) is **dropped** by the React and Vue adapters but **relayed as a
   plain attribute** by Svelte (`ComponentRenderer.svelte:82`, with a deliberate
   comment). Svelte also forwards `_childNodes`/`_nodeId` and skips `_style`; the
   other two do neither. One tree therefore reaches three hosts with three
   different prop sets.

Also noted: `VOID_ELEMENTS` includes `wbr`, which is not in `LAYOUT_TAGS`, and the
void branch is tested before the layout branch — so `hr`/`br`/`img` never receive
event listeners despite being layout tags. Order-dependent, and probably intended,
but undocumented.

### The two Swift tree appliers disagree, and the demo's has the move bug

`packages/UniviewAppKit/Sources/UniviewNativeCore/ShadowTree.swift` is move-safe
(`detachIfPresent`) and revision-guarded.
`examples/host-appkit-demo/HostAppKitDemo/ViewModels/MutableUINodeTree.swift:77`
is neither — its `applyAppendChild` does not detach first, which is exactly the
corruption step 02 demonstrates with its deliberately-naive applier, and
`MutableUINodeTreeTests.swift` never exercises a move, so nothing catches it.

Also: `ComponentRegistry.standard()` does not register `#text`, and `Mounter`
skips text nodes (`for child in node.children where !child.isTextNode`), so text
directly under a bare `View` renders as nothing in the real AppKit host.

### The terminal host's two layout engines disagree

`customLayoutEngine` (pure TS) is the **default**, explicitly because it has "no
dependencies; runs in Worker/Deno/Bun". `yogaLayoutEngine` is opt-in behind a
`LayoutEngine` seam. They are not equivalent: `layout.ts` notes that Yoga "honors
explicit cross-axis sizes this engine stretches". Step 11 copies the default
engine's looser behaviour faithfully so the divergence is visible in code rather
than only described.

`packages/host-tui` also has **no `ComponentRegistry` at all** — it dispatches on
a `TEXT_TYPES` set and otherwise treats any node as a box, which closes a question
step 07 leaves open about whether the registry is part of the contract or a web
convenience. It is the latter.

### The main-thread controller is missing two things the others have

Found while writing step 12, both confirmed against source:

- **No `initialize` / `PROTOCOL_VERSION` handshake.** The worker and websocket
  controllers negotiate; the main-thread one does not.
- **No `setEnvironment`.** A main-thread host that wants dark mode has to import
  `setHostEnvironment` from `@uniview/react-runtime` and call it out of band,
  rather than going through the controller like every other runtime.

Neither is a bug on its own — there is no boundary to negotiate across — but they
mean `PluginController` is implemented three times with three different amounts
of ceremony, which step 15 has to reckon with.

Additional evidence for the React-coupling item above:
`packages/host-sdk/package.json` describes itself as "Framework-agnostic host SDK"
while listing `@uniview/react-renderer` under `dependencies` — not a peer
dependency, not optional.

### Both remote controllers report `connected: true` after their plugin dies

- **Worker** (`packages/host-sdk/src/controllers/worker.ts`): never listens for
  the worker's `error` or `exit`. If the plugin thread dies outside a `try`, the
  host keeps its stale tree, `getStatus()` still says `connected: true`, and
  later `executeHandler` calls await a channel nobody will answer.
- **WebSocket** (`packages/host-sdk/src/controllers/websocket.ts:83`): sets
  `connected` true and only ever clears it in an explicit `disconnect()`. There
  is no `close` handler at all.

Steps 13 and 14 both add the missing handler to their teaching versions and flag
it as an addition rather than a distillation.

Related: `packages/react-runtime/src/ws-client.ts:79-80` calls `runtime.stop()`
on close and builds a fresh runtime on reconnect, but the host never re-sends
`initialize` — so after a reconnect the plugin has no tree and `syncTree()`
returns silently at `runtime.ts:202-203`. Step 14 keeps its plugin's tree mounted
(a flagged deviation) so the recovery path can be demonstrated at all.

Also: `runtime.ts:224-225`'s global error capture calls
`globalThis.addEventListener?.(...)`, which is a **no-op under Node** — the
optional chain swallows it, so a plugin running in Node/Deno/Bun has no global
error capture.

### The WebSocket bridge has no authentication

My brief for step 14 asserted the real bridge does auth. It does not.
`examples/bridge-server/src/bridge.ts`'s `fetch()` upgrades any `/plugins/:id` or
`/host/:id` request — no token, no origin check, no id allow-list. Its `AGENTS.md`
states the intent ("NEVER add business logic here"), so this is a deliberate
scope decision for a dev bridge rather than an oversight. The step says so
plainly rather than implying it simplified something away. Worth confirming it
never ships as-is to anything reachable off-localhost.

### Crossing a thread boundary is mostly wake-up, not copying

Step 13 measured the same payload three ways: `structuredClone` in-process
22.33 µs, a real `worker_threads` round trip 51.27 µs. So ~2.3x of a crossing is
thread wake and dispatch, and optimizing serialization alone would move less than
half of it. Step 12's earlier in-process estimate (23.72 µs) was measuring only
the copy — the step says so, rather than quietly restating the number.

The real loopback socket in step 14 cost 257 µs per round trip against 11 µs for
the JSON encode/decode alone. Same lesson, one order of magnitude further out.

### Two wasted things visible only once there is a boundary

Both found by step 14, both free on the main thread:
- **Mount sends two `setRoot`s** — `clearContainer` emits `{"setRoot": null}`
  before `appendChildToContainer` emits the real tree.
- **A click re-sends unchanged props** — `setProps×5 + setText×1`, because the
  demo plugin passes inline object literals and `commitUpdate` fires on identity.
  ~400 wasted bytes per interaction. This is the same `memo` effect measured in
  step 05, seen from the wire side.

### `CLAUDE.md`'s structure map omits the file step 02 is entirely about

The `packages/host-sdk` STRUCTURE block lists only `types.ts`, `registry.ts` and
`controllers/` — omitting `mutable-tree.ts` and `validate.ts`.

## Process decisions

- **Docs and code comments are English**, per your choice.
- **Waves, not a free-for-all fan-out.** Reconstruction steps depend on each
  other, so agents were dispatched in dependency-respecting waves with
  parallelism only inside a wave.
- **Every step was re-run by the orchestrator**, not trusted from an agent's
  report. This caught one real discrepancy: step 10's author reported
  `tsc --noEmit` exit 0, and it was not — an unused `objectValue` accessor failed
  `noUnusedLocals`. Two *other* agents had independently reported the error while
  its own author did not see it. Fixed by putting the accessor to work (it is one
  of a set of four the step teaches, so deleting it would have cost the point),
  and the doc's pasted output was re-captured to match.

### Final verification, run by the orchestrator

- All 17 entry points (16 steps + the scaffold probe) run to completion: **17/17
  exit 0**, no hangs, no orphan processes left behind by the worker and
  cross-process steps.
- `tsc --noEmit` over the whole curriculum: **clean**.
- All 16 docs carry every section `RULES.md` requires: **no omissions**.
- All **135** unique `../../` links into the real repository resolve on disk:
  **no broken links**.
- The "What changed since step N" chain is continuous. Step 07 deliberately
  continues from step 02 rather than 06, because 03–06 are the plugin side and 07
  opens the host side; its section explains the jump.

## Open questions for you

1. **Should `learn/` be committed to the uniview repo at all**, or live outside
   it? It is currently untracked. Committing it means the curriculum ships with
   the project; it also means a second `node_modules` and a directory turbo does
   not manage.

2. **Should `learn/` join CI?** It is not in `turbo.json`'s task graph, so
   nothing runs these steps automatically. A `test` script that runs all sixteen
   would catch curriculum rot when the real packages change — at the cost of one
   more thing to keep green.

3. **Two stale claims in the root `CLAUDE.md`**, found while writing step 01:
   - The CODE MAP says `UINode` lives at `protocol/src/types.ts`. That file does
     not exist; it is `protocol/src/tree.ts`.
   - "Protocol-First Architecture" says the Zod schemas are in
     `protocol/src/ui-node.ts`. Also nonexistent; they are in
     `protocol/src/validators.ts`.

   Both would send a reader — or an agent — to a nonexistent file. Left alone
   because they are outside this curriculum's scope.

4. **Should the maintenance skill be project-local?** The generic
   `building-codebase-curriculum` skill lives in `~/dev/skills`. Uniview may also
   want a small project-specific skill saying when a change deserves a new step
   versus an edit, the way CrossCopy's `learn-rust-curriculum` skill does.
