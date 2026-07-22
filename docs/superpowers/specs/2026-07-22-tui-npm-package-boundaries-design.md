# TUI npm Package Boundaries — Design Spec

**Date:** 2026-07-22
**Status:** Implemented — not published

## 1. Goal

Publish the Uniview TUI as three coherent public npm packages while preserving the
fine-grained workspace modules used during development:

- `@uniview/tui-core` — framework-neutral terminal engine
- `@uniview/tui-react` — complete React entry point
- `@uniview/tui-solid` — complete Solid entry point

A framework user installs one binding plus its framework. The package manager installs
`tui-core` transitively. The remaining workspace packages are implementation modules, not
requirements that a TUI consumer must install or that this release must publish.

## 2. Approaches considered

### A. Publish core plus two framework bindings (chosen)

Keep `tui-core` external and shared. Bundle the host, renderer, content, charts, protocol,
and style implementation into each framework binding.

This avoids shipping two copies of the terminal engine, preserves a useful low-level API for
custom surfaces/backends and headless tests, and reduces the TUI release train from eight
packages to three.

### B. Publish only the two framework bindings

Bundle `tui-core` into both bindings. This makes the release train one package shorter but
duplicates Yoga, cell/render state, terminal lifecycle code, and core types when React and
Solid coexist. It also removes the natural extension boundary used by alternate surfaces and
backends. Rejected.

### C. Publish every workspace package

Keep all current `workspace:*` dependencies external and publish the full dependency graph.
This matches the existing build output but exposes implementation boundaries as public APIs,
requires coordinated releases for eight packages, and makes the first release unnecessarily
fragile. Rejected for the TUI release.

## 3. Public package contracts

### `@uniview/tui-core`

`tui-core` remains an ordinary public package. It owns the framework-neutral engine:

- grapheme and terminal-cell measurement
- layout engines, including the Yoga adapter
- paint, cell buffers, ownership maps, and frame diffing
- ANSI, memory, and SVG surfaces
- terminal lifecycle, input parsing, focus, and hit testing
- framework-neutral component state machines
- canvas, themes, animation clocks, and headless test helpers

It has no dependency on another `@uniview/*` package. Its third-party runtime dependencies
remain normal `dependencies`.

`TerminalDriver` is also the ownership authority for the complete terminal session. Low-level
composers register renderer/framework cleanup with `start({ cleanup })`; `stop()` runs that
cleanup first and then releases driver resources best-effort. If cleanup remains pending, both
input and output identities remain reserved and either stream's next owner retries the exact
callback before acquisition. A typed retain predicate may leave a demonstrably unmodified live
session in place; stale handles are inert once ownership transfers.

The driver snapshots the callback and retain predicate rather than retaining the caller's
mutable options object. If a retain predicate itself throws, that failure is contained: the
original cleanup error remains authoritative, driver resources are still released best-effort,
and the original callback remains pending. Solid's high-level global coordination stores and
retries this pending driver; it never calls the same root disposer through a second path.

`TuiRenderer` and `TuiHost` enter a durable teardown state before surface cleanup. That state
cancels queued scheduler generations and rejects later render, resize, cursor, mutation, event,
or flush operations even when `destroy()` must be retried. Old public handles therefore cannot
present into a replacement session.

`CellSurface` has one synchronous contract matching every shipped surface and the synchronous
renderer/terminal lifecycle: `mount`, `resize`, and `destroy` return `void`; `present` returns
`PresentStats`. Runtime guards reject Promise and thenable results from untyped consumers and
enter durable teardown. A custom surface may own an asynchronous queue internally, but the
renderer-visible operation and I/O ownership transition must complete synchronously. If
`present()` synchronously destroys the renderer, no frame, owner map, or rendered diagnostic is
committed after it returns. The same lifecycle check follows `resize()`. Surface destruction has
a one-call reentrancy guard: recursive calls are inert, while the guard clears after an outer
failure so a later external destroy can retry. Errors thrown while reading a returned value's
`then` property enter teardown and retain their exact identity. Teardown discards renderer work
that can no longer commit so diagnostics and `waitForIdle()` do not remain pending forever.

`TuiHost` latches itself into teardown whenever its public renderer becomes non-active, whether
the renderer was destroyed directly or rejected a surface contract. Every later tree mutation,
render, focus/commit action, event/automation dispatch, and `InputRouter` subscription/render/input
path rejects before stale handlers can run. Semantic queries and command-trace reads remain
read-only.

### `@uniview/tui-react`

The React package is a complete user-facing binding. It keeps:

- `react` as a peer dependency and development dependency
- `@uniview/tui-core` as its only external `@uniview/*` runtime dependency
- third-party packages that remain imported by emitted JavaScript as direct runtime
  dependencies

