# Decisions taken while building this curriculum

Judgment calls made while building it, the things rebuilding this system in
miniature turned up in the real code, and what was done about each.

## Structural decisions

### `learn/` is a workspace member — after a detour

It was built standalone. The first attempt to make it a workspace member failed
because `vendors/kkrpc` and `vendors/svelte-react-render` are git submodules that
were not initialized in this checkout, so `kkrpc@workspace:*` could not resolve
and **no** workspace install succeeded — with or without `learn`. Rather than
block the whole curriculum on that, it was written against its own private
install.

Once the curriculum was finished and CI was wanted, the submodules were
initialized (`git submodule update --init`) and `learn` joined the workspace, so
that root `pnpm test` — what CI runs — covers it with no workflow change.

**What that cost, concretely:** dependencies stopped resolving from a private
lockfile and started resolving through the root catalog, which immediately
produced a version conflict react-dom rejects at import time (`react` 19.2.4 from
the catalog, `react-dom` floating to 19.2.8). Fixed by cataloguing `react-dom`
next to `react` and pinning it in `pnpm.overrides` — the mechanism this repo
already uses for `@types/react`.

Running under a different `node_modules` layout also broke step 13 in two ways a
standalone install had hidden; see the last section.

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

Rebuilding a system in miniature surfaces things reading it does not. These were
all found that way. **Most have since been fixed, with regression tests** — each
entry says which.

### One "finding" that was wrong, and the check that caught it

Worth recording first, because it is the most useful thing in this file.

A step reported that `serializeProps` matching `/^on[A-Z]/` instead of
`EVENT_PROPS` was a bug shipping dead handler ids. It is not. `EVENT_PROPS` is
the DOM-event subset hosts *auto-wire*, not the closed set of handler props:
AppKit resolves handler ids generically
(`ShadowNode.swift:65` — `handlerId(for: "onSelect")`) and wires every
`NSMenuItem` that way, the Svelte host has an explicit branch relaying
non-whitelisted ids, and the plugin API is built on `onAction`, `onSelect`,
`onSearchTextChange` and `onSelectionChange`. Narrowing the rule would have
broken every macOS menu item.

The attempted fix passed the whole test suite — because **no test covered
app-level handler props at all**. That coverage gap, not the regex, was the real
defect; it is closed now, and both renderers document why the rule is
deliberately wider than the whitelist.

The residual case is real but unfixable at this layer: a typo like `onMouseMove`
does ship an unbound id, and telling it apart from a legitimate app-level handler
needs a host-declared component contract, not a protocol whitelist.

### What was fixed, in one place

| Fix | Where | Tests |
|---|---|---|
| Worker controller never noticed a dead plugin thread | `host-sdk/src/controllers/worker.ts` | 7 |
| WebSocket controller never noticed a closed socket | `host-sdk/src/controllers/websocket.ts` | 8 |
| `MutableTree` lost subtrees silently | `host-sdk/src/mutable-tree.ts` | +6 |
| `button`'s composed class destroyed by its own spread | Svelte, React and Vue adapters | 4 |
| Web hosts never bound `onWheel` (the terminal host did) | Svelte, React and Vue adapters | +2 |
| Registry components never received hover | Svelte, React and Vue adapters | covered above |
| Global error capture was a no-op outside a browser | both runtimes | 8 |
| `resetRuntimeState()` leaked the host environment between plugins | both runtimes | 6 |
| Five wrong file paths and a nonexistent API in `AGENTS.md` | `AGENTS.md` | n/a |

Every fix was checked the same way: write the test, confirm it **fails** against
the unfixed source, then fix. The two "settles instead of hanging" worker tests
fail by timing out at 5 s without the fix — which is the bug, reproduced.

Verified across the whole workspace afterwards: `pnpm build` 28/28,
`turbo run check-types --force` 62/62, `turbo run test --force` 56/56.
(`kkrpc#test` fails for want of a local Redis; the repo's own `test` script
excludes it, and it is a vendored submodule.)

Two things were deliberately NOT fixed, both larger than a bug fix and recorded
where they were found: the React coupling in `host-sdk`, and the absence of any
`setEnvironment` on the TypeScript controllers.

### `MutableTree` asymmetric error reporting — FIXED

`setText` against an unknown id and a missed `insertBefore` anchor both
`console.error`. But `appendChild` / `insertBefore` / `setProps` / `removeChild`
against an unknown **parent** returned silently — and the silent path is the one
that can lose an entire subtree, so the loud/quiet split was backwards.

All four now report in the same `[uniview] … (tree state diverged)` style, with
the appendChild/insertBefore messages noting the node was already detached.
Behaviour is otherwise unchanged. Six tests added, including the
move-to-unknown-parent subtree-loss case. Step 02 still prints the behaviour.

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

### Three real gaps in the web host adapters, found by writing steps 08/09 — FIXED

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

### Both remote controllers reported `connected: true` after their plugin died — FIXED

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

### `CLAUDE.md`'s structure map omitted the file step 02 is about — FIXED

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

## Questions that were open, and how they were answered

All four have been decided and acted on.

1. **Does `learn/` live in the repo?** Yes. It is committed here.

2. **Does it join CI?** Yes. `learn` is now a pnpm workspace member with a
   `test` script (`run-all-steps.mjs`) that runs all sixteen steps end to end, so
   the root `pnpm test` — which is what CI runs — covers it. No workflow change
   was needed.

   Becoming a workspace member had one consequence worth knowing: dependencies
   now resolve through the root catalog rather than a private lockfile, and that
   immediately exposed a version conflict — `react` pinned at 19.2.4 by the
   catalog while `react-dom` floated to 19.2.8, which react-dom rejects at import
   time. Fixed by cataloguing `react-dom` alongside `react` and pinning it in
   `pnpm.overrides`, the mechanism this repo already uses for `@types/react`.

3. **The stale `CLAUDE.md` claims?** Fixed — in `AGENTS.md`, which `CLAUDE.md` is
   a symlink to. Five corrections in all, more than the two originally found:
   `UINode` (`protocol/src/types.ts` → `tree.ts`), the Zod schemas
   (`protocol/src/ui-node.ts` → `validators.ts`), `serializeTree`
   (`react-renderer/src/serializer/index.ts` → `src/serialization/serialize.ts`),
   a `reconcile` export that does not exist (the real one is `render`), and the
   Handler Registry example, which used a `register`/`invoke` API that was never
   real — the actual API is `syncNode`/`execute`. The `host-sdk` structure block
   gained the two files it was missing, and the bridge server is described as
   Bun.serve rather than Elysia.

4. **A project-local maintenance skill?** Added, at
   [`skills/learn-curriculum/SKILL.md`](../skills/learn-curriculum/SKILL.md).

## What running the curriculum under CI changed in the steps themselves

Making `learn` a workspace member surfaced two real portability bugs in step 13
that a standalone install had hidden, both from the same cause: **a
`node:worker_threads` worker does not inherit its parent's module loader.**

- A TypeScript parameter property (`constructor(private readonly x: T) {}`) is
  rejected by Node's own strip-only TypeScript mode. Rewritten longhand.
- Bare and extensionless specifiers do not resolve under Node's ESM loader.
  `react-reconciler/constants` → `constants.js`, and `./protocol` → `./protocol.ts`
  (with `allowImportingTsExtensions` in the tsconfig).

Both are now commented in place, because they are exactly the kind of asymmetry
step 13 exists to teach: code that works on the host thread and fails on the
worker.
