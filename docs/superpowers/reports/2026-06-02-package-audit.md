# Package Audit Report

**Date:** 2026-06-02
**Branch:** codex-validation-e2e-audit
**Commit:** d5bb22e

## Validation Inputs

- `pnpm check-types`: PASS. All active Svelte checks now report 0 errors and 0 warnings.
- `pnpm test`: PASS. Protocol, bridge, renderer, runtime, host-sdk, and host-svelte tests are green.
- `pnpm build`: PASS. Root build intentionally runs `turbo run build --filter=!docs`.
- `pnpm test:e2e`: PASS. Strict Playwright E2E is 24/24 passing.
- `pnpm test:e2e:baseline`: PASS. Latest report: `docs/superpowers/reports/2026-06-02-e2e-baseline.md`.
- E2E runner scripts are TypeScript files executed with Bun. This intentionally differs from the original `.mjs` plan because the user requested TypeScript scripts run by Bun.

## Decision Labels

- Keep: code is used and covered by validation or required by documented architecture.
- Fix: code is used but has a verified bug or missing coverage.
- Remove: code is unused, product-specific in the wrong layer, stale generated template code, or deprecated without consumers.
- Investigate: code may be valid but needs one focused test or usage trace before changing.

## Required Conclusions

1. Passing scenarios by host:

| Host   | Passing scenarios                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Svelte | React plugin worker/main-thread/node-server simple and advanced; Solid plugin worker/node-server simple and advanced; Solid main-thread mode disabled by design; benchmark smoke renders and responds. |
| React  | React plugin worker/main-thread/node-server simple and advanced.                                                                                                                                       |
| Vue    | React plugin worker/main-thread/node-server simple and advanced.                                                                                                                                       |

2. Failing scenarios: none. The latest E2E baseline has 24 passing, 0 failing, 0 skipped, and 0 top-level errors. During E2E harness bring-up, the issues fixed were harness reliability problems rather than validated host/plugin/runtime failures: stale assertions for advanced form values, Vite arg forwarding, fixed-port bridge tests, and parallel E2E workers sharing bridge plugin IDs. The pre-fix validation failures are preserved separately in `docs/superpowers/reports/2026-06-02-pre-fix-validation-baseline.md`.

3. Incremental update mode is safe enough to keep enabled in demos, but not yet safe enough to treat as fully covered. Current evidence is benchmark smoke, `MutableTree` unit tests, and a React renderer test that initial incremental render emits a `setRoot` mutation. Add a focused full/incremental E2E comparison before deleting fallback/full render paths or changing handler cleanup semantics.

4. Stale generated tests/configs replaced:

- Protocol and host-sdk template `fn()` tests were replaced with protocol and registry tests.
- React runtime now has protocol contract tests.
- React renderer stale browser component test/config was replaced with node renderer coverage, including initial incremental `setRoot` emission.
- Host Svelte stale browser component test/config was replaced with export smoke coverage.
- Package test scripts now use deterministic `vitest run --passWithNoTests`.

5. Deprecated paths still exported or scripted:

- `@uniview/react-runtime/ws-server` remains exported through `packages/react-runtime/package.json`.
- `packages/react-runtime/src/ws-server-entry.ts` remains marked deprecated.
- `examples/plugin-example/src/simple-demo.server.ts`, `examples/plugin-example/src/advanced-demo.server.ts`, and `server:*` scripts still consume the deprecated server mode.

6. Code that appears unused but should not be removed without a separate test:

- Deprecated `ws-server` path, because first-party server examples still import it.
- `packages/tui-renderer` and `examples/tui-demo`, because they are separate package scope and not part of the browser E2E matrix.
- Playground `MyButton` examples, because they are local playground fixtures rather than stale test code.
- Benchmark incremental clients and stats paths, because benchmark smoke depends on the benchmark surface.

7. Highest hidden-drift risk: renderer/runtime incremental updates and handler lifecycle. Full render paths are broadly covered by E2E, but incremental mutation/handler cleanup still needs focused tests in React and Solid renderers before aggressive cleanup.

## Review Follow-Up Notes

