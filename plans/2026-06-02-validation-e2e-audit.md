# Uniview Validation E2E Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reliable validation foundation, add Playwright E2E coverage that records the current good/bad baseline, then perform a package-by-package audit using evidence from those tests.

**Architecture:** Work in three ordered phases. First, make local validation commands deterministic and fix only the current blockers that prevent typecheck/unit tests from running. Second, add a Playwright harness that can launch the bridge, plugin clients, and host demos, then produce a baseline report without hiding failures. Third, audit packages against the validated baseline and classify code as keep, fix, remove, or investigate.

**Tech Stack:** pnpm 10, Turbo, TypeScript 5, Vitest, Bun, Elysia, kkrpc, React 19 custom reconciler, Solid renderer/runtime, Svelte 5 host adapter, Vite host examples, Playwright.

---

## Execution Rules

- Work in a clean branch or worktree. Do not mix this with unrelated edits.
- Do not remove user work. If files changed outside this plan, stop and inspect before editing those files.
- Use test-first changes for behavior fixes. A command failure can be the failing test when the bug is compile-time or script orchestration.
- Keep phase 1 minimal. Do not do broad cleanup until the audit phase.
- Record failures instead of guessing. The E2E baseline is allowed to contain failing scenarios.
- Commit only if the supervising user or execution environment allows commits. If commits are not allowed, run `git status --short` after each task and leave changes unstaged.

## Current Evidence To Preserve

These failures were observed before writing this plan and should be captured in the pre-fix report:

```bash
pnpm --filter @uniview/react-runtime check-types
```

Expected current result before fixes:

```text
src/runtime.ts: duplicate updateProps/executeHandler/syncTree methods
src/runtime.ts: Cannot find name 'props'
src/runtime.ts: HandlerRegistry | null passed to serializeTree
src/ws-client.ts: HostToPluginAPI implementation missing updateItem and syncTree
```

```bash
pnpm --filter @uniview/protocol exec vitest run
pnpm --filter @uniview/host-sdk exec vitest run
```

Expected current result before fixes:

```text
tests/index.test.ts imports fn from ../src, but fn is not exported
```

```bash
pnpm --filter @uniview/react-renderer test -- --run
```

Expected current result before fixes:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@vitest/browser-playwright'
```

## File Structure

Create these files:

- `docs/superpowers/reports/2026-06-02-pre-fix-validation-baseline.md` records the starting failures before phase 1 fixes.
- `packages/host-sdk/tests/mutable-tree.test.ts` covers incremental tree mutation behavior.
- `packages/react-runtime/tests/protocol-contract.test.ts` documents protocol version mismatch behavior once runtime checks are added.
- `playwright.config.ts` defines the root Playwright harness.
- `e2e/global-setup.ts` starts bridge server, plugin clients, and host dev servers for E2E runs.
- `e2e/demo-flows.ts` contains shared page actions and assertions for simple and advanced demos.
- `e2e/tests/svelte-host.spec.ts` covers the broadest matrix: Svelte host with React/Solid plugins and worker/node/main modes.
- `e2e/tests/react-host.spec.ts` covers React host parity with React plugins.
- `e2e/tests/vue-host.spec.ts` covers Vue host parity with React plugins.
- `scripts/run-e2e-baseline.mjs` runs Playwright, preserves the JSON result, writes a Markdown baseline, and exits successfully so the baseline can be reviewed even when tests fail.
- `scripts/write-e2e-baseline.mjs` converts Playwright JSON results into `docs/superpowers/reports/2026-06-02-e2e-baseline.md`.
- `docs/superpowers/reports/2026-06-02-package-audit.md` records the final audit.

Modify these files:

- `package.json` adds deterministic validation and E2E scripts plus Playwright dev dependency.
- `turbo.json` adds a `test` task.
- `.gitignore` ignores transient Playwright output under `.reports/`, `playwright-report/`, and `test-results/`.
- `packages/*/package.json` changes Vitest package `test` scripts to run mode.
- `packages/protocol/tests/index.test.ts` replaces stale template tests with protocol tests.
- `packages/host-sdk/tests/index.test.ts` removes or replaces stale template tests.
- `packages/react-renderer/tests/MyButton.test.tsx` replaces stale component-browser test with custom renderer tests.
- `packages/react-renderer/vite.config.ts` removes unused Vitest browser provider config.
- `packages/host-svelte/tests/MyButton.test.ts` replaces stale component-browser test with export smoke tests.
- `packages/host-svelte/vite.config.ts` removes unused Vitest browser provider config.
- `packages/protocol/src/rpc.ts` removes unused product-specific `updateItem` from `HostToPluginAPI`.
- `packages/protocol/src/version.ts` bumps the protocol version because the RPC interface changes.
- `packages/react-runtime/src/runtime.ts` removes duplicated handlers, removes broken `updateItem`, adds version check, and fixes null guards.
- `packages/react-runtime/src/ws-client.ts` adds missing `syncTree` and version check.
- `packages/solid-runtime/src/runtime.ts` removes `updateItem` and adds version check.
- `packages/solid-runtime/src/ws-client.ts` adds missing `syncTree` and version check.

---

## Phase 1: Validation Foundation

### Task 1: Capture Current Broken Baseline

**Files:**

- Create: `docs/superpowers/reports/2026-06-02-pre-fix-validation-baseline.md`

- [ ] **Step 1: Confirm branch and worktree**

Run:

```bash
git status --short --branch
git log --oneline -10
```

Expected: branch is visible and either clean or only contains changes intentionally made for this task.

- [ ] **Step 2: Run current validation commands before fixing anything**

Run each command and copy the output into the report:

```bash
pnpm --filter @uniview/react-runtime check-types
pnpm --filter @uniview/protocol exec vitest run
pnpm --filter @uniview/host-sdk exec vitest run
pnpm --filter @uniview/react-renderer test -- --run
pnpm --filter @uniview/host-svelte test -- --run
```

Expected: at least the known failures from the “Current Evidence To Preserve” section appear.

- [ ] **Step 3: Write the baseline report**

Create `docs/superpowers/reports/2026-06-02-pre-fix-validation-baseline.md` with this structure. Each command section must contain the exact output captured in Step 2. If a command unexpectedly passes, write `PASS` and include the exact stdout/stderr below it.

```markdown
# Pre-Fix Validation Baseline

**Date:** 2026-06-02
**Branch:** command output from `git branch --show-current`
**Commit:** command output from `git rev-parse --short HEAD`

## Summary

The validation foundation is currently broken before any fixes. TypeScript fails in `@uniview/react-runtime`, template Vitest tests fail in `@uniview/protocol` and `@uniview/host-sdk`, and browser test configuration is stale in renderer/adapter packages.

## Command Results

Add one subsection for each command from Step 2. Each subsection must include a fenced `text` block with the full captured stdout/stderr. Do not summarize command output in this report.
```

- [ ] **Step 4: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add docs/superpowers/reports/2026-06-02-pre-fix-validation-baseline.md
git commit -m "docs: record pre-fix validation baseline"
```

### Task 2: Add Deterministic Test Scripts

**Files:**

- Modify: `package.json`
- Modify: `turbo.json`
- Modify: `packages/protocol/package.json`
- Modify: `packages/react-renderer/package.json`
- Modify: `packages/react-runtime/package.json`
- Modify: `packages/host-sdk/package.json`
- Modify: `packages/host-svelte/package.json`
- Modify: `packages/solid-renderer/package.json`
- Modify: `packages/solid-runtime/package.json`

- [ ] **Step 1: Add root validation scripts**

Modify root `package.json` scripts to include these keys while preserving existing scripts:

```json
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "check-types": "turbo run check-types",
    "test": "turbo run test",
    "test:e2e": "pnpm build && playwright test",
    "test:e2e:baseline": "node scripts/run-e2e-baseline.mjs"
  }
}
```

- [ ] **Step 2: Add Turbo test orchestration**

Modify `turbo.json` so `tasks` contains:

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", ".svelte-kit/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 3: Make package Vitest scripts non-watch by default**

For each Vitest package listed in this task, change:

```json
"test": "vitest"
```

to:

```json
"test": "vitest run --passWithNoTests"
```

Do not change `examples/bridge-server/package.json`; it should keep:

```json
"test": "bun test src/bridge.test.ts"
```

- [ ] **Step 4: Verify scripts parse**

Run:

```bash
pnpm test
```

Expected before later fixes: command reaches package tests, but still fails because stale tests and runtime type errors have not been fixed yet.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add package.json turbo.json packages/*/package.json
git commit -m "chore: add deterministic test orchestration"
```

### Task 3: Replace Protocol Template Tests

**Files:**

- Modify: `packages/protocol/tests/index.test.ts`

- [ ] **Step 1: Replace stale `fn` test with protocol tests**

Replace the whole file with:

```typescript
import { describe, expect, test } from "vitest";
import {
  EVENT_PROPS,
  PROTOCOL_VERSION,
  extractEventName,
  handlerIdProp,
  isHandlerIdProp,
  isLayoutTag,
  isValidJSONValue,
  isValidUINode,
  validateInitializeRequest,
} from "../src";

