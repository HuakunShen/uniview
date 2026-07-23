---
name: uniview-tui
description: Build, run, test, and troubleshoot portable terminal applications with the public Uniview TUI packages. Use when creating or adapting a Node.js, Bun, or Deno terminal UI; selecting direct core, React, or Solid authoring; integrating a real TTY; or migrating a Uniview TUI example into another project.
---

# Uniview TUI

Use `@uniview/tui-core` for the framework-neutral terminal engine. Use a
framework binding only when JSX/hooks are required. Treat terminal ownership and
cleanup as lifecycle-critical in every runtime.

## Choose the public package

| Need | Install |
| --- | --- |
| Direct render tree; minimum dependency surface | `@uniview/tui-core` |
| React JSX and hooks | `@uniview/tui-react` and peer `react` |
| Solid JSX and signals | `@uniview/tui-solid` and peer `solid-js` |

The React and Solid bindings pull `@uniview/tui-core` transitively. Do not add
internal Uniview renderer, host, protocol, content, charts, or style packages to
an application; those are bundled into the public binding artifacts.

Before choosing a binding, check that the intended registry version is public:

```bash
npm view @uniview/tui-react versions --json
npm view @uniview/tui-solid versions --json
```

Fall back to direct core mode when a framework binding is unavailable.

## Install for the runtime

Use the project's package manager. Keep framework peers explicit.

```bash
# Node.js / npm
npm install @uniview/tui-core

# Node.js / pnpm
pnpm add @uniview/tui-core

# Bun
bun add @uniview/tui-core

# Deno 2.8+
deno add @uniview/tui-core
```

For React or Solid, replace the package name and add its peer:

```bash
pnpm add @uniview/tui-react react
pnpm add @uniview/tui-solid solid-js
```

Use `deno add` to record npm packages in `deno.json`; Deno can import npm
packages with an `npm:` specifier, or a bare name once the import map declares
it. Do not add `workspace:*` dependencies outside the Uniview monorepo.

## Start with direct core mode

Read [direct-core.ts](references/direct-core.ts) before writing a small Node or
Bun terminal app. It is the canonical interactive counter copied from the
repository's `examples/tui/core-demo`.

Follow this lifecycle:

1. Make `view(state)` pure: state in, a `RenderNode` tree out.
2. Create exactly one app for one stdin/stdout pair.
3. Call `app.render(view(state))` initially and after state changes only.
4. Route parsed input from `app.onInput()` into state transitions.
5. Call `app.destroy()` before exiting, and do not render after destroy.

Use a real TTY for manual verification. Include `q` and Ctrl-C as escape paths.

## Runtime adapter boundary

### Node.js and Bun

Both expose Node-compatible `process.stdin` and `process.stdout`; pass them
directly to `createTuiApp`. Launch TypeScript with the project's established
tooling: compile with `tsc` then run Node, use its existing TypeScript loader,
or use `bun index.ts` for Bun. Do not add Vite for a terminal-only app.

### Deno

Deno can install the npm package, but `Deno.stdin`/`Deno.stdout` are Web-stream
resources rather than Node EventEmitters. Do **not** pass them directly to
`createTuiApp`.

Read [deno-adapter.md](references/deno-adapter.md) before implementation. Build
a small adapter that supplies the core TTY contract, owns raw-mode restoration,
emits data chunks and resize events, and is tested in a real Deno TTY. Keep the
adapter outside application view/state code.

## Framework binding notes

For React, read [react-counter.tsx](references/react-counter.tsx) after the
binding is installed. It demonstrates `AnsiCellSurface`, `StyleTable`,
`TerminalDriver`, resize forwarding, input dispatch, and deterministic teardown.

For Solid, use the public `/renderer`, `/vite`, and `/jsx-runtime` subpaths.
When using Vite, include the public `univiewSolid()` plugin; it provides the
required browser conditions and `solid-js` deduplication. Do not import internal
renderer packages.

## Verify before handoff

- Type-check with the project's TypeScript command.
- Start in a real TTY; exercise every claimed key and resize once.
- Confirm `q` and Ctrl-C restore the screen, cursor, and raw mode.
- For direct-mode logic, write runtime-independent tests around state and
  `RenderNode` output. Use the runtime's native test runner for runtime glue.
- For a framework app, verify the intended binding and peer resolve to one
  coherent copy, then test at least one interactive state update.

## Guardrails

- Never start two TUI apps on the same terminal streams.
- Never exit before calling the app/root/driver destroy or stop path.
- Keep scrolling, typing, hover, and focus local to the terminal host; do not
  turn them into per-event RPC calls.
- Prefer TypeScript components over new engine primitives for app-specific UI.
- Keep current package availability/version checks outside source control; npm
  registry state changes independently of this skill.
