# TUI npm Package Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Implemented — not published.

## Final implementation record

- Public byte-facing terminal APIs use `Uint8Array | string`; consuming the declarations
  does not require Node's `Buffer` type or borrowed monorepo type roots.
- `TerminalDriver.start({ cleanup })` owns framework/root/surface cleanup and driver resources
  as one retryable session. Both stream identities remain reserved while either side is pending;
  a next owner of either stream retries before acquisition, and stale handles are inert after a
  successful transfer. React uses the typed pre-mutation retain predicate for reentrant unmounts.
- `TuiRenderer` and `TuiHost` enter durable teardown before surface cleanup: queued scheduler
  callbacks are invalidated and all later mutation/render/dispatch paths reject while cleanup is
  pending or complete. `TerminalDriver` snapshots its cleanup options and contains exceptions
  from the retain predicate without replacing the original cleanup error.
- High-level Solid cleanup has one owner: module-global coordination stores the pending driver
  and retries `driver.stop()`; it never invokes the root disposer independently of the core
  barrier.
- The release boundary verifier scans every emitted core JavaScript import and bundled-code
  marker across ESM, CommonJS, and TypeScript artifact extensions, rejects Zod and undeclared
  runtime packages, checks every declaration family for imports and `Buffer`, and applies the
  same scanner to sha256-verified core and binding files extracted from the packed artifact.
- `pnpm check-types:tui-release` permanently covers protocol, core, host, both renderers,
  content, charts, style, and both bindings. `verify:tui-packages` and
  `smoke:tui-packages` invoke it.
- The packed core fixture remains the low-level memory-surface check. Packed React and Solid
  fixtures use each binding's public high-level `render()` with injected fake TTY streams and
  assert ANSI output, listener/raw-mode teardown, synchronous framework cleanup, replacement,
  and idempotent destruction. Every runtime fixture is installed and run once normally and once
  from a separate production-only project installed with `pnpm install --prod`.
- The isolated Solid TSX consumer declares only `@uniview/tui-solid` and `solid-js` as direct
  runtime dependencies and installs the real minimum `solid-js@1.9.10` required by
  `babel-preset-solid`. It exercises the public Vite transform and JSX augmentation, uses the
  repository's TypeScript executable only as compiler tooling, and does not inject
  `@types/node`, `typeRoots`, or internal packages.
- The private workspace build contract is Node 24 or newer because tsdown is build tooling;
  the three packed public packages retain their independent Node 18 runtime contract.
- One non-matrix CI job verifies/builds under Node 24 and uploads one named immutable artifact
  containing the descriptor plus exactly three tarballs. The Node 18.20.8, 20.19.0, and 24
  matrix jobs all download that same artifact and reuse those exact sha256-checked bytes without
  rebuilding or repacking. The script logs and validates `process.version`; it never downloads
  a second Node executable itself.

**Goal:** Make `@uniview/tui-core`, `@uniview/tui-react`, and `@uniview/tui-solid` the only packages required for the TUI npm release, with one-package installation for React or Solid users.

**Architecture:** Keep the framework-neutral terminal engine external as `@uniview/tui-core`. Bundle the host, framework renderer, content, charts, protocol, and style workspace modules into each framework binding's JavaScript and declaration output. Keep React/Solid as peers and keep only third-party imports plus `tui-core` as runtime dependencies.

**Tech Stack:** Node 24+ workspace build tooling, Node 18+ public package runtime, TypeScript 5.9, pnpm 10.28, tsdown 0.22, Vitest 2, React 19, Solid 1.9, Fumadocs/Next.js documentation.

## Global Constraints

- Public TUI release allowlist: `@uniview/tui-core`, `@uniview/tui-react`, `@uniview/tui-solid` only.
- All three public packages remain on the same exact `0.x` version line.
- `react` and `solid-js` remain peer dependencies; never bundle them.
- `@uniview/tui-core` remains an external runtime dependency of both bindings; never duplicate it inside their bundles.
- Emitted binding JavaScript and declarations may import `@uniview/tui-core` but no other `@uniview/*` package.
- Internal workspace dependencies move to `devDependencies` only after both JavaScript and declaration bundling are configured.
- Do not mark protocol/style/renderers private; their broader Uniview SDK publication is out of scope.
- Keep `@uniview/tui-react/compat` working for legacy `@uniview/tui-renderer` callers.
- Update public documentation under `docs/content/`; it must not teach consumers to install or import a non-public implementation package.
- No `@ts-ignore`, `@ts-expect-error`, or `as any`.
- Every task ends with targeted tests and a narrow commit.