describe("protocol exports", () => {
  test("exposes a positive integer protocol version", () => {
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });

  test("recognizes supported layout tags", () => {
    expect(isLayoutTag("div")).toBe(true);
    expect(isLayoutTag("Button")).toBe(false);
  });
});

describe("event handler prop helpers", () => {
  test.each(EVENT_PROPS)("round-trips %s handler IDs", (eventName) => {
    const propName = handlerIdProp(eventName);

    expect(isHandlerIdProp(propName)).toBe(true);
    expect(extractEventName(propName)).toBe(eventName);
  });

  test("rejects unknown handler-like props", () => {
    expect(isHandlerIdProp("_onUnknownHandlerId")).toBe(true);
    expect(extractEventName("_onUnknownHandlerId")).toBeNull();
  });
});

describe("runtime validators", () => {
  test("accepts valid JSON values", () => {
    expect(
      isValidJSONValue({ name: "Ada", enabled: true, count: 2, tags: ["demo"] }),
    ).toBe(true);
  });

  test("rejects function values", () => {
    expect(isValidJSONValue({ onClick: () => undefined })).toBe(false);
  });

  test("accepts a serializable UI tree", () => {
    expect(
      isValidUINode({
        id: "root",
        type: "div",
        props: { className: "container" },
        children: [
          "Hello",
          { id: "child", type: "span", props: {}, children: ["world"] },
        ],
      }),
    ).toBe(true);
  });

  test("validates initialize requests", () => {
    expect(
      validateInitializeRequest({
        protocolVersion: PROTOCOL_VERSION,
        props: { initialName: "Ada" },
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      props: { initialName: "Ada" },
    });
  });
});
```

- [ ] **Step 2: Run protocol tests**

Run:

```bash
pnpm --filter @uniview/protocol test
```

Expected: protocol tests pass.

- [ ] **Step 3: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add packages/protocol/tests/index.test.ts
git commit -m "test: replace protocol template tests"
```

### Task 4: Add Host SDK MutableTree Tests

**Files:**

- Modify: `packages/host-sdk/tests/index.test.ts`
- Create: `packages/host-sdk/tests/mutable-tree.test.ts`

- [ ] **Step 1: Remove stale `fn` test**

Replace `packages/host-sdk/tests/index.test.ts` with:

```typescript
import { describe, expect, test } from "vitest";
import { createComponentRegistry } from "../src";

describe("createComponentRegistry", () => {
  test("registers and retrieves components by type", () => {
    const registry = createComponentRegistry<() => string>();
    const Button = () => "button";

    registry.register("Button", Button);

    expect(registry.has("Button")).toBe(true);
    expect(registry.get("Button")).toBe(Button);
    expect(registry.has("Missing")).toBe(false);
    expect(registry.get("Missing")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Add MutableTree mutation coverage**

Create `packages/host-sdk/tests/mutable-tree.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import type { UINode } from "@uniview/protocol";
import { MutableTree } from "../src/mutable-tree";

function createRoot(): UINode {
  return {
    id: "root",
    type: "div",
    props: { className: "root" },
    children: [
      { id: "label", type: "span", props: {}, children: ["before"] },
      "tail",
    ],
  };
}

describe("MutableTree", () => {
  test("initializes and returns the current tree", () => {
    const tree = new MutableTree();
    const root = createRoot();

    tree.init(root);

    expect(tree.getTree()).toBe(root);
  });

  test("applies setProps to an indexed node", () => {
    const tree = new MutableTree();
    tree.init(createRoot());

    const next = tree.applyMutations([
      { type: "setProps", nodeId: "label", props: { className: "hot" } },
    ]);

    const label = next?.children[0];
    expect(typeof label).not.toBe("string");
    if (typeof label !== "string") {
      expect(label.props).toEqual({ className: "hot" });
    }
  });

  test("applies setText by parent and child index", () => {
    const tree = new MutableTree();
    tree.init(createRoot());

    const next = tree.applyMutations([
      { type: "setText", parentId: "label", childIndex: 0, text: "after" },
    ]);

    const label = next?.children[0];
    expect(typeof label).not.toBe("string");
    if (typeof label !== "string") {
      expect(label.children).toEqual(["after"]);
    }
  });

  test("appends, inserts, and removes child nodes", () => {
    const tree = new MutableTree();
    tree.init(createRoot());

    tree.applyMutations([
      {
        type: "appendChild",
        parentId: "root",
        node: { id: "last", type: "p", props: {}, children: ["last"] },
      },
      {
        type: "insertBefore",
        parentId: "root",
        beforeId: "last",
        node: { id: "middle", type: "p", props: {}, children: ["middle"] },
      },
    ]);

    const afterInsert = tree.getTree();
    expect(afterInsert?.children.map((child) => (typeof child === "string" ? child : child.id))).toEqual([
      "label",
      "tail",
      "middle",
      "last",
    ]);

    const afterRemove = tree.applyMutations([
      { type: "removeChild", parentId: "root", nodeId: "middle" },
    ]);

    expect(afterRemove?.children.map((child) => (typeof child === "string" ? child : child.id))).toEqual([
      "label",
      "tail",
      "last",
    ]);
  });

  test("replaces the root with setRoot", () => {
    const tree = new MutableTree();
    tree.init(createRoot());

    const replacement: UINode = {
      id: "replacement",
      type: "section",
      props: {},
      children: ["new root"],
    };

    expect(tree.applyMutations([{ type: "setRoot", node: replacement }])).toEqual(replacement);
  });
});
```

- [ ] **Step 3: Run host SDK tests**

Run:

```bash
pnpm --filter @uniview/host-sdk test
```

Expected: host SDK tests pass.

- [ ] **Step 4: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add packages/host-sdk/tests/index.test.ts packages/host-sdk/tests/mutable-tree.test.ts
git commit -m "test: cover host sdk registry and mutable tree"
```

### Task 5: Fix Runtime Protocol Contract Drift

**Files:**

- Modify: `packages/protocol/src/rpc.ts`
- Modify: `packages/protocol/src/version.ts`
- Modify: `packages/react-runtime/src/runtime.ts`
- Modify: `packages/react-runtime/src/ws-client.ts`
- Modify: `packages/solid-runtime/src/runtime.ts`
- Modify: `packages/solid-runtime/src/ws-client.ts`
- Create: `packages/react-runtime/tests/protocol-contract.test.ts`

- [ ] **Step 1: Use typecheck as the failing test**

Run:

```bash
pnpm --filter @uniview/react-runtime check-types
```

Expected before this task’s code changes: FAIL with duplicate methods, undefined `props`, nullable `handlerRegistry`, and missing `syncTree`/`updateItem` in `ws-client.ts`.

- [ ] **Step 2: Remove unused product-specific RPC method**

In `packages/protocol/src/rpc.ts`, remove this method from `HostToPluginAPI`:

```typescript
/**
 * Update a single list item for benchmarking
 * Designed for testing incremental mode efficiency
 * Triggers setText mutation on specific child by itemId
 */
updateItem(itemId: string, text: string): Promise<void>;
```

Rationale: `updateItem` is not called anywhere in the repo, is benchmark-specific, and violates the project rule that protocol must not define product-specific primitives or behavior.

- [ ] **Step 3: Bump protocol version**

Change `packages/protocol/src/version.ts` to:

```typescript
/**
 * Protocol version number
 * Increment this when making breaking changes to the protocol
 */
export const PROTOCOL_VERSION = 2;
```

- [ ] **Step 4: Add runtime contract tests**

Create `packages/react-runtime/tests/protocol-contract.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import type { HostToPluginAPI } from "@uniview/protocol";

describe("runtime RPC contract", () => {
  test("HostToPluginAPI does not include benchmark-specific updateItem", () => {
    type HasUpdateItem = "updateItem" extends keyof HostToPluginAPI ? true : false;
    const hasUpdateItem: HasUpdateItem = false;

    const methodNames: Array<keyof HostToPluginAPI> = [
      "initialize",
      "updateProps",
      "executeHandler",
      "destroy",
      "syncTree",
    ];

    expect(methodNames).toEqual([
      "initialize",
      "updateProps",
      "executeHandler",
      "destroy",
      "syncTree",
    ]);
    expect(hasUpdateItem).toBe(false);
  });
});
```

- [ ] **Step 5: Fix `packages/react-runtime/src/runtime.ts`**

Make these focused edits:

1. Add `PROTOCOL_VERSION` to the imports from `@uniview/protocol`.
2. Add this helper near the stats declarations:

```typescript
function assertProtocolVersion(protocolVersion: number): void {
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `Protocol version mismatch: host=${protocolVersion}, plugin=${PROTOCOL_VERSION}`,
    );
  }
}
```

3. At the start of `initialize(req)`, call:

```typescript
assertProtocolVersion(req.protocolVersion);
```

4. Remove the dead incremental branch that checks `if (mode !== "incremental")` inside `if (mode === "incremental")`.
5. Remove the broken `updateItem(itemId, text)` method entirely.
6. Remove the duplicate second definitions of `updateProps`, `executeHandler`, and `syncTree`.
7. Keep exactly one `syncTree` implementation with a non-null `handlerRegistry` guard:

```typescript
async syncTree() {
  if (!bridge || !handlerRegistry || !rpc) return;

  const serializedTree = serializeTree(
    bridge.rootInstance ?? null,
    handlerRegistry,
  ) as UINode | null;

  const bytes = JSON.stringify(serializedTree).length;
  stats.bytesSent += bytes;
  stats.messagesSent++;

  rpc.getAPI().updateTree(serializedTree);
},
```

- [ ] **Step 6: Fix `packages/react-runtime/src/ws-client.ts`**

Add `PROTOCOL_VERSION` to the imports from `@uniview/protocol`, add the same `assertProtocolVersion()` helper, call it at the start of `initialize(req)`, and add this method to the exposed API before `destroy()`:

```typescript
async syncTree() {
  if (!bridge || !handlerRegistry || !currentRpc) return;

  const serializedTree = serializeTree(
    bridge.rootInstance ?? null,
    handlerRegistry,
  ) as UINode | null;

  const bytes = JSON.stringify(serializedTree).length;
  stats.bytesSent += bytes;
  stats.messagesSent++;

  currentRpc.getAPI().updateTree(serializedTree);
},
```

- [ ] **Step 7: Fix `packages/solid-runtime/src/runtime.ts`**

Add `PROTOCOL_VERSION` to the imports from `@uniview/protocol`, add the same `assertProtocolVersion()` helper, call it at the start of `initialize(req)`, and remove this no-op method:

```typescript
async updateItem() {},
```

- [ ] **Step 8: Fix `packages/solid-runtime/src/ws-client.ts`**

Add `PROTOCOL_VERSION` to the imports from `@uniview/protocol`, add the same `assertProtocolVersion()` helper, call it at the start of `initialize(req)`, and add this method before `destroy()`:

```typescript
async syncTree() {
  if (!currentRpc || !handlerRegistry) return;

  const currentRoot = getRootNode();
  if (!currentRoot || currentRoot.children.length === 0) return;

  const serializedTree = serializeTree(
    currentRoot.children[0],
    handlerRegistry,
  ) as UINode | null;

  const bytes = JSON.stringify(serializedTree).length;
  stats.bytesSent += bytes;
  stats.messagesSent++;

  currentRpc.getAPI().updateTree(serializedTree);
},
```

- [ ] **Step 9: Verify runtime contract fixes**

Run:

```bash
pnpm --filter @uniview/protocol check-types
pnpm --filter @uniview/react-runtime check-types
pnpm --filter @uniview/solid-runtime check-types
pnpm --filter @uniview/react-runtime test
```

Expected: all pass.

- [ ] **Step 10: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add packages/protocol/src/rpc.ts packages/protocol/src/version.ts packages/react-runtime/src/runtime.ts packages/react-runtime/src/ws-client.ts packages/solid-runtime/src/runtime.ts packages/solid-runtime/src/ws-client.ts packages/react-runtime/tests/protocol-contract.test.ts
git commit -m "fix: align runtime rpc contract"
```

### Task 6: Replace Stale Renderer And Svelte Adapter Tests

**Files:**

- Modify: `packages/react-renderer/vite.config.ts`
- Modify: `packages/react-renderer/tests/MyButton.test.tsx`
- Modify: `packages/host-svelte/vite.config.ts`
- Modify: `packages/host-svelte/tests/MyButton.test.ts`

- [ ] **Step 1: Make React renderer Vitest config node-based**

Replace `packages/react-renderer/vite.config.ts` with:

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 2: Replace React renderer stale browser component test**

Replace `packages/react-renderer/tests/MyButton.test.tsx` with:

```typescript
import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { HandlerRegistry, createRenderBridge, render, serializeTree } from "../src";

function Demo() {
  return createElement(
    "div",
    { className: "root" },
    createElement("button", { onClick: () => undefined }, "Click me"),
    createElement("span", null, "Hello"),
  );
}

describe("react renderer", () => {
  test("serializes a rendered React tree into UINode", () => {
    const bridge = createRenderBridge();
    const registry = new HandlerRegistry();

    render(createElement(Demo), bridge);
    const tree = serializeTree(bridge.rootInstance, registry);

    expect(tree).toMatchObject({
      type: "div",
      props: { className: "root" },
    });

    if (!tree || typeof tree === "string") {
      throw new Error("Expected root UINode");
    }

    expect(tree.children).toHaveLength(2);
    expect(registry.size).toBe(1);
  });
});
```

- [ ] **Step 3: Make host-svelte Vitest config node-based**

Replace `packages/host-svelte/vite.config.ts` with:

```typescript
import { svelte } from "@sveltejs/vite-plugin-svelte";
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  root: "./playground",
  plugins: [svelte()],
  test: {
    root: ".",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Replace host-svelte stale MyButton test**

Replace `packages/host-svelte/tests/MyButton.test.ts` with:

```typescript
import { describe, expect, test } from "vitest";
import { ComponentRenderer, PluginHost } from "../src";

describe("host-svelte exports", () => {
  test("exports the public host components", () => {
    expect(PluginHost).toBeDefined();
    expect(ComponentRenderer).toBeDefined();
  });
});
```

- [ ] **Step 5: Run affected tests**

Run:

```bash
pnpm --filter @uniview/react-renderer test
pnpm --filter @uniview/host-svelte test
```

Expected: both pass without requiring `@vitest/browser-playwright`.

- [ ] **Step 6: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add packages/react-renderer/vite.config.ts packages/react-renderer/tests/MyButton.test.tsx packages/host-svelte/vite.config.ts packages/host-svelte/tests/MyButton.test.ts packages/react-renderer/src/serialization/handler-registry.ts
git commit -m "test: replace stale renderer adapter tests"
```

### Task 7: Verify The Validation Foundation End-To-End

**Files:**

- Modify only if a command reveals a blocking validation bug from earlier tasks.

- [ ] **Step 1: Run package-level validation**

Run:

```bash
pnpm check-types
pnpm test
pnpm build
```

Expected: all pass. If a command fails, inspect the exact package and fix only the root cause that blocks validation.

- [ ] **Step 2: Record validation foundation result**

Append this section to `docs/superpowers/reports/2026-06-02-pre-fix-validation-baseline.md`:

```markdown
## Post-Foundation Result

After the validation foundation fixes:

- `pnpm check-types`: PASS
- `pnpm test`: PASS
- `pnpm build`: PASS

Remaining functional unknowns are intentionally left for Playwright E2E baseline testing.
```

- [ ] **Step 3: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add docs/superpowers/reports/2026-06-02-pre-fix-validation-baseline.md
git commit -m "docs: record validation foundation result"
```

---

## Phase 2: Playwright E2E Baseline

### Task 8: Add Playwright Harness And Managed Dev Servers

**Files:**

- Modify: `package.json`
- Modify: `.gitignore`
- Create: `playwright.config.ts`
- Create: `e2e/global-setup.ts`

- [ ] **Step 1: Add Playwright dependency**

Run:

```bash
pnpm add -D -w @playwright/test
pnpm exec playwright install chromium
```

Expected: root `package.json` and `pnpm-lock.yaml` update, and Chromium is installed for local Playwright runs.

- [ ] **Step 2: Ignore transient Playwright output**

Add these lines to `.gitignore`:

```gitignore

# Playwright
.reports/
playwright-report/
test-results/
```

- [ ] **Step 3: Create root Playwright config**

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  globalSetup: "./e2e/global-setup.ts",
  reporter: [
    ["list"],
    ["json", { outputFile: ".reports/playwright-results.json" }],
    ["html", { outputFolder: ".reports/playwright-html", open: "never" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 4: Create global setup process manager**

Create `e2e/global-setup.ts`:

```typescript
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import process from "node:process";

const ROOT = process.cwd();
const managedProcesses: Array<{ name: string; child: ChildProcess }> = [];

function runPnpm(args: string[]): void {
  const result = spawnSync("pnpm", args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function startProcess(name: string, args: string[]): void {
  const child = spawn("pnpm", args, {
    cwd: ROOT,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  child.stdout?.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`[${name}] exited with code ${code}\n`);
    }
    if (signal) {
      process.stderr.write(`[${name}] exited with signal ${signal}\n`);
    }
  });

  managedProcesses.push({ name, child });
}

async function waitForHttp(url: string, label: string, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  let lastError = "not checked";

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`${label} did not become ready at ${url}: ${lastError}`);
}

function stopProcess(child: ChildProcess): void {
  if (!child.pid || child.killed) return;

  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    child.kill("SIGTERM");
  }
}

export default async function globalSetup() {
  runPnpm(["--filter", "@uniview/example-plugin", "run", "build"]);
  runPnpm(["--filter", "@uniview/plugin-solid-example", "run", "build"]);

  startProcess("bridge", ["--filter", "@uniview/bridge-server", "run", "start"]);
  await waitForHttp("http://127.0.0.1:3000/react/simple-demo.worker.js", "bridge server");

  startProcess("react-simple-client", ["--filter", "@uniview/example-plugin", "run", "client:simple"]);
  startProcess("react-advanced-client", ["--filter", "@uniview/example-plugin", "run", "client:advanced"]);
  startProcess("react-benchmark-full-client", ["--filter", "@uniview/example-plugin", "run", "client:benchmark-full"]);
  startProcess("react-benchmark-incremental-client", ["--filter", "@uniview/example-plugin", "run", "client:benchmark-incremental"]);
  startProcess("solid-simple-client", ["--filter", "@uniview/plugin-solid-example", "run", "client:simple"]);
  startProcess("solid-advanced-client", ["--filter", "@uniview/plugin-solid-example", "run", "client:advanced"]);
  startProcess("solid-benchmark-full-client", ["--filter", "@uniview/plugin-solid-example", "run", "client:benchmark-full"]);
  startProcess("solid-benchmark-incremental-client", ["--filter", "@uniview/plugin-solid-example", "run", "client:benchmark-incremental"]);

  startProcess("host-svelte", ["--filter", "@uniview/example-host-svelte", "run", "svelte", "--", "--host", "127.0.0.1", "--port", "5173"]);
  startProcess("host-react", ["--filter", "@uniview/example-host-react", "run", "react", "--", "--host", "127.0.0.1", "--port", "5174"]);
  startProcess("host-vue", ["--filter", "@uniview/example-host-vue", "run", "vue", "--", "--host", "127.0.0.1", "--port", "5175"]);

  await waitForHttp("http://127.0.0.1:5173/", "Svelte host");
  await waitForHttp("http://127.0.0.1:5174/", "React host");
  await waitForHttp("http://127.0.0.1:5175/", "Vue host");

  return async () => {
    for (const { child } of managedProcesses.reverse()) {
      stopProcess(child);
    }
  };
}
```

- [ ] **Step 5: Verify harness starts**

Run:

```bash
pnpm exec playwright test --list
```

Expected: no tests listed yet if specs have not been created, and global setup is not started by `--list`.

- [ ] **Step 6: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add package.json pnpm-lock.yaml .gitignore playwright.config.ts e2e/global-setup.ts
git commit -m "test: add playwright e2e harness"
```

### Task 9: Add Shared E2E Demo Flows

**Files:**

- Create: `e2e/demo-flows.ts`

- [ ] **Step 1: Create shared flow helpers**

Create `e2e/demo-flows.ts`:

```typescript
import { expect, type Page } from "@playwright/test";

export type HostName = "svelte" | "react" | "vue";
export type PluginFramework = "react" | "solid";
export type RuntimeMode = "worker" | "node-server" | "main-thread";
export type DemoName = "simple" | "advanced";

export const HOST_URLS: Record<HostName, string> = {
  svelte: "http://127.0.0.1:5173",
  react: "http://127.0.0.1:5174",
  vue: "http://127.0.0.1:5175",
};

export async function openSvelteDemo(
  page: Page,
  options: {
    framework: PluginFramework;
    runtime: RuntimeMode;
    demo: DemoName;
    update?: "full" | "incremental";
  },
): Promise<void> {
  const update = options.update ?? "full";
  await page.goto(
    `${HOST_URLS.svelte}/?framework=${options.framework}&runtime=${options.runtime}&demo=${options.demo}&update=${update}`,
  );
  await waitForDemoHeading(page, options.demo);
}

export async function openReactOrVueDemo(
  page: Page,
  host: "react" | "vue",
  options: { runtime: RuntimeMode; demo: DemoName },
): Promise<void> {
  await page.goto(HOST_URLS[host]);
  await chooseRuntime(page, options.runtime);
  await chooseDemo(page, options.demo);
  await waitForDemoHeading(page, options.demo);
}

export async function waitForDemoHeading(page: Page, demo: DemoName): Promise<void> {
  await expect(
    page.getByRole("heading", { name: demo === "simple" ? "Simple Demo" : "Advanced Demo" }),
  ).toBeVisible({ timeout: 20_000 });
}

export async function chooseRuntime(page: Page, runtime: RuntimeMode): Promise<void> {
  const buttonName =
    runtime === "worker" ? /Worker/ : runtime === "node-server" ? /Node\.js/ : /Main/;
  await page.getByRole("button", { name: buttonName }).click();
}

export async function chooseDemo(page: Page, demo: DemoName): Promise<void> {
  await page
    .getByRole("button", { name: demo === "simple" ? "Simple Demo" : "Advanced Demo" })
    .click();
}

export async function runSimpleFlow(page: Page): Promise<void> {
  await page.getByPlaceholder("Enter your name").fill("Ada");
  await page.getByRole("button", { name: /Click count: 0/ }).click();
  await page.getByRole("button", { name: /Click count: 1/ }).click();
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("Hello,")).toBeVisible();
  await expect(page.getByText("Ada")).toBeVisible();
  await expect(page.getByText(/2\s+times/)).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("Hello,")).toHaveCount(0);
}

export async function runAdvancedFlow(page: Page): Promise<void> {
  const submit = page.getByRole("button", { name: "Submit Form" });

  await expect(submit).toBeDisabled();
  await page.getByPlaceholder("Enter your username").fill("ada");
  await page.getByPlaceholder("Enter your email").fill("ada@example.com");
  await expect(submit).toBeEnabled();

  const switches = page.getByRole("switch");
  await switches.nth(0).click();
  await page.getByRole("button", { name: "SMS" }).click();

  await submit.click();
  await expect(page.getByRole("button", { name: "Submitting..." })).toBeVisible();
  await expect(page.getByText("Form Submitted Successfully!")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("ada", { exact: true })).toBeVisible();
  await expect(page.getByText("ada@example.com", { exact: true })).toBeVisible();
  await expect(page.getByText(/Notifications:\s*Enabled/)).toBeVisible();
  await expect(page.getByText(/Preference:\s*sms/)).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("Form Submitted Successfully!")).toHaveCount(0);
}
```

- [ ] **Step 2: Check TypeScript syntax through Playwright list command**

Run:

```bash
pnpm exec playwright test --list
```

Expected: no syntax errors from `e2e/demo-flows.ts`.

- [ ] **Step 3: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add e2e/demo-flows.ts
git commit -m "test: add shared e2e demo flows"
```

### Task 10: Add Svelte Host Matrix Tests

**Files:**

- Create: `e2e/tests/svelte-host.spec.ts`

- [ ] **Step 1: Create Svelte host matrix spec**

Create `e2e/tests/svelte-host.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";
import { openSvelteDemo, runAdvancedFlow, runSimpleFlow } from "../demo-flows";

const simpleCases = [
  { framework: "react", runtime: "worker" },
  { framework: "react", runtime: "main-thread" },
  { framework: "react", runtime: "node-server" },
  { framework: "solid", runtime: "worker" },
  { framework: "solid", runtime: "node-server" },
] as const;

for (const scenario of simpleCases) {
  test(`svelte host ${scenario.framework} ${scenario.runtime} simple demo`, async ({ page }) => {
    await openSvelteDemo(page, { ...scenario, demo: "simple" });
    await runSimpleFlow(page);
  });
}

const advancedCases = [
  { framework: "react", runtime: "worker" },
  { framework: "react", runtime: "main-thread" },
  { framework: "react", runtime: "node-server" },
  { framework: "solid", runtime: "worker" },
  { framework: "solid", runtime: "node-server" },
] as const;

for (const scenario of advancedCases) {
  test(`svelte host ${scenario.framework} ${scenario.runtime} advanced demo`, async ({ page }) => {
    await openSvelteDemo(page, { ...scenario, demo: "advanced" });
    await runAdvancedFlow(page);
  });
}

test("svelte host disables Solid main-thread mode", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/?framework=solid&runtime=main-thread&demo=simple&update=full");

  await expect(page.getByRole("button", { name: /Main/ })).toBeDisabled();
  await expect(page).toHaveURL(/runtime=worker/);
});

test("svelte host benchmark smoke renders and responds", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/?framework=react&runtime=worker&demo=benchmark&update=full");

  await expect(page.getByRole("heading", { name: /Benchmark/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Item count:/i)).toBeVisible();
  await page.getByRole("button", { name: /Update Single Item/i }).click();
  await expect(page.getByText(/Operations performed:/i)).toBeVisible();
});
```

- [ ] **Step 2: Run only Svelte host tests**

Run:

```bash
pnpm build
pnpm exec playwright test e2e/tests/svelte-host.spec.ts
```

Expected: some tests may fail. Do not fix functional failures in this task unless the harness itself is broken. The baseline phase records good and bad scenarios.

- [ ] **Step 3: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add e2e/tests/svelte-host.spec.ts
git commit -m "test: add svelte host e2e matrix"
```

### Task 11: Add React And Vue Host Parity Tests

**Files:**

- Create: `e2e/tests/react-host.spec.ts`
- Create: `e2e/tests/vue-host.spec.ts`

- [ ] **Step 1: Create React host spec**

Create `e2e/tests/react-host.spec.ts`:

```typescript
import { test } from "@playwright/test";
import { openReactOrVueDemo, runAdvancedFlow, runSimpleFlow } from "../demo-flows";

const runtimes = ["worker", "main-thread", "node-server"] as const;

for (const runtime of runtimes) {
  test(`react host ${runtime} simple demo`, async ({ page }) => {
    await openReactOrVueDemo(page, "react", { runtime, demo: "simple" });
    await runSimpleFlow(page);
  });

  test(`react host ${runtime} advanced demo`, async ({ page }) => {
    await openReactOrVueDemo(page, "react", { runtime, demo: "advanced" });
    await runAdvancedFlow(page);
  });
}
```

- [ ] **Step 2: Create Vue host spec**

Create `e2e/tests/vue-host.spec.ts`:

```typescript
import { test } from "@playwright/test";
import { openReactOrVueDemo, runAdvancedFlow, runSimpleFlow } from "../demo-flows";

const runtimes = ["worker", "main-thread", "node-server"] as const;

for (const runtime of runtimes) {
  test(`vue host ${runtime} simple demo`, async ({ page }) => {
    await openReactOrVueDemo(page, "vue", { runtime, demo: "simple" });
    await runSimpleFlow(page);
  });

  test(`vue host ${runtime} advanced demo`, async ({ page }) => {
    await openReactOrVueDemo(page, "vue", { runtime, demo: "advanced" });
    await runAdvancedFlow(page);
  });
}
```

- [ ] **Step 3: Run React and Vue host specs**

Run:

```bash
pnpm build
pnpm exec playwright test e2e/tests/react-host.spec.ts e2e/tests/vue-host.spec.ts
```

Expected: some tests may fail. Do not fix functional failures in this task unless process startup or selectors are wrong for all scenarios.

- [ ] **Step 4: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add e2e/tests/react-host.spec.ts e2e/tests/vue-host.spec.ts
git commit -m "test: add react vue host e2e parity"
```

### Task 12: Add E2E Baseline Report Generator

**Files:**

- Create: `scripts/write-e2e-baseline.mjs`
- Create: `scripts/run-e2e-baseline.mjs`

- [ ] **Step 1: Create JSON-to-Markdown baseline writer**

Create `scripts/write-e2e-baseline.mjs`:

```javascript
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const resultPath = join(process.cwd(), ".reports/playwright-results.json");
const reportPath = join(process.cwd(), "docs/superpowers/reports/2026-06-02-e2e-baseline.md");

function safeExec(command) {
  try {
    return execSync(command, { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function collectTests(suite, path = [], results = []) {
  const suitePath = suite.title ? [...path, suite.title] : path;

  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const title = [...suitePath, spec.title, test.title].filter(Boolean).join(" > ");
      const lastResult = test.results?.[test.results.length - 1];
      const errors = (lastResult?.errors ?? [])
        .map((error) => error.message ?? error.value ?? "unknown error")
        .join("\n");

      results.push({
        title,
        projectName: test.projectName ?? "unknown-project",
        outcome: test.outcome ?? lastResult?.status ?? "unknown",
        duration: lastResult?.duration ?? 0,
        errors,
      });
    }
  }

  for (const child of suite.suites ?? []) {
    collectTests(child, suitePath, results);
  }

  return results;
}

const data = JSON.parse(readFileSync(resultPath, "utf8"));
const tests = (data.suites ?? []).flatMap((suite) => collectTests(suite));
const passed = tests.filter((test) => test.outcome === "expected" || test.outcome === "passed");
const failed = tests.filter((test) => test.outcome !== "expected" && test.outcome !== "passed" && test.outcome !== "skipped");
const skipped = tests.filter((test) => test.outcome === "skipped");

const lines = [
  "# E2E Baseline",
  "",
  `**Date:** 2026-06-02`,
  `**Branch:** ${safeExec("git branch --show-current")}`,
  `**Commit:** ${safeExec("git rev-parse --short HEAD")}`,
  "",
  "## Summary",
  "",
  `- Total: ${tests.length}`,
  `- Passing: ${passed.length}`,
  `- Failing: ${failed.length}`,
  `- Skipped: ${skipped.length}`,
  "",
  "## Passing Scenarios",
  "",
  ...passed.map((test) => `- ${test.projectName}: ${test.title} (${test.duration}ms)`),
  "",
  "## Failing Scenarios",
  "",
  ...(failed.length === 0
    ? ["- None"]
    : failed.flatMap((test) => [
        `- ${test.projectName}: ${test.title}`,
        "",
        "```text",
        test.errors || "No error message recorded",
        "```",
        "",
      ])),
  "## Skipped Scenarios",
  "",
  ...(skipped.length === 0
    ? ["- None"]
    : skipped.map((test) => `- ${test.projectName}: ${test.title}`)),
  "",
  "## Next Use",
  "",
  "Use this report as the first functional baseline. Fixes after this point should update the report only when a scenario changes from failing to passing or from passing to failing.",
  "",
];

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${lines.join("\n")}\n`);
console.log(`Wrote ${reportPath}`);
```