| Item                                                         | Decision | Rationale                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun TypeScript E2E scripts instead of Node `.mjs`            | Keep     | This is an intentional user-requested change. `scripts/run-e2e.ts`, `scripts/run-e2e-baseline.ts`, and `scripts/write-e2e-baseline.ts` are the current supported entry points.                                              |
| Extra strict runner `scripts/run-e2e.ts`                     | Keep     | Root `test:e2e` needs a strict counterpart to the baseline runner so Playwright failures fail the command.                                                                                                                  |
| Playwright `workers: 1`                                      | Keep     | The bridge has one active host connection per plugin ID. Parallel workers can make scenarios replace each other's host connection and create false flakes.                                                                  |
| No `--` separator before host Vite args in `global-setup.ts` | Keep     | Current `pnpm --filter <pkg> run <script> --host ...` invocation is verified by E2E logs and passes args to Vite correctly. An extra separator was avoided because it previously made readiness unreliable in this harness. |
| Bridge test dynamic port list                                | Keep     | This removes fixed-port collisions and makes bridge tests deterministic in repeated local runs.                                                                                                                             |
| Solid build script `Bun.BunPlugin` typing                    | Keep     | Removes `as any` while preserving the Bun TypeScript build flow.                                                                                                                                                            |
| Svelte debug-log removal and `untrack` wrapping              | Keep     | Removes noisy demo logs and resolves Svelte 5 `state_referenced_locally` warnings without changing E2E behavior.                                                                                                            |
| `docs/app/layout.tsx` font change                            | Keep     | Removes network-bound Google font fetching from docs build attempts. Docs still remain a separate follow-up before rejoining root build.                                                                                    |

## Package Findings

### `packages/protocol`

| Area                | Decision    | Evidence                                                                                                       | Action                                                          |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| RPC contract        | Keep        | `updateItem` removed; runtime implementations now match `HostToPluginAPI`; contract test asserts it stays out. | Keep protocol generic.                                          |
| Protocol versioning | Keep        | `PROTOCOL_VERSION` is 2 and runtimes reject mismatch during initialize.                                        | Bump again only for breaking RPC changes.                       |
| Validators          | Investigate | Protocol tests cover core UINode and JSON behavior.                                                            | Add mutation schema tests when mutation validation is expanded. |
| Event helpers       | Keep        | E2E validates click/input/change flows across hosts.                                                           | Keep handler-id prop mapping.                                   |

### `packages/react-renderer`

| Area                       | Decision    | Evidence                                                                               | Action                                                |
| -------------------------- | ----------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Serialization              | Keep        | Renderer unit test and E2E confirm text children and handler IDs render through hosts. | Keep current serializer shape.                        |
| Host config lifecycle      | Investigate | Full render is covered; incremental behavior only has benchmark smoke.                 | Add focused mutation collector tests.                 |
| Handler registry lifecycle | Investigate | Advanced E2E proves current handler execution works.                                   | Add stale-handler/leak tests before changing cleanup. |

### `packages/react-runtime`

| Area                               | Decision    | Evidence                                                          | Action                                         |
| ---------------------------------- | ----------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Worker runtime                     | Keep        | React worker scenarios pass in Svelte, React, and Vue hosts.      | Keep enabled.                                  |
| WebSocket client runtime           | Keep        | React node-server scenarios pass in Svelte, React, and Vue hosts. | Keep bridge-client path.                       |
| Main-thread runtime                | Keep        | React main-thread scenarios pass in all supported browser hosts.  | Keep as dev mode.                              |
| Deprecated WebSocket server export | Investigate | Deprecated export and first-party server examples still exist.    | Decide removal in a separate deprecation task. |

### `packages/solid-renderer`

| Area                  | Decision    | Evidence                                                         | Action                                              |
| --------------------- | ----------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| Serialization         | Keep        | Solid worker/node simple and advanced demos pass in Svelte host. | Keep as canonical Solid renderer fixture.           |
| Global renderer state | Investigate | E2E uses one process per plugin client.                          | Add multi-plugin same-process test before refactor. |
| Mutation collector    | Investigate | Benchmark smoke covers rendering, not full mutation parity.      | Add full/incremental comparison tests.              |

### `packages/solid-runtime`

| Area                     | Decision              | Evidence                                                  | Action                                                          |
| ------------------------ | --------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Worker runtime           | Keep                  | Solid worker scenarios pass in Svelte host.               | Keep enabled.                                                   |
| WebSocket client runtime | Keep                  | Solid node-server scenarios pass in Svelte host.          | Keep bridge-client path.                                        |
| Main-thread runtime      | Keep disabled in demo | E2E verifies Svelte host disables Solid main-thread mode. | Re-enable only with a dedicated browser runtime implementation. |
| Prop update behavior     | Investigate           | No E2E host currently drives Solid prop updates.          | Add focused test before changing reset semantics.               |

### `packages/host-sdk`