---

## File map

- `packages/tui-react/src/index.ts`: React public exports, low-level root, and high-level terminal `render` helper.
- `packages/tui-solid/src/index.ts`: Solid public exports, low-level root, and high-level terminal `render` helper.
- `packages/tui-react/tests/public-api.test.tsx`: React facade/re-export/terminal-lifecycle contract.
- `packages/tui-solid/tests/public-api.test.tsx`: Solid facade/re-export/terminal-lifecycle contract.
- `packages/tui-react/tsdown.config.ts`: React implementation-module bundling and allowed emitted imports.
- `packages/tui-solid/tsdown.config.ts`: Solid implementation-module bundling and allowed emitted imports.
- `packages/{tui-core,tui-react,tui-solid}/package.json`: public metadata and runtime/build dependency boundaries.
- `scripts/verify-tui-package-boundaries.mjs`: deterministic emitted-file and manifest boundary audit.
- `scripts/smoke-tui-tarballs.mjs`: prepare immutable tarballs or reuse their descriptor in clean runtime projects.
- `scripts/tui-tarball-descriptor.mjs`: exact-package, manifest, file-list, safe tar-header,
  directory-topology, and sha256 descriptor validation.
- `scripts/tui-release-workflow.test.mjs`: single shared CI artifact and runtime-order assertion.
- `package.json`: release-verification scripts.
- `packages/{tui-core,tui-react,tui-solid}/README.md`: npm-facing installation and API documentation.
- `docs/content/docs/tui/*.mdx`: current React/Solid/core user guide.
- `docs/content/docs/guides/terminal-ui.mdx`: redirect stale legacy guide to the current package family.
- `docs/content/docs/index.mdx`: current package table.
- `README.md`: repository package table.
- `pnpm-lock.yaml`: manifest dependency movement.

---

### Task 1: React one-package public facade

**Files:**
- Modify: `packages/tui-react/src/index.ts`
- Create: `packages/tui-react/tests/public-api.test.tsx`

**Interfaces:**
- Consumes: `createTuiReactRoot(options: TuiReactRootOptions): TuiReactRoot`.
- Produces: `render(element: ReactElement, options?: TuiReactRenderOptions): TuiReactApp` and re-exported core surface/lifecycle APIs.

- [x] **Step 1: Add a failing public-facade test**

Create `packages/tui-react/tests/public-api.test.tsx` with injected TTY fakes. Assert that the main entry exports `AnsiCellSurface`, `MemoryCellSurface`, `SvgCellSurface`, `StyleTable`, `TerminalDriver`, `FrameClock`, and `yogaLayoutEngine`. Call the new `render()` with the fakes, await the existing `tick()`, assert ANSI output contains `Hello`, then destroy and assert raw mode changed from `true` to `false`.

```tsx
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import type { TtyInput, TtyOutput } from "@uniview/tui-core";
import {
  AnsiCellSurface,
  FrameClock,
  MemoryCellSurface,
  StyleTable,
  SvgCellSurface,
  TerminalDriver,
  Text,
  render,
  yogaLayoutEngine,
} from "../src/index";
import { tick } from "./tick";

class FakeInput implements TtyInput {
  isTTY = true;
  readonly rawModes: boolean[] = [];
  private readonly listeners = new Set<(chunk: Uint8Array | string) => void>();
  setRawMode(mode: boolean): void { this.rawModes.push(mode); }
  resume(): void {}
  pause(): void {}
  on(_event: "data", listener: (chunk: Uint8Array | string) => void): void { this.listeners.add(listener); }
  off(_event: "data", listener: (chunk: Uint8Array | string) => void): void { this.listeners.delete(listener); }
}

class FakeOutput implements TtyOutput {
  columns = 20;
  rows = 3;
  readonly chunks: string[] = [];
  private readonly listeners = new Set<() => void>();
  write(chunk: string): void { this.chunks.push(chunk); }
  on(_event: "resize", listener: () => void): void { this.listeners.add(listener); }
  off(_event: "resize", listener: () => void): void { this.listeners.delete(listener); }
}

describe("public React TUI facade", () => {
  it("re-exports the common core facilities", () => {
    expect([AnsiCellSurface, MemoryCellSurface, SvgCellSurface, StyleTable,
      TerminalDriver, FrameClock, yogaLayoutEngine]).not.toContain(undefined);
  });

  it("renders through the standard terminal lifecycle", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const app = render(h(Text, null, "Hello"), { input, output });
    await tick();
    expect(output.chunks.join("")).toContain("Hello");
    expect(input.rawModes).toEqual([true]);
    app.destroy();
    expect(input.rawModes).toEqual([true, false]);
  });
});
```