- [ ] **Step 2: Create baseline runner that records failures**

Create `scripts/run-e2e-baseline.mjs`:

```javascript
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

function run(command, args) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
}

const build = run("pnpm", ["build"]);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const playwright = run("pnpm", ["exec", "playwright", "test"]);

if (!existsSync(".reports/playwright-results.json")) {
  console.error("Playwright did not produce .reports/playwright-results.json");
  process.exit(playwright.status ?? 1);
}

const writer = run("node", ["scripts/write-e2e-baseline.mjs"]);
if (writer.status !== 0) {
  process.exit(writer.status ?? 1);
}

if (playwright.status !== 0) {
  console.error("E2E baseline contains failing scenarios. Report was still written successfully.");
}

process.exit(0);
```

- [ ] **Step 3: Run baseline command**

Run:

```bash
pnpm test:e2e:baseline
```

Expected: `docs/superpowers/reports/2026-06-02-e2e-baseline.md` is created. Command exits 0 even when Playwright scenarios fail, because this command is for recording a baseline.

- [ ] **Step 4: Run strict E2E command**

Run:

```bash
pnpm test:e2e
```

Expected: exits 0 only if every E2E scenario passes. If it exits nonzero, the failure list must match the baseline report.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add scripts/write-e2e-baseline.mjs scripts/run-e2e-baseline.mjs docs/superpowers/reports/2026-06-02-e2e-baseline.md
git commit -m "test: record e2e baseline"
```

---

## Phase 3: Evidence-Based Audit

### Task 13: Write Package Audit Report

**Files:**

- Create: `docs/superpowers/reports/2026-06-02-package-audit.md`

- [ ] **Step 1: Create audit report skeleton**

Create `docs/superpowers/reports/2026-06-02-package-audit.md`:

```markdown
# Package Audit Report

