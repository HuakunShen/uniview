# TUI npm Package Boundaries — Design Spec

**Date:** 2026-07-22
**Status:** Implemented and final-review hardened — not published

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

The Solid package follows the same contract. It keeps `solid-js` as a peer and development
dependency, keeps `@uniview/tui-core` external, and bundles `host-tui`, `solid-renderer`,
`tui-content`, `tui-charts`, `protocol`, and `style` into JavaScript and declarations.

## 4. Build and manifest changes

The React and Solid tsdown configurations will use `deps.alwaysBundle` for the selected
workspace implementation packages. The declaration build will apply the same rule through
`deps.dts.alwaysBundle`. React/Solid and `@uniview/tui-core` remain external.

After bundling is proven, bundled workspace packages move from the binding's `dependencies`
to `devDependencies`. Moving them before the emitted JavaScript and declaration files are
self-contained is forbidden.

Third-party dependency declarations are derived from emitted imports, not copied blindly
from workspace manifests. At minimum, the audit covers `react-reconciler`, `marked`,
`lowlight`, `zod`, `get-east-asian-width`, and `yoga-layout`. Core owns the last two; each
binding owns any of the others that remain external in its output.

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

## 7. Verification and release gates

Before publishing:

1. Build and type-check the three public packages and all implementation packages they use.
2. Run their targeted unit tests plus the React/Solid parity tests.
3. Inspect emitted JavaScript: React/Solid may import `@uniview/tui-core`, but no other
   `@uniview/*` package.
4. Inspect emitted declarations under the same rule.
5. Inspect packed manifests: `workspace:*` must be rewritten to the concrete core version,
   framework peers must remain peers, and every emitted third-party import must be declared.
6. Install the three tarballs into clean temporary projects using strict pnpm resolution.
7. Run a React ANSI smoke app, a Solid ANSI smoke app, and a core-only memory-surface test.
8. Confirm each package includes README, license metadata, exports, types, repository metadata,
   and the supported Node engine.

The publication order is `tui-core`, then `tui-react` and `tui-solid`. A failed gate publishes
nothing; the release is retried with a new prerelease version rather than overwriting an npm
version.

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