- [x] **Step 2: Run the test and verify the missing API failure**

Run: `pnpm --filter @uniview/tui-react test -- public-api.test.tsx`

Expected: FAIL because the main entry does not export `render` or the core facilities.

- [x] **Step 3: Add the React facade**

In `packages/tui-react/src/index.ts`, make `StyleTable`, `AnsiCellSurface`, and
`TerminalDriver` runtime imports, import the TTY types, and add these public interfaces:

```ts
export interface TuiReactRenderOptions
  extends Omit<TuiReactRootOptions, "surface" | "size" | "styles"> {
  width?: number;
  height?: number;
  input?: TtyInput;
  output?: TtyOutput;
}

export interface TuiReactApp extends TuiReactRoot {
  readonly driver: TerminalDriver;
}
```

Add `render()` after `createTuiReactRoot()`:

```ts
export function render(
  element: ReactElement,
  options: TuiReactRenderOptions = {},
): TuiReactApp {
  const input = options.input ?? (process.stdin as unknown as TtyInput);
  const output = options.output ?? (process.stdout as unknown as TtyOutput);
  const styles = new StyleTable();
  const root = createTuiReactRoot({
    surface: new AnsiCellSurface({ write: (chunk) => output.write(chunk), styles }),
    styles,
    size: {
      width: options.width ?? output.columns ?? 80,
      height: options.height ?? output.rows ?? 24,
    },
    committed: options.committed,
    devtools: options.devtools,
    clock: options.clock,
    layoutEngine: options.layoutEngine,
    mode: options.mode,
  });
  const driver = new TerminalDriver({
    input,
    output,
    onEvent: (event) => {
      if (event.type === "resize") {
        root.host.renderer.resize({ width: event.width, height: event.height });
      } else {
        root.dispatchInput(event);
      }
    },
  });
  driver.start();
  root.render(element);
  return {
    host: root.host,
    clock: root.clock,
    driver,
    render: (next) => root.render(next),
    dispatchInput: (event) => root.dispatchInput(event),
    destroy: () => {
      try { root.destroy(); } finally { driver.stop(); }
    },
  };
}
```

Re-export the common facilities and all root-option types needed by consumers from
`@uniview/tui-core`. Leave `compat.ts` behavior unchanged; its tests protect the legacy
`createTuiRoot()` entry while the new facade becomes the main-package default.

- [x] **Step 4: Verify React API and compatibility**

Run:

```bash
pnpm --filter @uniview/tui-react test -- public-api.test.tsx compat.test.tsx tui-react.test.tsx
pnpm --filter @uniview/tui-react check-types
```

Expected: all selected tests and type-check pass.

- [x] **Step 5: Commit the React facade**

```bash
git add packages/tui-react/src/index.ts packages/tui-react/tests/public-api.test.tsx
git commit -m "feat(tui-react): add one-package terminal facade"
```

---

### Task 2: Solid one-package public facade

**Files:**
- Modify: `packages/tui-solid/src/index.ts`
- Create: `packages/tui-solid/tests/public-api.test.tsx`

**Interfaces:**
- Consumes: `createTuiSolidRoot(options: TuiSolidRootOptions): TuiSolidRoot`.
- Produces: `render(App: () => unknown, options?: TuiSolidRenderOptions): TuiSolidApp` and the same core re-exports as React.

- [x] **Step 1: Add the Solid facade test**