**Date:** 2026-06-02
**Branch:** command output from `git branch --show-current`
**Commit:** command output from `git rev-parse --short HEAD`

## Validation Inputs

- `pnpm check-types`: PASS after validation foundation
- `pnpm test`: PASS after validation foundation
- `pnpm test:e2e:baseline`: report at `docs/superpowers/reports/2026-06-02-e2e-baseline.md`

## Decision Labels

- Keep: code is used and covered by validation or required by documented architecture.
- Fix: code is used but has a verified bug or missing coverage.
- Remove: code is unused, product-specific in the wrong layer, stale generated template code, or deprecated without consumers.
- Investigate: code may be valid but needs one focused test or usage trace before changing.

## Package Findings

### `packages/protocol`

| Area | Decision | Evidence | Action |
| --- | --- | --- | --- |
| RPC contract | Investigate | Compare `packages/protocol/src/rpc.ts` with every `HostToPluginAPI` object in runtimes | Mark Fix if any runtime method is missing; otherwise Keep |
| Protocol versioning | Investigate | Compare `PROTOCOL_VERSION` usage in host controllers and runtime `initialize()` methods | Mark Fix if any runtime skips mismatch checks; otherwise Keep |
| Validators | Investigate | Use protocol unit test results and `packages/protocol/src/validators.ts` review | Add missing tests for mutation schemas if validators do not cover mutations |
| Event handler helpers | Investigate | Use protocol unit test results and event prop search | Keep if all supported events round-trip and hosts consume the same names |