| Area                   | Decision | Evidence                                                                           | Action                                             |
| ---------------------- | -------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Worker controller      | Keep     | Worker E2E passes across hosts.                                                    | Keep current Worker setup.                         |
| WebSocket controller   | Keep     | Node-server E2E passes; temporary debug logs removed.                              | Keep error logging and plugin log forwarding.      |
| Main-thread controller | Keep     | Main-thread E2E passes for React plugins.                                          | Document React-specific dev-mode constraint later. |
| MutableTree            | Keep     | `mutable-tree.test.ts` covers insert/update/remove paths used by incremental mode. | Extend tests before broad mutation refactors.      |

### `packages/host-svelte`

| Area                     | Decision    | Evidence                                                                                         | Action                                  |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------ | --------------------------------------- |
| PluginHost lifecycle     | Keep        | Mode-switching E2E passes; `svelte-check` has 0 warnings after explicit initial context capture. | Keep lifecycle shape.                   |
| ComponentRenderer events | Keep        | Simple counter and advanced form E2E pass.                                                       | Keep event extraction behavior.         |
| Text children rendering  | Keep        | Svelte host simple and custom component assertions pass.                                         | Keep string-node handling.              |
| Unknown node handling    | Investigate | Fallback is useful for debugging but not directly covered.                                       | Add small adapter test before changing. |

### `packages/tui-renderer`

| Area          | Decision    | Evidence                                                                              | Action                                                    |
| ------------- | ----------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Package scope | Investigate | Package builds and deterministic no-test script passes, but it is not in browser E2E. | Keep until a TUI scope decision is made.                  |
| Tests         | Fix         | Current `pnpm test` passes through `--passWithNoTests`, not meaningful assertions.    | Add focused TUI renderer tests if package remains active. |

### `examples/*`

| Area                             | Decision    | Evidence                                                                       | Action                                               |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Svelte host demo                 | Keep        | Broadest E2E matrix passes.                                                    | Treat as primary integration surface.                |
| React host demo                  | Keep        | React host parity scenarios pass.                                              | Keep as parity fixture.                              |
| Vue host demo                    | Keep        | Vue host parity scenarios pass.                                                | Keep as parity fixture.                              |
| React plugin example             | Keep        | Worker/main/node E2E scenarios pass.                                           | Keep canonical React plugin fixture.                 |
| Solid plugin example             | Keep        | Solid worker/node scenarios pass; build script now uses typed `Bun.BunPlugin`. | Keep canonical Solid plugin fixture.                 |
| Bridge server                    | Keep        | Bun bridge tests and node-server E2E pass.                                     | Keep bridge architecture.                            |
| Deprecated React server examples | Investigate | First-party scripts still import `@uniview/react-runtime/ws-server`.           | Decide deprecation/removal separately.               |
| Svelte UI wrappers               | Keep        | Debug logs removed; Svelte checks and E2E pass.                                | Keep current controlled/uncontrolled input behavior. |

### `docs`

| Area                     | Decision    | Evidence                                                                                               | Action                                                                |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Root build participation | Investigate | Root `pnpm build` excludes docs; `docs/app/layout.tsx` no longer depends on Google font network fetch. | Fix docs build separately before adding docs back to root build.      |
| Validation scope         | Investigate | Docs is not covered by browser E2E.                                                                    | Add docs validation only after Fumadocs/Next build issue is resolved. |

## Cleanup Backlog

| Priority | Item                                                              | Evidence                                                                        | Proposed Task                                                         |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P0       | None                                                              | Latest strict and baseline E2E are 24/24 passing.                               | No immediate bugfix task.                                             |
| P1       | Add full/incremental parity coverage                              | Current evidence is benchmark smoke plus MutableTree unit tests.                | Add React and Solid incremental E2E or renderer-level mutation tests. |
| P1       | Decide deprecated `ws-server` lifecycle                           | Deprecated export and first-party server scripts still exist.                   | Create deprecation/removal plan after consumer search.                |
| P1       | Add meaningful tests for packages currently passing with no tests | `solid-renderer`, `solid-runtime`, and `tui-renderer` use `--passWithNoTests`.  | Add focused package tests around protocol boundaries.                 |
| P1       | Re-admit docs to root build                                       | Root build excludes docs because the docs app still needs a separate build fix. | Fix Fumadocs/Next build issue and remove `--filter=!docs`.            |
| P2       | Reduce remaining operational log noise                            | Bridge/plugin clients still log lifecycle events during E2E.                    | Add quiet mode env for E2E if logs become hard to read.               |

## Handoff Summary

### Stable Commands

- `pnpm check-types`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e:baseline`

### Strict Command

- `pnpm test:e2e`

### Known Failing Functional Scenarios

- None

### Recommended Next Fix Order

- P1: Add full/incremental parity coverage.
- P1: Decide deprecated `ws-server` lifecycle.
- P1: Add meaningful tests for packages currently passing with no tests.
- P1: Re-admit docs to root build.