It bundles these workspace implementation modules into JavaScript and declaration output:

- `@uniview/host-tui`
- `@uniview/react-renderer`
- `@uniview/tui-content`
- `@uniview/tui-charts`
- their `@uniview/protocol` and `@uniview/style` dependencies

### `@uniview/tui-solid`

The Solid package follows the same contract. It keeps `solid-js ^1.9.10` as a peer and installs
exactly `solid-js 1.9.10` for binding development/tests, matching the lower bound declared by
the installed `babel-preset-solid`. It keeps `@uniview/tui-core` external and bundles
`host-tui`, `solid-renderer`, `tui-content`, `tui-charts`, `protocol`, and `style` into
JavaScript and declarations.

## 4. Build and manifest changes

The React and Solid tsdown configurations will use `deps.alwaysBundle` for the selected
workspace implementation packages. The declaration build will apply the same rule through
`deps.dts.alwaysBundle`. React/Solid and `@uniview/tui-core` remain external.

After bundling is proven, bundled workspace packages move from the binding's `dependencies`
to `devDependencies`. Moving them before the emitted JavaScript and declaration files are
self-contained is forbidden.

Third-party dependency declarations are derived from emitted imports, not copied blindly
from workspace manifests. At minimum, the audit covers `react-reconciler`, `marked`,
`lowlight`, Zod 4, `get-east-asian-width`, and `yoga-layout`. Core owns the last two and must
neither import nor contain bundled Zod; each binding owns any other dependency that remains
external in its output.

`workspace:*` is retained for `@uniview/tui-core` during workspace development. pnpm rewrites
it to the concrete release version in the packed manifest. All three packages release at the
same version and the framework bindings require that exact core version during the initial
`0.x` line.

## 5. Consumer API

The normal installation remains one TUI package plus its framework:

```bash
pnpm add @uniview/tui-react react
pnpm add @uniview/tui-solid solid-js
```

Both bindings re-export the commonly required core facilities so introductory code never
imports an undeclared transitive dependency:

- `AnsiCellSurface`
- `MemoryCellSurface`
- `SvgCellSurface`
- `StyleTable`
- `TerminalDriver`
- `FrameClock`
- `yogaLayoutEngine`
- the public types required by root options

The existing `createTuiReactRoot` and `createTuiSolidRoot` APIs remain available. Each binding
also gains a high-level terminal `render` helper that constructs the standard ANSI surface,
style table, terminal driver, and framework root. This is the default getting-started path;
custom surfaces and headless rendering continue to use the low-level APIs.

Advanced users may install `@uniview/tui-core` directly to build a no-framework TUI, a custom
surface, a layout adapter, a backend, or a headless test harness.

## 6. Non-public implementation packages

The TUI release does not publish these packages:

- `@uniview/host-tui`
- `@uniview/tui-content`
- `@uniview/tui-charts`
- `@uniview/tui-renderer` (legacy)
- `@uniview/tui-agent`
- `@uniview/tui-backend-opentui`
- `@uniview/tui-surface-dom`

`@uniview/protocol`, `@uniview/style`, `@uniview/react-renderer`, and
`@uniview/solid-renderer` are also not prerequisites for the TUI release because their code is
bundled into the framework bindings. They may still be released later as part of the broader
Uniview plugin SDK. This design does not mark those shared packages private or otherwise make
that separate product decision.

Release tooling must use an explicit allowlist for the three TUI packages instead of a broad
recursive publish command.

### Build runtime versus package runtime

The private release workspace requires Node `^24.15.0 || >=26.0.0` for installs, builds, tests,
docs, packaging, and publication tooling. This is a build-tool contract; it does not raise the
runtime floor of the three public tarballs, whose manifests remain `node >=18`.

The release smoke therefore has two immutable phases. One non-matrix Node 24 job verifies,
builds, and packs the exact three public packages into an explicit directory, then writes and
uploads one named artifact containing a deterministic descriptor plus those tarballs. The
descriptor covers package names, versions, packed manifests, file lists, normalized safe tar
paths, supported regular-file entry types, archive bounds, duplicate rejection, directory
topology, and sha256 hashes. Every runtime matrix job downloads that same artifact, switches
Node versions, and installs/runs the same existing bytes without rebuilding or repacking.

Local publication uses the same descriptor model under the persistent ignored `.tui-release/`
root. An exclusive sibling `.tui-release.lock` is acquired before the artifact root is created and
is held through the final registry operation. Concurrent invocations stop before verify/prepare;
a crash-stale lock requires manual artifact audit and removal rather than automatic stealing. Each
invocation creates a real, run-unique `run-*` child with `mkdtemp`; traversal and symlink escapes
are rejected, the shared root is never reset, and every run remains after success or failure.