### `packages/react-renderer`

| Area | Decision | Evidence | Action |
| --- | --- | --- | --- |
| Host config lifecycle | Investigate | Compare `prepareForCommit`, `resetAfterCommit`, and mutation collector calls with E2E worker/main results | Mark Fix if full and incremental paths emit duplicate or missing updates |
| Handler registry lifecycle | Investigate | Review `HandlerRegistry.clear()` usage in full mode and stale handler comments in incremental mode | Add a focused leak/stale-handler test before cleanup |
| Serialization | Investigate | Use renderer unit tests and E2E text-child assertions | Keep if string children and handler IDs serialize consistently |
| Mutation collector | Investigate | Use benchmark smoke and `MutableTree` tests as evidence | Mark Fix if incremental scenarios fail while full mode passes |

### `packages/react-runtime`

| Area | Decision | Evidence | Action |
| --- | --- | --- | --- |
| Worker runtime | Investigate | Use React worker E2E scenarios in Svelte/React/Vue hosts | Mark Fix if failures are specific to worker mode |
| WebSocket client runtime | Investigate | Use React node-server E2E scenarios and bridge logs | Mark Fix if failures are specific to node-server mode |
| Deprecated WebSocket server export | Investigate | Search `ws-server` imports and package exports | Remove export only if no first-party or documented consumer remains |
| Benchmark stats | Investigate | Use benchmark smoke and inspect `globalThis.__uniview_stats` writes | Keep if benchmark uses stats; isolate if it pollutes non-benchmark demos |

