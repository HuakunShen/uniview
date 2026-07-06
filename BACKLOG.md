# uniview Bug Backlog

> Source: full code review, 2026-07-07 (Claude Code session). Bugs marked **[REPRO]**
> were confirmed with failing tests (embedded at the bottom of this file).
> Context: kunkun (the critical consumer) uses **worker mode + incremental (mutation)
> update mode** — P0 items all hit that exact path.

## Status snapshot (as of 2026-07-07)

- `/Users/hk/Dev/uniview` checkout was 4 commits behind origin/main (`git pull` needed).
- The keyed-reorder detach fix (P0-1) exists **uncommitted** in the kunkun submodule
  working tree (`~/Dev/kunkun/vendors/uniview`): `react-renderer/src/reconciler/host-config.ts`,
  `host-sdk/src/mutable-tree.ts`, `host-svelte/src/ComponentRenderer.svelte`,
  plus `react-renderer/tests/keyed-reorder.test.tsx`. Needs commit + push upstream.
- Build gotcha discovered while debugging kill-process: `@kunkunsh/sdk` dist **inlines**
  react-renderer. Rebuild order: react-renderer → sdk → plugin bundle. host-sdk changes
  need a desktop dev-server restart.

---

## P0 — hits kunkun's production path (worker + incremental)

### 1. Keyed reorder: appendChild/insertBefore don't detach before insert — IN PROGRESS
React's commitPlacement reuses appendChild/insertBefore to MOVE existing keyed
instances. DOM insertBefore auto-detaches; an array-based host config must do it
explicitly, otherwise the node ends up in `children` twice → duplicate ids →
Svelte `each_key_duplicate` crash (first hit by kill-process fuse re-sorting).

- [x] Fix in react-renderer `host-config.ts` (uncommitted, kunkun submodule)
- [x] Fix in host-sdk `MutableTree` apply side (uncommitted, kunkun submodule)
- [ ] Commit + push both, bump kunkun submodule pointer
- [ ] **Port the same fix to solid-renderer** (`packages/solid-renderer/src/renderer/reconciler.ts:93-111`, `_insertNode`)
- [ ] **Port the same fix to tui-renderer** (`packages/tui-renderer/src/reconciler/host-config.ts:107-119`; also missing `child.parent = parent` there)
- [ ] Guard in `insertBefore`: after `detachFromParent(child)`, if `indexOf(beforeChild) === -1`
      the child is silently dropped (detached, never re-inserted). Unreachable per React's
      contract — which is exactly why it should throw/console.error instead of swallowing.

### 2. Text-node identity mismatch — one design flaw, three bugs **[REPRO]**
Full-tree serialization represents text children as **bare strings**
(`react-renderer/src/serialization/serialize.ts`), but mutations wrap them as
`{type:"text", id:"text-N", props:{}, children:[str]}` UINodes
(`react-renderer/src/mutation/mutation-collector.ts:110-118`). Consequences:

- (a) **insertBefore with a text-node anchor silently appends.** `beforeId` is `text-N`
  but host-side children are bare strings with no id → anchor never found →
  `MutableTree.applyInsertBefore` falls back to append → wrong order.
  Repro: `<div>{show && <span/>}tail</div>` toggling show → host gets `[TEXT, span]`,
  plugin truth is `[span, TEXT]`. No crash, just silently wrong — worse than P0-1.
- (b) **Dynamically appended text renders as "Unknown: text".** host-svelte
  `ComponentRenderer.svelte` has no `type:"text"` branch; kunkun's `uiNodeChildren()`
  filters strings only and drops `{type:"text"}` nodes as unknown components.
- (c) **setText childIndex corruption.** `applySetText` replaces the wrapper node with a
  bare string; the wrapper's id stays in `nodeIndex` forever (leak), and once host/plugin
  child arrays diverge (via (a)), childIndex-addressed setText mutates the wrong child —
  errors cascade.