Create `packages/tui-solid/tests/public-api.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import type { TtyInput, TtyOutput } from "@uniview/tui-core";
import {
  AnsiCellSurface,
  FrameClock,
  MemoryCellSurface,
  StyleTable,
  SvgCellSurface,
  TerminalDriver,
  Text,
  render,
  yogaLayoutEngine,
} from "../src/index";

class FakeInput implements TtyInput {
  isTTY = true;
  readonly rawModes: boolean[] = [];
  private readonly listeners = new Set<(chunk: Uint8Array | string) => void>();
  setRawMode(mode: boolean): void { this.rawModes.push(mode); }
  resume(): void {}
  pause(): void {}
  on(_event: "data", listener: (chunk: Uint8Array | string) => void): void { this.listeners.add(listener); }
  off(_event: "data", listener: (chunk: Uint8Array | string) => void): void { this.listeners.delete(listener); }
}

class FakeOutput implements TtyOutput {
  columns = 20;
  rows = 3;
  readonly chunks: string[] = [];
  private readonly listeners = new Set<() => void>();
  write(chunk: string): void { this.chunks.push(chunk); }
  on(_event: "resize", listener: () => void): void { this.listeners.add(listener); }
  off(_event: "resize", listener: () => void): void { this.listeners.delete(listener); }
}

describe("public Solid TUI facade", () => {
  it("re-exports the common core facilities", () => {
    expect([AnsiCellSurface, MemoryCellSurface, SvgCellSurface, StyleTable,
      TerminalDriver, FrameClock, yogaLayoutEngine]).not.toContain(undefined);
  });

  it("renders through the standard terminal lifecycle", () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const app = render(() => <Text>Hello</Text>, { input, output });
    expect(output.chunks.join("")).toContain("Hello");
    expect(input.rawModes).toEqual([true]);
    app.destroy();
    expect(input.rawModes).toEqual([true, false]);
  });
});
```

- [x] **Step 2: Run the Solid test and verify it fails**

Run: `pnpm --filter @uniview/tui-solid test -- public-api.test.tsx`

Expected: FAIL because the Solid entry has no high-level `render` or core re-exports.

- [x] **Step 3: Implement the Solid facade**

Add these Solid-specific interfaces:

```ts
export interface TuiSolidRenderOptions
  extends Omit<TuiSolidRootOptions, "surface" | "size" | "styles"> {
  width?: number;
  height?: number;
  input?: TtyInput;
  output?: TtyOutput;
}

export interface TuiSolidApp extends TuiSolidRoot {
  readonly driver: TerminalDriver;
}
```

Implement `render(App, options)` with `StyleTable`, `AnsiCellSurface`, and
`TerminalDriver`, route resize/input exactly as in Task 1, call `root.render(App)`, and return
a wrapper whose `destroy()` always stops the driver. Re-export the same core facilities and
consumer-facing types.

- [x] **Step 4: Verify Solid API and parity**

Run:

```bash
pnpm --filter @uniview/tui-solid test -- public-api.test.tsx tui-solid.test.tsx parity.test.tsx
pnpm --filter @uniview/tui-solid check-types
```

Expected: all selected tests and type-check pass.

- [x] **Step 5: Commit the Solid facade**

```bash
git add packages/tui-solid/src/index.ts packages/tui-solid/tests/public-api.test.tsx
git commit -m "feat(tui-solid): add one-package terminal facade"
```

---

### Task 3: Bundle implementation modules and enforce package boundaries