### `packages/solid-renderer`

| Area | Decision | Evidence | Action |
| --- | --- | --- | --- |
| Global renderer state | Investigate | Review module-level root/callback/id state in `packages/solid-renderer/src/renderer/reconciler.ts` | Mark Fix if multiple Solid plugin clients can share a process |
| Serialization | Investigate | Use Solid worker/node E2E scenarios in Svelte host | Keep if React/Solid output parity holds for simple and advanced demos |
| Mutation collector | Investigate | Use Solid benchmark smoke in full and incremental modes | Mark Fix if incremental Solid fails while full Solid passes |

### `packages/solid-runtime`

| Area | Decision | Evidence | Action |
| --- | --- | --- | --- |
| Worker runtime | Investigate | Use Solid worker E2E scenarios in Svelte host | Mark Fix if failures are specific to Solid worker mode |
| WebSocket client runtime | Investigate | Use Solid node-server E2E scenarios and bridge logs | Mark Fix if failures are specific to Solid node-server mode |
| Prop update behavior | Investigate | Review `updateProps()` reset behavior and add a focused test before changing | Keep reset behavior if no host sends prop updates in examples |

### `packages/host-sdk`

| Area | Decision | Evidence | Action |
| --- | --- | --- | --- |
| Worker controller | Investigate | Use worker E2E scenarios and `packages/host-sdk/src/controllers/worker.ts` review | Mark Fix if worker fetch/blob setup breaks specific hosts |
| WebSocket controller | Investigate | Use node-server E2E scenarios and connection logs | Remove debug logs after failures are diagnosable through test output |
| Main-thread controller | Investigate | Use React main-thread E2E scenarios | Keep dev-only mode if it remains the fastest green baseline |
| Framework neutrality | Investigate | Review React imports in `packages/host-sdk/src/controllers/main.ts` and package peer deps | Document or split React-only main-thread controller in a later plan |
| MutableTree | Investigate | Use `packages/host-sdk/tests/mutable-tree.test.ts` and incremental benchmark smoke | Mark Fix for text-node remove/insert gaps verified by tests |