**Fix direction:** unify text representation — make ALL text children `{type:"text"}`
nodes with stable ids (React Native's RawText approach), add a text branch to every host
renderer (host-svelte + kunkun renderers + react/vue demo hosts). Breaking →
**bump PROTOCOL_VERSION to 3**.

### 3. Handler lifecycle: React leaks, Solid fires the WRONG handler **[REPRO]**
- **React:** `serializeProps` registers a NEW handler id for every function on every
  serialize; `MutationCollector.cleanupHandlers()` is an empty shell (loop body is only
  comments). Registry never shrinks in either mode. Repro: 2 buttons × 10 re-renders →
  registry grows 2 → 22. Every keyed MOVE re-serializes the whole moved subtree →
  kill-process-style search (reorder per keystroke) grows the registry per keystroke.
- **Solid (worse):** `solid-runtime/src/runtime.ts:148` full mode calls
  `handlerRegistry.clear()` per update, and `clear()` resets `idCounter = 0` →
  **handler IDs are reused across renders**. A late-arriving `executeHandler("handler_3")`
  RPC (user clicked just before a re-render) executes a DIFFERENT function.
  Classic source of unreproducible "weird" bugs.

**Fix direction:** per-node handler tracking (`Map<nodeId, Set<handlerId>>`), release on
removeChild / setProps replacement; NEVER reset the id counter; keep one grace generation
for in-flight RPCs; unify React/Solid implementations.

---

## P1 — functional gaps & edge-case crashes

### 4. Root container supports exactly one child
`appendChildToContainer` overwrites `rootInstance`; `insertInContainerBefore` is **not
implemented**. A top-level Fragment `<><A/><B/></>` silently keeps only the last child;
reordering top-level children calls the missing method → TypeError. Same in solid/tui.
Minimum fix: throw a clear error on multiple root children.

### 5. Suspense unsupported → crash
`hideInstance` / `unhideInstance` / `hideTextInstance` missing from host config.
Any plugin using `React.lazy` / `<Suspense>` crashes on suspend. Either implement
(e.g. `hidden` flag on UINode) or detect + report a clear error.

### 6. destroy() never unmounts the React root
`react-runtime/src/runtime.ts` destroy() nulls references but never calls
`updateContainer(null)` → effects/timers live forever. Worker mode is saved by
`worker.terminate()`, but **WebSocket mode (long-lived Node plugin) leaks a whole live
React tree on every host reconnect** (each `initialize()` creates a fresh renderer,
old one keeps running), and **main mode leaks straight into the host page**.
Solid ws-client has the same reconnect subscription leak.

### 7. Error reporting is defined but never wired
`reportError` exists in the protocol; nothing on the plugin side ever calls it. No
`error`/`unhandledrejection` listeners in worker-entry/ws-client; React root error
callbacks are four bare `console.error`s (`react-renderer/src/reconciler/renderer.ts`).
A crashing plugin leaves the host showing stale "zombie" UI with zero indication.
`PluginHost.svelte` also never surfaces `getStatus().lastError`.

### 8. Keyboard events lose all key info on DOM elements (one-line fix)
host-svelte `ComponentRenderer.svelte` `wrapEventListener` returns `() => handler()` for
keydown/keyup — the event is dropped BEFORE `serializeHandlerArgs` (which has a perfectly
good `serializeKeyboardEvent`) ever sees it. Plugin `onKeyDown` receives `undefined`.
Registered-component path works fine → same API, two behaviors. Fix: pass the event through.

### 9. ws-client.ts is a drifted copy of runtime.ts
- Incremental mode sends **both** mutations AND a full tree on EVERY commit
  (`react-runtime/src/ws-client.ts:133`, comment says "initial render only" — it isn't).
  2× bandwidth, host applies mutations then gets clobbered by full init.
- Reconnect never unsubscribes old bridge callbacks → one dead closure set per reconnect.
- Solid's `updateProps` tears down and rebuilds the whole root (loses state);
  React's re-renders incrementally. Same protocol method, divergent semantics.
- Bridge server (`examples/bridge-server`): no ping/pong keepalive (half-open sockets
  linger for hours), hosts are insta-rejected while a plugin is down (no wait/queue).

**Fix direction:** reimplement ws-client on top of `createPluginRuntime` (single source of
truth); later, fold kunkun's `packages/sdk/src/runtime/plugin-entry.ts` (a third copy) in too.

### 10. Nested function props silently leak through raw
`serializeProps` only converts TOP-LEVEL `/^on[A-Z]/` function props to handler ids.
Functions nested in objects/arrays (Raycast-style `actions={[{onAction}]}`) stay raw in
props. kunkun avoids this by convention (actions as children), but nothing warns.
Minimum: dev-mode deep scan + `console.warn`.

---

## P2 — performance, robustness, hygiene

### 11. Benchmark stats run in the hot path
`runtime.ts` / `ws-client.ts` do `JSON.stringify(tree)` on EVERY commit just to count
bytes for `globalThis.__uniview_stats` → 2× serialization cost in production.
Gate behind an option/env flag, off by default.

### 12. MutableTree is O(tree) per mutation
`replaceNodeInTree` walks the whole tree per mutation; the new `findParentOf` (move
detach) is another full-tree scan per moved node → per-keystroke reorder of an N-row
list is O(n²). Cheap fix: maintain an `id → parentId` index (fill in `indexNode`),
making detach O(depth).

### 13. host-svelte `{#each node.children}` is unkeyed
Positional DOM reuse on reorder → input values/focus jump rows. Use
`{#each ... as child, i (typeof child === "string" ? i : child.id)}`.

### 14. Zod validators are dead code — and drifted
Nothing in any package calls `validateUINode`/`UINodeSchema`/etc., and
`ExecuteHandlerRequestSchema` (object shape) no longer matches the actual RPC signature
(two positional params). Either wire validation into RPC entry points in dev mode
(genuinely useful for protocol debugging) or delete.

### 15. Misc cleanups
- `appendInitialChild`'s `collectAppendChild` call: runs during render phase where
  `activeContainer` is always null — dead code (and a cross-container hazard if it ever fired).
- `serializeProps` silently drops `null`-valued props (JSONValue allows null).
- `protocol/src/mutations.ts` doc comments reference `textNodeId`/`text` fields that
  don't exist.
- Registered-component text-children hack (join all strings → force into `title`,
  render text before elements) reorders interleaved text/element children.
- host-config had duplicated identical if/else branches on `_isTextNode` (partly cleaned
  by the P0-1 fix; same pattern remains in `removeChild`/`appendInitialChild`).

### 16. Three copies of the runtime bootstrap
`react-runtime/src/runtime.ts`, `react-runtime/src/ws-client.ts`, and kunkun's
`packages/sdk/src/runtime/plugin-entry.ts` are the same logic, each drifted differently
(see #9). Consolidate on `createPluginRuntime`.

---

## Infra / testing

### 17. No CI
`.github/workflows/` only has deploy-docs. Add build + check-types + unit + e2e on PR.
For a load-bearing dependency this is the highest-leverage infra item.

### 18. Test coverage gaps (aligned with the bugs above)
E2E (Playwright/Cypress) covers 3 hosts × 3 runtimes happy paths + benchmark, but NOT:
keyed reorders (benchmark only appends/removes), dynamically appended text nodes,
onKeyDown key payloads, plugin crash surfacing, ws disconnect/reconnect, memory growth.
Unit gaps: MutationCollector, serializeProps, HandlerRegistry have zero tests.
Known demo-host drift: react demo host doesn't convert style objects (svelte/vue do);
vue demo host reuses `withInputValue` for `<select>`.

---

## Appendix: repro tests for P0-2 / P0-3

Drop into `packages/react-renderer/tests/` (imports host-sdk's MutableTree via relative
path — adjust or move the MutableTree cases into host-sdk's tests when porting).
All three tests FAIL on current code (2026-07-07); flip them into regression tests as
the fixes land.

```tsx
/**
 * Repro tests from the 2026-07-07 review: incremental-mode text-node bugs
 * and handler-registry growth.
 */
import { createElement, useState } from "react";
import { describe, expect, test } from "vitest";
import type { Mutation, UINode } from "@uniview/protocol";
import {
  HandlerRegistry,
  MutationCollector,
  createRenderer,
  render,
  serializeTree,
} from "../src";
import { MutableTree } from "../../host-sdk/src/mutable-tree";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

let toggleRef: (v: boolean) => void;
function ToggleApp() {
  const [show, setShow] = useState(false);
  toggleRef = setShow;
  return createElement(
    "div",
    null,
    show ? createElement("span", null, "S") : null,
    "tail-text",
  );
}

describe("review repro", () => {
  test("insertBefore before a text sibling keeps order on host (incremental)", async () => {
    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    const collector = new MutationCollector(registry);
    renderer.mutationCollector = collector;

    const batches: Mutation[][] = [];
    renderer.subscribeMutations((m) => batches.push(m));
    const host = new MutableTree();

    render(createElement(ToggleApp), renderer);
    await flush();
    for (const batch of batches.splice(0)) {
      for (const m of batch) {
        if (m.type === "setRoot") host.init(m.node);
      }
    }

    // toggle on -> span must be INSERTED BEFORE the text child
    toggleRef(true);
    await flush();
    for (const batch of batches.splice(0)) {
      host.applyMutations(batch);
    }
    const after = host.getTree()!;

    const pluginTruth = serializeTree(
      renderer.rootInstance,
      new HandlerRegistry(),
    ) as UINode;
    const pluginOrder = pluginTruth.children.map((c) =>
      typeof c === "string" ? "TEXT" : c.type,
    );
    const hostOrder = after.children.map((c) =>
      typeof c === "string" ? "TEXT" : c.type,
    );
    // FAILS today: host gets [TEXT, span], plugin truth is [span, TEXT]
    expect(hostOrder).toEqual(pluginOrder);
  });

  test("host tree after incremental text append matches full-mode representation", async () => {
    let addRef: () => void = () => {};
    function TextAppendApp() {
      const [n, setN] = useState(1);
      addRef = () => setN((x) => x + 1);
      const kids: (string | ReturnType<typeof createElement>)[] = [];
      for (let i = 0; i < n; i++) {
        kids.push(createElement("span", { key: `s${i}` }, `item${i}`));
      }
      if (n >= 2) kids.push(`count:${n}`);
      return createElement("div", null, ...kids);
    }

    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    const collector = new MutationCollector(registry);
    renderer.mutationCollector = collector;
    const batches: Mutation[][] = [];
    renderer.subscribeMutations((m) => batches.push(m));
    const host = new MutableTree();

    render(createElement(TextAppendApp), renderer);
    await flush();
    for (const batch of batches.splice(0)) {
      for (const m of batch) {
        if (m.type === "setRoot") host.init(m.node);
      }
    }

    addRef();
    await flush();
    for (const batch of batches.splice(0)) {
      host.applyMutations(batch);
    }

    const hostTree = host.getTree()!;
    const kinds = hostTree.children.map((c) =>
      typeof c === "string" ? "string" : `node:${c.type}`,
    );
    const fullTree = serializeTree(
      renderer.rootInstance,
      new HandlerRegistry(),
    ) as UINode;
    const fullKinds = fullTree.children.map((c) =>
      typeof c === "string" ? "string" : `node:${c.type}`,
    );
    // FAILS today: host has node:text where full mode has a bare string
    expect(kinds).toEqual(fullKinds);
  });

  test("handler registry does not grow unboundedly across re-renders", async () => {
    let bumpRef: () => void = () => {};
    function HandlerApp() {
      const [n, setN] = useState(0);
      bumpRef = () => setN((x) => x + 1);
      return createElement(
        "div",
        { "data-n": n },
        createElement("button", { onClick: () => n }, "b1"),
        createElement("button", { onClick: () => n }, "b2"),
      );
    }

    const renderer = createRenderer();
    const registry = new HandlerRegistry();
    renderer.subscribe(() => {
      serializeTree(renderer.rootInstance, registry);
    });
    render(createElement(HandlerApp), renderer);
    await flush();
    const sizeAfterMount = registry.size;

    for (let i = 0; i < 10; i++) {
      bumpRef();
      await flush();
    }
    // FAILS today: grows 2 -> 22 (one grace generation of slack allowed)
    expect(registry.size).toBeLessThanOrEqual(sizeAfterMount * 2);
  });
});
```