The first validated descriptor becomes an immutable identity containing its absolute path and
sha256 plus exact package names, versions, basenames, tar sha256 values, manifests, and file lists.
After normal/production smoke, the descriptor is reloaded and compared exactly. All three tarballs
are then read into `Buffer`s and independently re-hashed before npm configuration or publication
begins; later filesystem changes cannot change the captured bytes.

The actual publisher loads official npm configuration through `@npmcli/config` and sends those
three verified Buffers through `libnpmpublish`, sequentially in core, React, Solid order with
`access: "public"` and `defaultTag: "latest"`. A real git preflight requires clean synchronized
`main` before any verification and is repeated immediately before each package. Publication never
recursively publishes source directories. The local `publish:tui:dry-run` performs verification,
packing, smoke, descriptor comparison, and Buffer capture but deliberately skips git release
readiness, npm configuration, the publisher, and all registry access. If both the release and lock
cleanup fail, the aggregate preserves the release error as its cause; a cleanup-only failure is
surfaced directly.

## 7. Verification and release gates

Before publishing:

1. Run `test:tui-release`, which covers protocol, core, host, both renderers, content, charts,
   style, and both bindings inside the real `verify:tui-packages`/publication gate.
2. Build and type-check the three public packages and all implementation packages they use.
3. Inspect emitted JavaScript: React/Solid may import `@uniview/tui-core`, but no other
   `@uniview/*` package. Independently scan every core JavaScript file with AST-derived imports
   for undeclared runtime packages, any Zod import, and bundled Zod markers. Cover ESM,
   CommonJS, JSX, and emitted TypeScript extensions (`.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`,
   `.tsx`, `.mts`, `.cts`).
4. Inspect emitted declarations under the same package-boundary rule and reject Node `Buffer`
   leakage for `.d.ts`, `.d.mts`, and `.d.cts`. Apply the same JavaScript/declaration scan to
   descriptor- and sha256-verified core and binding files read directly from the immutable
   packed tarballs.
5. Inspect packed manifests: `workspace:*` must be rewritten to the concrete core version,
   framework peers must remain peers, and every emitted third-party import must be declared.
6. In one non-matrix Node 24 job, pack the exact three tarballs, verify their immutable
   descriptor and exact four-file directory, then upload that one named artifact before any
   runtime-version switch.
7. Install those descriptor-verified tarballs into clean temporary projects using strict pnpm
   resolution, then repeat every runtime fixture in a separate production-only
   `pnpm install --prod` project.
8. Run a React ANSI smoke app, a Solid ANSI smoke app, and a core-only memory-surface test in
   both normal and `NODE_ENV=production` modes. On Node versions supported by the current tools,
   also run packed Solid TSX through Vite 8.1.5 / `vite-node` 6.0.0, mutate a signal, and require a
   second frame; the structural helper remains compatible with the Vite 5.4 examples.
9. In CI, make every actual Node 18.20.8, Node 20.19.0, and Node 24 runtime leg depend on the
   prepare job, download its shared artifact, and reuse it without invoking workspace build or
   pack tooling after the runtime switch.
10. Confirm each package includes README, license metadata, exports, types, repository metadata,
   and the supported Node engine.

All gates complete before the first registry command. Publication then runs sequentially in
`tui-core`, `tui-react`, `tui-solid` order and stops on the first command failure. The exact local
artifact remains available for audit or a deliberate recovery; the orchestrator never rebuilds
or repacks between those commands. Registry writes cannot be transactional: if core was accepted
before React or Solid fails (or before a subsequent identity check detects mutation), the release
is partially published and requires explicit recovery from the preserved run.

## 8. Compatibility and risks

- Existing React callers can migrate from `@uniview/tui-renderer` through the retained
  `@uniview/tui-react/compat` entry point.
- Existing low-level imports from `@uniview/tui-core` continue to work because core remains
  public.
- Bundled implementation types must not leak package-qualified names into `.d.mts`; the
  declaration scan and isolated installs enforce this.
- Bundling both framework adapters separately duplicates the smaller host/protocol/content
  implementation, but deliberately does not duplicate the terminal engine.
- `tui-core` currently exposes a broad API. The initial `0.x` version communicates that it is
  still evolving; subsequent incompatible changes require coordinated versions of all three
  public packages.

## 9. Out of scope

- Publishing the broader browser/native Uniview plugin SDK
- Publishing optional agent, OpenTUI, or DOM-surface extensions
- Redesigning core rendering behavior or adding new components
- Stabilizing a `1.0` API or supporting independent package version lines