### `packages/host-svelte`

| Area | Decision | Evidence | Action |
| --- | --- | --- | --- |
| PluginHost lifecycle | Investigate | Use mode-switching E2E scenarios and inspect disconnect cleanup | Mark Fix if controller leaks or stale trees appear on switching |
| ComponentRenderer events | Investigate | Use simple counter and advanced form E2E scenarios | Mark Fix if failures are tied to event argument extraction |
| Text children rendering | Investigate | Use simple greeting and button-title assertions | Keep if string children render in layout and custom components |
| Unknown node handling | Investigate | Review fallback rendering and add a focused adapter test before changing | Keep visible unknown rendering for debugging |

### `packages/tui-renderer`

| Area | Decision | Evidence | Action |
| --- | --- | --- | --- |
| Relationship to Uniview protocol | Investigate | Check whether `packages/tui-renderer` imports `@uniview/protocol` or only shares concepts | Keep separate unless a protocol integration requirement is found |
| Test coverage | Investigate | Run `pnpm --filter @uniview/tui-renderer test` after test script normalization | Add focused tests only if this package is kept in active scope |

### `examples/*`

| Area | Decision | Evidence | Action |
| --- | --- | --- | --- |
| Svelte host demo | Investigate | Use broad Svelte E2E matrix | Treat as primary integration surface |
| React host demo | Investigate | Use React host E2E parity tests | Mark Fix for React-host-specific adapter gaps |
| Vue host demo | Investigate | Use Vue host E2E parity tests | Mark Fix for Vue-host-specific adapter gaps |
| React plugin example | Investigate | Use worker/node/main E2E scenarios | Keep as canonical React plugin fixture |
| Solid plugin example | Investigate | Use Svelte host Solid E2E scenarios | Keep as canonical Solid plugin fixture |
| Bridge server | Investigate | Use existing Bun bridge tests and node-server E2E scenarios | Keep pipe-only architecture unless forwarding bug is proven |
| macOS examples | Investigate | Review READMEs and exclude from Playwright scope | Keep manual examples if documented and not blocking validation |
| TUI demo | Investigate | Run package script and document relationship to active runtime | Keep or split after package scope decision |