**Files:**
- Modify: `packages/tui-react/tsdown.config.ts`
- Modify: `packages/tui-solid/tsdown.config.ts`
- Modify: `packages/tui-react/package.json`
- Modify: `packages/tui-solid/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `scripts/verify-tui-package-boundaries.mjs`

**Interfaces:**
- Consumes: tsdown 0.22.2 `deps.alwaysBundle` and `deps.dts.alwaysBundle`.
- Produces: binding artifacts whose only allowed external `@uniview/*` import is `@uniview/tui-core`.

- [x] **Step 1: Write the artifact verifier**

Create `scripts/verify-tui-package-boundaries.mjs`. Recursively read `.mjs`, `.js`, `.d.mts`,
and `.d.ts` files under both binding `dist` directories. Extract package specifiers from
static and dynamic imports. Throw when an `@uniview/*` specifier other than
`@uniview/tui-core` appears. Parse each binding manifest and assert its only `dependencies`
key beginning with `@uniview/` is `@uniview/tui-core`, and assert the expected framework is a
peer.

```js
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const bindings = [
  { dir: "packages/tui-react", peer: "react" },
  { dir: "packages/tui-solid", peer: "solid-js" },
];
const allowedUniview = new Set(["@uniview/tui-core"]);
const sourceExtensions = new Set([".mjs", ".js", ".mts", ".ts"]);
const importPattern = /(?:from\s*|import\s*\()\s*["'](@?[^"']+)["']/g;

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));
  return nested.flat();
}

function packageName(specifier) {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}

for (const binding of bindings) {
  const packageDir = join(root, binding.dir);
  const manifest = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
  const internalRuntime = Object.keys(manifest.dependencies ?? {})
    .filter((name) => name.startsWith("@uniview/"));
  assert.deepEqual(internalRuntime, ["@uniview/tui-core"]);
  assert.ok(manifest.peerDependencies?.[binding.peer]);
  const declaredRuntime = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);

  for (const file of await filesBelow(join(packageDir, "dist"))) {
    if (!sourceExtensions.has(extname(file)) && !file.endsWith(".d.mts")) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
      const name = packageName(specifier);
      if (name.startsWith("@uniview/")) assert.ok(allowedUniview.has(name), `${file}: ${name}`);
      assert.ok(declaredRuntime.has(name), `${file}: undeclared runtime import ${name}`);
    }
  }
}

console.log("TUI package boundaries verified");
```

- [x] **Step 2: Prove the current build violates the boundary**

Run: `node scripts/verify-tui-package-boundaries.mjs`

Expected: FAIL on imports such as `@uniview/host-tui` or `@uniview/react-renderer`.

- [x] **Step 3: Configure tsdown bundling**

In the React config, define an array matching `host-tui`, `react-renderer`, `tui-content`,
`tui-charts`, `protocol`, and `style`; pass it to both `deps.alwaysBundle` and
`deps.dts.alwaysBundle`.

In the Solid config, apply the same pattern with `solid-renderer` instead of
`react-renderer`. The post-build verifier, rather than tsdown, enforces that every emitted
third-party import is declared as a runtime or peer dependency because pinned tsdown 0.22.2
does not yet expose the newer `deps.onlyImport` option.

```ts
const bundledWorkspacePackages = [
  /^@uniview\/(?:host-tui|react-renderer|tui-content|tui-charts|protocol|style)(?:\/.*)?$/,
];

deps: {
  alwaysBundle: bundledWorkspacePackages,
  dts: { alwaysBundle: bundledWorkspacePackages },
},
```

- [x] **Step 4: Correct the binding manifests**

For React, keep `@uniview/tui-core`, `react-reconciler`, `marked`, and `lowlight` in
`dependencies`; keep React as peer+dev; move the six bundled workspace packages to
`devDependencies`.

For Solid, keep `@uniview/tui-core`, `marked`, and `lowlight` in `dependencies`; keep Solid as
peer+dev; move its six bundled workspace packages to `devDependencies`. Retain React and
`@uniview/tui-react` dev dependencies used by parity tests.

Run `pnpm install --lockfile-only` to update importers without changing versions.

- [x] **Step 5: Build and verify the emitted boundary**

Run:

```bash
pnpm --filter @uniview/tui-core build
pnpm --filter @uniview/tui-react build
pnpm --filter @uniview/tui-solid build
node scripts/verify-tui-package-boundaries.mjs
```

Expected: all builds pass and the verifier prints `TUI package boundaries verified`.

- [x] **Step 6: Expose the verifier as a root command**

Add:

```json
"verify:tui-packages": "pnpm --filter @uniview/tui-core build && pnpm --filter @uniview/tui-react build && pnpm --filter @uniview/tui-solid build && node scripts/verify-tui-package-boundaries.mjs"
```

- [x] **Step 7: Commit the bundle boundary**

```bash
git add package.json pnpm-lock.yaml scripts/verify-tui-package-boundaries.mjs packages/tui-react/package.json packages/tui-react/tsdown.config.ts packages/tui-solid/package.json packages/tui-solid/tsdown.config.ts
git commit -m "build(tui): bundle internal package implementation"
```

---

### Task 4: Public package metadata and npm READMEs

**Files:**
- Modify: `packages/tui-core/package.json`
- Modify: `packages/tui-react/package.json`
- Modify: `packages/tui-solid/package.json`
- Modify: `packages/tui-core/README.md`
- Modify: `packages/tui-react/README.md`
- Modify: `packages/tui-solid/README.md`

**Interfaces:**
- Consumes: public APIs from Tasks 1–2.
- Produces: complete npm package pages with one-binding installation instructions.

- [x] **Step 1: Add package metadata**

Add Node `>=18`, repository URL `git+https://github.com/HuakunShen/uniview.git`, and the
correct package directory to all three manifests. Preserve MIT, public access, exports, types,
and `files: ["dist"]`.

```json
"engines": { "node": ">=18" },
"repository": {
  "type": "git",
  "url": "git+https://github.com/HuakunShen/uniview.git",
  "directory": "packages/tui-react"
}
```

Use the matching directory for core and Solid.

- [x] **Step 2: Rewrite npm-facing installation examples**

React README installs only `@uniview/tui-react react`; Solid README installs only
`@uniview/tui-solid solid-js`. Their first examples import `render`, components, and common
core exports only from the binding. Add an Advanced section that installs/imports
`@uniview/tui-core` directly for custom surfaces or no-framework use.

Correct the core README's inaccurate “dependency-free” wording to “framework-neutral”; its
manifest intentionally depends on terminal-width and Yoga packages.

- [x] **Step 3: Validate manifests and READMEs**

Run:

```bash
pnpm --filter @uniview/tui-core check-types
pnpm --filter @uniview/tui-react check-types
pnpm --filter @uniview/tui-solid check-types
git diff --check
```

Expected: all checks pass and no whitespace errors appear.

- [x] **Step 4: Commit package metadata/docs**

```bash
git add packages/tui-core/package.json packages/tui-core/README.md packages/tui-react/package.json packages/tui-react/README.md packages/tui-solid/package.json packages/tui-solid/README.md
git commit -m "docs(tui): prepare public npm package pages"
```

---

### Task 5: Update `docs/content/` and repository documentation

**Files:**
- Modify: `docs/content/docs/tui/getting-started.mdx`
- Modify: `docs/content/docs/tui/charts.mdx`
- Modify: `docs/content/docs/tui/solid.mdx`
- Modify: `docs/content/docs/tui/build-a-monitor.mdx`
- Modify: `docs/content/docs/guides/terminal-ui.mdx`
- Modify: `docs/content/docs/index.mdx`
- Modify: `README.md`

**Interfaces:**
- Consumes: installation and public exports established in Tasks 1–4.
- Produces: public documentation that mentions only the three supported TUI packages as consumer dependencies.

- [x] **Step 1: Update Getting Started**

Change install commands to one binding plus its framework. Make the first React and Solid
examples use their binding's `render()` and re-exported primitives. Keep low-level
`createTui*Root`, memory surface, SVG surface, and terminal-driver sections as Advanced API,
but import common core facilities from the binding unless the section explicitly teaches
direct core usage.

- [x] **Step 2: Remove stale implementation-package guidance**

Replace `docs/content/docs/guides/terminal-ui.mdx`'s old `@uniview/tui-renderer` guide with a
short current overview linking to `/docs/tui/getting-started` and using
`@uniview/tui-react`/`@uniview/tui-solid`.

Rewrite `tui/charts.mdx` examples to use exported React/Solid chart components rather than
direct imports from non-public `@uniview/tui-charts`. Update Solid bundler guidance so a
consumer never references internal `@uniview/solid-renderer`.

Change `build-a-monitor.mdx` imports so its public tutorial obtains core facilities through
`@uniview/tui-react`. Update the package table in `docs/content/docs/index.mdx` and the root
README to list core, React, and Solid instead of the legacy renderer.

- [x] **Step 3: Scan for invalid public package references**

Run:

```bash
rg -n '@uniview/(tui-renderer|host-tui|tui-content|tui-charts|react-renderer|solid-renderer)' \
  docs/content/docs/tui docs/content/docs/guides/terminal-ui.mdx \
  --glob '*.{md,mdx}'
rg -n '@uniview/(tui-renderer|host-tui|tui-content|tui-charts)' README.md
```

Expected: the TUI consumer guides and root README contain no installation/import examples for
the TUI-internal packages. The root README's package table legitimately lists
`@uniview/react-renderer` and `@uniview/solid-renderer`. This TUI release allowlist
intentionally does not apply to the broader browser/plugin SDK documentation: pages such as
the repository Getting Started, architecture guide, and renderer package references continue
to publish and teach those renderer packages for that separate SDK.

- [x] **Step 4: Validate Fumadocs content**

Run:

```bash
pnpm --filter docs types:check
pnpm --filter docs build
```

Expected: MDX generation, TypeScript checking, and the static docs build pass.

- [x] **Step 5: Commit public documentation**

```bash
git add README.md docs/content/docs
git commit -m "docs(tui): document three-package npm release"
```

---

### Task 6: Pack and isolated-install smoke verification

**Files:**
- Create: `scripts/smoke-tui-tarballs.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: built public package artifacts and local pnpm store.
- Produces: repeatable proof that packed manifests and clean-project resolution work.

- [x] **Step 1: Create the tarball smoke script**

Create `scripts/smoke-tui-tarballs.mjs` so it:

- packs exactly core, React, and Solid and validates their packed manifests and exports;
- supports a Node 24 `--prepare <directory>` phase that writes exactly those tarballs plus a
  deterministic descriptor containing their package identities, manifests, files, and sha256;
- supports a Node 18+ `--reuse <descriptor>` phase that validates and runs those exact existing
  tarballs without invoking tsdown, rebuilding, or repacking;
- rejects unsafe/duplicate/out-of-bounds tar entries, unsupported links/devices, and any extra
  file beside the descriptor and three referenced tarballs;
- keeps a low-level core-only memory-surface fixture;
- installs React with only the packed binding plus React as direct runtime dependencies, then
  exercises the public high-level `render()` through an injected fake TTY;
- installs Solid with only the packed binding plus `solid-js` as direct runtime dependencies,
  pins and verifies the real `solid-js@1.9.10` minimum with a single compatible installed graph,
  then exercises public `render()`, replacement, cleanup, and the public compiler subpaths;
- asserts ANSI output, raw mode, data/resize listener registration and removal, synchronous
  framework cleanup, and idempotent destruction;
- creates a separate production-only install for every runtime fixture, installs with
  `pnpm install --prod`, and runs it with `NODE_ENV=production`;
- type-checks an isolated Solid TSX consumer without internal packages, borrowed
  `@types/node`, `typeRoots`, or a `types` injection, only in the normal install;
- logs the actual Node version, requires Node 24 for default/prepare mode, and rejects reuse
  runtimes below the public packages' declared Node 18 engine.

- [x] **Step 2: Expose the smoke command**

Add the smoke command and reserve the publish command for an exact-tarball
orchestrator (implemented in Task 9):

```json
"smoke:tui-packages": "pnpm verify:tui-packages && node scripts/smoke-tui-tarballs.mjs"
```

The implementation and verification work must not execute `publish:tui`. Task 9 adds it only
after the exact descriptor-backed tarball orchestrator exists; recursive workspace/source-tree
publishing is not an acceptable release path.

- [x] **Step 3: Run the isolated smoke suite**

Run: `pnpm smoke:tui-packages`

Expected: builds succeed, boundary verification succeeds, all normal and production-only
offline installs succeed, and the script reports its actual build/runtime Node version plus both
runtime modes. One non-matrix CI job prepares and uploads the artifact under Node 24; all Node
18.20.8, 20.19.0, and 24 runtime matrix legs download and reuse that one named artifact.

- [x] **Step 4: Commit release smoke automation**

```bash
git add package.json scripts/smoke-tui-tarballs.mjs
git commit -m "test(tui): verify packed npm artifacts"
```

---

### Task 7: Full release-candidate validation

**Files:**
- Verify only; fix only files already in scope if a check exposes a defect.

**Interfaces:**
- Consumes: all preceding deliverables.
- Produces: evidence that the three tarballs are release candidates; does not publish them.

- [x] **Step 1: Run targeted package tests**

```bash
pnpm --filter @uniview/tui-core test
pnpm --filter @uniview/tui-react test
pnpm --filter @uniview/tui-solid test
```

Expected: all tests pass, including React/Solid parity suites.

- [x] **Step 2: Run type and build checks**

```bash
pnpm check-types:tui-release
pnpm verify:tui-packages
```

Expected: all commands pass. The release type-check command covers protocol, core, host,
React/Solid renderers, content, charts, style, and both public bindings.

- [x] **Step 3: Run docs and tarball checks**

```bash
pnpm --filter docs types:check
pnpm --filter docs build
pnpm smoke:tui-packages
```

Expected: all commands pass.

- [x] **Step 4: Inspect repository scope**

```bash
git diff --check
git status --short
git log --oneline -7
```

Expected: no whitespace errors, only intentional scoped changes remain, and the task commits
match this plan. Do not run `pnpm publish`; publication requires the user's separate explicit
instruction after release-candidate review.

---

### Task 8: Enforce one synchronous `CellSurface` contract

**Files:**
- Modify: `packages/tui-core/src/surface/types.ts`
- Modify: `packages/tui-core/src/renderer/tui-renderer.ts`
- Modify: `packages/tui-core/tests/renderer/tui-renderer.test.ts`
- Modify: `scripts/verify-tui-package-boundaries.mjs`
- Modify: `scripts/verify-tui-package-boundaries.test.mjs`
- Modify: `scripts/smoke-tui-tarballs.mjs`
- Modify: `packages/tui-core/README.md`
- Modify: `docs/content/docs/tui/getting-started.mdx`
- Modify: `docs/superpowers/specs/2026-07-22-tui-npm-package-boundaries-design.md`

**Interfaces:**
- Consumes: the existing synchronous ANSI, memory, and SVG surfaces.
- Produces: `CellSurface.mount/resize/destroy(...): void` and
  `CellSurface.present(...): PresentStats`, with runtime rejection of Promise/thenable results.

- [x] **Step 1: Add runtime and packed-declaration regressions**

Add renderer tests whose structurally bypassed surfaces return a thenable from each lifecycle
method. Each call must throw a `CellSurface.<method>() must complete synchronously` error. Add a
surface whose synchronous `present()` calls `renderer.destroy()` and assert:

```ts
expect(renderer.currentFrame).toBeNull()
expect(renderer.owners.size).toBe(1) // only the reserved no-owner slot
expect(() => renderer.flush()).toThrow(/teardown|destroy/i)
clock.drain()
expect(renderer.currentFrame).toBeNull()
```

Add a declaration validator test that rejects the old `void | Promise<void>` /
`PresentStats | Promise<PresentStats>` interface and accepts only the synchronous signatures.

- [x] **Step 2: Run RED**

```bash
pnpm --filter @uniview/tui-core test -- tests/renderer/tui-renderer.test.ts
node --test scripts/verify-tui-package-boundaries.test.mjs
```

Expected: the thenable and reentrant-present assertions fail against the dual sync/async
contract, and the declaration validator is not yet exported.

- [x] **Step 3: Narrow the type and enforce it at runtime**

Change the public interface to synchronous return types. In `TuiRenderer`, inspect every
surface call result; an object/function with a callable `then` is a fatal contract violation.
Begin durable teardown before throwing, and commit `previous`, owners, and rendered diagnostics
after `present()` only while lifecycle is still active.

- [x] **Step 4: Run focused GREEN and document custom surfaces**

Run the two RED commands again. Update core/user/design docs to state custom surfaces must finish
mount, resize, frame presentation, and destruction synchronously; asynchronous I/O belongs
behind a surface-owned queue and cannot be returned to the renderer.

---

### Task 9: Publish the descriptor-verified tarballs, never the source tree

**Files:**
- Create: `scripts/publish-tui-tarballs.mjs`
- Create: `scripts/publish-tui-tarballs.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-22-tui-npm-package-boundaries-design.md`

**Interfaces:**
- Consumes: `verify:tui-packages`, `smoke-tui-tarballs.mjs --prepare/--reuse`, and
  `loadTarballDescriptor()`.
- Produces: `publish:tui` and `publish:tui:dry-run`, both using exact absolute descriptor
  filenames in core, React, Solid order.

- [x] **Step 1: Add an injected command-plan test**

Test a wished-for `orchestrateTuiPublish({ dryRun, runCommand, resetArtifacts,
loadDescriptor })`. Assert the final commands are exactly:

```js
["publish", coreTgz, "--access", "public", "--ignore-scripts", "--publish-branch", "main"]
["publish", reactTgz, "--access", "public", "--ignore-scripts", "--publish-branch", "main"]
["publish", solidTgz, "--access", "public", "--ignore-scripts", "--publish-branch", "main"]
```

Dry-run adds only `--dry-run`. Tests must prove no recursive/source publish, no glob inference,
no `--no-git-checks`, stop-on-first-failure, and descriptor/tamper rejection before any publish.

- [x] **Step 2: Run RED**

```bash
node --test scripts/publish-tui-tarballs.test.mjs
```

Expected: module/API missing; no registry command executes.

- [x] **Step 3: Implement the safe orchestrator**

Require root Node 24+, run full verification, safely replace only the exact ignored
`.tui-release/` directory, prepare and load the exact four-file artifact, run `--reuse`, reload
the descriptor, then execute the three positional tarball commands sequentially. Preserve the
artifact on success and failure. The real runner uses `pnpm publish` with default git checks;
`--ignore-scripts` prevents `prepublishOnly` from rebuilding source bytes.

- [x] **Step 4: Run focused GREEN without publishing**

```bash
node --test scripts/publish-tui-tarballs.test.mjs
```

Do not run `publish:tui`. Do not run `publish:tui:dry-run` unless it is independently proven to
avoid network and registry state; the injected command-plan test is the required safe proof.

- [x] **Step 5: Run the complete release validation**

Run all six release suites plus host, ten-package build/type checks, release gates, default
packed smoke, one persistent descriptor reused on Node 25/18.20.8/20.19.0/24, docs checks,
frozen install validation, static scans, and final diff/status review. No actual publish occurs.