## Cleanup Backlog

| Priority | Item | Evidence | Proposed Task |
| --- | --- | --- | --- |
| P0 | E2E scenario failures from `2026-06-02-e2e-baseline.md` | Failing Playwright scenarios | Create one bugfix plan per independent root cause |
| P1 | Deprecated exports, debug logs, and stale scripts confirmed unused | `rg` output plus package references | Remove in small commits after consumer search |
| P2 | Packages with no meaningful unit tests after phase 1 | `pnpm test` output and tests directory review | Add focused unit tests around protocol boundaries |
```

- [ ] **Step 2: Fill audit with evidence from commands and code search**

Run:

```bash
pnpm check-types
pnpm test
pnpm test:e2e:baseline
rg "console\.(log|warn|error)|deprecated|as any|@ts-ignore|@ts-expect-error|FIXME|HACK" packages examples --glob '*.{ts,tsx,svelte,vue}'
rg "updateItem|ws-server|MyButton|fn\(\)" packages examples --glob '*.{ts,tsx,svelte,vue,json}'
```

Expected: validation commands complete, E2E report exists, and search output gives concrete evidence for audit decisions.

- [ ] **Step 3: Required audit conclusions**

The report must explicitly answer these questions:

```markdown
## Required Conclusions

1. Which scenarios pass in Svelte host, React host, and Vue host?
2. Which scenarios fail, and are failures tied to host framework, plugin framework, or runtime mode?
3. Is incremental update mode safe enough to keep enabled in demos?
4. Which stale generated tests or configs were removed or replaced?
5. Which deprecated paths still have exports or scripts?
6. Which code appears unused but should not be removed without a separate test?
7. Which package has the highest risk of hidden behavior drift?
```

- [ ] **Step 4: Checkpoint**

Run:

```bash
git status --short
```

If commits are allowed:

```bash
git add docs/superpowers/reports/2026-06-02-package-audit.md
git commit -m "docs: add package audit report"
```

### Task 14: Final Validation And Handoff Summary

**Files:**

- Modify: `docs/superpowers/reports/2026-06-02-package-audit.md` if final command results differ from the report.

- [ ] **Step 1: Run final strict validation**

Run:

```bash
pnpm check-types
pnpm test
pnpm build
pnpm test:e2e:baseline
```

Expected: `check-types`, `test`, and `build` pass. `test:e2e:baseline` exits 0 and writes the latest baseline report even if some E2E scenarios fail.

- [ ] **Step 2: Run strict E2E once**

Run:

```bash
pnpm test:e2e
```

Expected: exits 0 if all scenarios pass. If it exits nonzero, the failing scenarios must be listed in `docs/superpowers/reports/2026-06-02-e2e-baseline.md` and summarized in the package audit.

- [ ] **Step 3: Write handoff summary**

Append this section to `docs/superpowers/reports/2026-06-02-package-audit.md`:

```markdown
## Handoff Summary

### Stable Commands

- `pnpm check-types`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e:baseline`

### Strict Command

- `pnpm test:e2e`

### Known Failing Functional Scenarios

Copy the failing scenario bullets from `docs/superpowers/reports/2026-06-02-e2e-baseline.md`. If there are no failing scenarios, write `- None`.

### Recommended Next Fix Order

Copy P0 and P1 cleanup backlog rows from this audit in the order they should be addressed. If all P0/P1 rows are empty after audit, write `- None`.
```

- [ ] **Step 4: Final status check**

Run:

```bash
git status --short
```

Expected: only intended files changed.

If commits are allowed:

```bash
git add .gitignore package.json pnpm-lock.yaml turbo.json playwright.config.ts e2e scripts docs/superpowers packages
git status --short
git commit -m "test: establish validation and e2e baseline"
```

---

## Expected End State

- `pnpm check-types` passes from the repo root.
- `pnpm test` passes from the repo root.
- `pnpm build` passes from the repo root.
- `pnpm test:e2e:baseline` starts the full demo stack, runs Playwright, and writes `docs/superpowers/reports/2026-06-02-e2e-baseline.md`.
- `pnpm test:e2e` is strict and fails when any E2E scenario fails.
- The E2E baseline identifies which host/framework/runtime/demo combinations are good and which are broken.
- `docs/superpowers/reports/2026-06-02-package-audit.md` contains evidence-backed cleanup decisions for every package and example area.

## Scope Guardrails

- Do not remove `packages/tui-renderer` during this plan. Audit it first because it may be intentionally separate from the protocol/host flow.
- Do not rewrite the bridge server during this plan. It is a simple pipe and already has Bun tests.
- Do not add a Solid host test because this repo currently has Solid plugins, not a Solid host example.
- Do not make benchmark auto-run part of strict E2E. Keep benchmark coverage to smoke interactions unless a separate slow-test profile is added.
- Do not silently mark broken E2E scenarios as skipped. If a scenario is broken, let strict E2E fail and record it in the baseline.
