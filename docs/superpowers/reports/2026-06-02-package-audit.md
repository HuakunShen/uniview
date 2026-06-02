# Package Audit Report

**Date:** 2026-06-02
**Branch:** codex-validation-e2e-audit
**Base Commit:** 40e6637

## Validation Inputs

- `pnpm check-types`: PASS. All active Svelte checks now report 0 errors and 0 warnings.
- `pnpm test`: PASS in an environment that allows local server binding. Protocol, bridge, renderer, runtime, host-sdk, and host-svelte tests are green. The default sandbox can report `EADDRINUSE` for bridge-server tests because those tests start a local WebSocket server.
- `pnpm build`: PASS. Root build now runs `turbo run build` and includes docs.
- `pnpm test:e2e`: PASS. Strict Playwright E2E is 31/31 passing after adding React/Solid benchmark parity across worker and node-server full/incremental modes.
- `pnpm test:e2e:baseline`: PASS. Latest report: `docs/superpowers/reports/2026-06-02-e2e-baseline.md` with 31 passing, 0 failing, 0 skipped, and 0 top-level errors.
- `pnpm test:e2e:cypress`: PASS. Cypress developer-experience E2E is 24/24 passing after the highlight helper was fixed to assert non-empty subjects before click/typing steps and advanced-form flows stopped requiring a transient `Submitting...` state.
- `pnpm exec tsc --noEmit -p cypress/tsconfig.json`: PASS. Cypress support/helpers type-check independently from the root Turbo typecheck.
- `pnpm --filter docs run types:check`: PASS. Fumadocs MDX generation, Next route typegen, and docs TypeScript are valid.
- `pnpm --filter docs build`: PASS. Next 16 Turbopack build previously remained at `Creating an optimized production build ...` for more than 4 minutes; docs now uses `next build --webpack` plus a Webpack replacement for Fumadocs virtual collection imports. Build still emits a non-fatal `metadataBase` warning until the deployment origin is decided.
- E2E runner scripts are TypeScript files executed with Bun. This intentionally differs from the original `.mjs` plan because the user requested TypeScript scripts run by Bun.
- Targeted cleanup verification:
  - `pnpm --filter @uniview/react-runtime check-types`: PASS.
  - `pnpm --filter @uniview/react-runtime test`: PASS.
  - `pnpm --filter @uniview/react-runtime build`: PASS; build now emits `index` and `ws-client`, not `ws-server`.
  - `pnpm --filter @uniview/example-plugin check-types`: PASS.
  - `pnpm --filter @uniview/example-plugin build`: PASS.
  - `pnpm --filter @uniview/host-sdk test`: PASS, 8/8, including initial incremental `setRoot` from an empty mutable tree and nested mutation propagation to the root tree.
  - `pnpm --filter @uniview/react-renderer test`: PASS, 3/3, including initial incremental `setRoot` and keyed list growth mutation emission.
  - `pnpm --filter @uniview/bridge-server test`: PASS, 12/12, when run outside the port-restricted sandbox.
  - `pnpm --filter @uniview/protocol --filter @uniview/host-sdk --filter @uniview/host-svelte --filter @uniview/react-renderer --filter @uniview/react-runtime test`: PASS with `vitest run` and no `--passWithNoTests`.
  - `pnpm --filter @uniview/solid-renderer --filter @uniview/solid-runtime --filter @uniview/tui-renderer test`: PASS with focused package tests and no `--passWithNoTests`.
  - `pnpm --filter @uniview/solid-renderer --filter @uniview/solid-runtime --filter @uniview/tui-renderer check-types`: PASS after removing unused Solid runtime `ws` dev dependencies.

## Decision Labels

- Keep: code is used and covered by validation or required by documented architecture.
- Fix: code is used but has a verified bug or missing coverage.
- Remove: code is unused, product-specific in the wrong layer, stale generated template code, or deprecated without consumers.
- Investigate: code may be valid but needs one focused test or usage trace before changing.

## Workspace Package Coverage

`pnpm -r list --depth -1` now reports the root plus 18 real workspaces. The removed `apps/*` glob no longer adds a ghost workspace pattern.

| Workspace                           | Decision    | Evidence / Action                                                                                        |
| ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `docs`                              | Keep        | Root build includes docs; docs typecheck/build pass with Webpack/Fumadocs compatibility shim.            |
| `@uniview/bridge-server`            | Keep        | Bridge tests pass outside the port-restricted sandbox; node-server E2E validates bridge forwarding.      |
| `@uniview/example-host-react`       | Keep        | React host worker/main-thread/node-server simple and advanced E2E pass; build/check-types pass.          |
| `@uniview/example-host-svelte`      | Keep        | Broadest E2E matrix passes, including React/Solid benchmark full/incremental parity.                     |
| `@uniview/example-host-vue`         | Keep        | Vue host worker/main-thread/node-server simple and advanced E2E pass; build/check-types pass.            |
| `@uniview/example-plugin-api`       | Keep        | Shared React demo components build/typecheck and are exercised through the React plugin example.         |
| `@uniview/example-plugin`           | Keep        | Canonical React plugin fixture; deprecated `.server.ts` entries and `server:*` scripts removed.          |
| `@uniview/example-solid-plugin-api` | Keep        | Shared Solid demo components build/typecheck and are exercised through the Solid plugin example.         |
| `@uniview/plugin-solid-example`     | Keep        | Solid worker/node-server E2E pass; build script now uses typed Bun plugin configuration.                 |
| `@uniview/tui-demo`                 | Investigate | TUI demo remains paired with `tui-renderer`; keep until the long-term TUI scope decision is made.        |
| `@uniview/host-sdk`                 | Keep        | Unit tests cover controller-adjacent contracts and `MutableTree`, including nested mutation propagation. |
| `@uniview/host-svelte`              | Keep        | Export tests, Svelte check, and Svelte host E2E pass with 0 current Svelte warnings.                     |
| `@uniview/protocol`                 | Keep        | Protocol tests cover RPC contract drift, versioning, UINode validation, and event handler prop helpers.  |
| `@uniview/react-renderer`           | Keep        | Renderer tests cover initial incremental root emission and keyed list growth mutation emission.          |
| `@uniview/react-runtime`            | Keep        | Worker/main/thread bridge-client paths pass contract tests and E2E; plugin-as-server export removed.     |
| `@uniview/solid-renderer`           | Keep        | Serialization and mutation collector tests added; Solid E2E covers browser and bridge paths.             |
| `@uniview/solid-runtime`            | Keep        | Public entry-point tests added; unused server-only `ws` dev dependencies removed.                        |
| `@uniview/tui-renderer`             | Investigate | Focused primitive tests added; product-level integration remains a P2 scope decision.                    |

## Required Conclusions

1. Passing scenarios by host:

| Host   | Passing scenarios                                                                                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Svelte | React plugin worker/main-thread/node-server simple and advanced; Solid plugin worker/node-server simple and advanced; Solid main-thread mode disabled by design; React/Solid benchmark worker/node-server full and incremental updates. |
| React  | React plugin worker/main-thread/node-server simple and advanced.                                                                                                                                                                        |
| Vue    | React plugin worker/main-thread/node-server simple and advanced.                                                                                                                                                                        |

2. Failing scenarios: none. The latest E2E baseline has 31 passing, 0 failing, 0 skipped, and 0 top-level errors. During E2E harness bring-up, the issues fixed were harness reliability problems rather than validated host/plugin/runtime failures: stale assertions for advanced form values, Vite arg forwarding, fixed-port bridge tests, parallel E2E workers sharing bridge plugin IDs, Cypress visual-highlight callbacks allowing empty subjects through to `.click()`, and transient `Submitting...` assertions that could miss a short-lived state. The pre-fix validation failures are preserved separately in `docs/superpowers/reports/2026-06-02-pre-fix-validation-baseline.md`.

3. Incremental update mode is covered enough to keep enabled in demos. Current evidence is React/Solid benchmark parity across worker and node-server full/incremental modes, `MutableTree` unit tests for initial `setRoot` and nested mutation propagation, and React renderer tests for initial `setRoot` plus keyed list growth mutations. Do not delete fallback/full render paths or change handler cleanup semantics until stale-handler/leak coverage exists.

4. Stale generated tests/configs replaced and test scripts tightened:

- Protocol and host-sdk template `fn()` tests were replaced with protocol and registry tests.
- React runtime now has protocol contract tests.
- React renderer stale browser component test/config was replaced with node renderer coverage, including initial incremental `setRoot` emission and keyed list growth mutations.
- Host Svelte stale browser component test/config was replaced with export smoke coverage.
- Solid renderer now has focused serialization and mutation collector tests.
- Solid runtime now has public entry-point contract coverage.
- TUI renderer now has terminal primitive element contract coverage.
- Packages with real tests now use deterministic `vitest run`: `protocol`, `host-sdk`, `host-svelte`, `react-renderer`, `react-runtime`, `solid-renderer`, `solid-runtime`, and `tui-renderer`.

5. Deprecated paths removed:

- Removed `@uniview/react-runtime/ws-server` from `packages/react-runtime/package.json` exports and `tsdown.config.ts`.
- Deleted `packages/react-runtime/src/ws-server-entry.ts`.
- Deleted `examples/plugin-example/src/simple-demo.server.ts` and `examples/plugin-example/src/advanced-demo.server.ts`.
- Removed `server:*` scripts and server-only `ws` dependencies from `examples/plugin-example`.
- Removed unused `ws` and `@types/ws` dev dependencies from `solid-runtime`; the bridge client uses the runtime `WebSocket` global and still type-checks.
- Removed docs snippets that advertised the old plugin-as-server path, including the stale `startWSServerPlugin` name that did not match the actual export.
- Removed the unused `apps/*` workspace glob from `pnpm-workspace.yaml`.
- Updated the root `AGENTS.md` knowledge base so future work points to `./ws-client` bridge mode instead of deleted plugin-as-server exports.

6. Code that appears unused but should not be removed without a separate test:

- `packages/tui-renderer` and `examples/tui-demo`, because they are separate package scope and not part of the browser E2E matrix.
- Playground `MyButton` examples, because they are local playground fixtures rather than stale test code.
- Benchmark incremental clients and stats paths, because benchmark parity tests depend on the benchmark surface.

7. Highest hidden-drift risk: handler lifecycle in incremental mode. Full render paths and benchmark incremental update paths are covered by E2E, but stale-handler cleanup still needs focused tests in React and Solid renderers before aggressive registry cleanup.

## Review Follow-Up Notes

| Item                                                         | Decision | Rationale                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun TypeScript E2E scripts instead of Node `.mjs`            | Keep     | This is an intentional user-requested change. `scripts/run-e2e.ts`, `scripts/run-e2e-baseline.ts`, and `scripts/write-e2e-baseline.ts` are the current supported entry points.                                                    |
| Extra strict runner `scripts/run-e2e.ts`                     | Keep     | Root `test:e2e` needs a strict counterpart to the baseline runner so Playwright failures fail the command.                                                                                                                        |
| Playwright `workers: 1`                                      | Keep     | The bridge has one active host connection per plugin ID. Parallel workers can make scenarios replace each other's host connection and create false flakes.                                                                        |
| No `--` separator before host Vite args in `global-setup.ts` | Keep     | Current `pnpm --filter <pkg> run <script> --host ...` invocation is verified by E2E logs and passes args to Vite correctly. An extra separator was avoided because it previously made readiness unreliable in this harness.       |
| Bridge test dynamic port                                     | Fix      | PID-derived candidate ports could still collide, and the sandbox reports local server binding as `EADDRINUSE`; tests now use a random ephemeral-range port and should run in an environment that permits local WebSocket servers. |
| Cypress visual highlight helper                              | Fix      | `.should(callback)` was doing only side effects, so a transient empty jQuery subject could continue to `.click()` during visual runs; the helper now asserts a non-empty subject before styling.                                  |
| Advanced-form transient submitting assertion                 | Fix      | `Submitting...` is an intermediate UI state, not the stable contract. Playwright baseline could miss it while final success still rendered; both Playwright and Cypress now assert the stable submitted result and field values.  |
| MutableTree nested mutation propagation                      | Fix      | React incremental benchmark E2E caught nested item-count/list updates not reaching the Svelte host. `MutableTree.replaceNodeInTree()` now returns updated subtrees and reattaches them through every ancestor.                    |
| Solid build script `Bun.BunPlugin` typing                    | Keep     | Removes `as any` while preserving the Bun TypeScript build flow.                                                                                                                                                                  |
| Svelte debug-log removal and `untrack` wrapping              | Keep     | Removes noisy demo logs and resolves Svelte 5 `state_referenced_locally` warnings without changing E2E behavior.                                                                                                                  |
| `docs/app/layout.tsx` font change                            | Keep     | Removes network-bound Google font fetching from docs build attempts. Docs typecheck and production build now pass without a remote font dependency.                                                                               |
| Docs Fumadocs virtual collection bundling                    | Fix      | Next 16 Turbopack hung during production build and Webpack initially rejected the `fumadocs-mdx:collections/*` scheme. Docs now uses `next build --webpack` and maps those virtual requests to generated `.source/*.ts` files.    |

## Package Findings

### `packages/protocol`

| Area                | Decision    | Evidence                                                                                                       | Action                                                          |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| RPC contract        | Keep        | `updateItem` removed; runtime implementations now match `HostToPluginAPI`; contract test asserts it stays out. | Keep protocol generic.                                          |
| Protocol versioning | Keep        | `PROTOCOL_VERSION` is 2 and runtimes reject mismatch during initialize.                                        | Bump again only for breaking RPC changes.                       |
| Validators          | Investigate | Protocol tests cover core UINode and JSON behavior.                                                            | Add mutation schema tests when mutation validation is expanded. |
| Event helpers       | Keep        | E2E validates click/input/change flows across hosts.                                                           | Keep handler-id prop mapping.                                   |

### `packages/react-renderer`

| Area                       | Decision    | Evidence                                                                                                           | Action                                                |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Serialization              | Keep        | Renderer unit test and E2E confirm text children and handler IDs render through hosts.                             | Keep current serializer shape.                        |
| Host config lifecycle      | Keep        | Full render is covered by E2E; incremental renderer tests cover initial `setRoot` and keyed list growth mutations. | Keep current mutation emission shape.                 |
| Handler registry lifecycle | Investigate | Advanced E2E proves current handler execution works.                                                               | Add stale-handler/leak tests before changing cleanup. |

### `packages/react-runtime`

| Area                               | Decision | Evidence                                                                                                                            | Action                                                                                                       |
| ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Worker runtime                     | Keep     | React worker scenarios pass in Svelte, React, and Vue hosts; Svelte benchmark covers full and incremental worker updates.           | Keep enabled.                                                                                                |
| WebSocket client runtime           | Keep     | React node-server scenarios pass in Svelte, React, and Vue hosts; Svelte benchmark covers full and incremental node-server updates. | Keep bridge-client path.                                                                                     |
| Main-thread runtime                | Keep     | React main-thread scenarios pass in all supported browser hosts.                                                                    | Keep as dev mode.                                                                                            |
| Deprecated WebSocket server export | Remove   | The project standard is bridge-client mode; AGENTS forbids server entry points; docs had stale `startWSServerPlugin` drift.         | Removed `./ws-server` export, source entry, first-party `.server.ts` examples, scripts, and docs references. |

### `packages/solid-renderer`

| Area                  | Decision    | Evidence                                                                                                                                                       | Action                                                                    |
| --------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Serialization         | Keep        | Solid worker/node simple and advanced demos pass in Svelte host; renderer tests cover handler-ID serialization; benchmark E2E covers full/incremental updates. | Keep as canonical Solid renderer fixture.                                 |
| Global renderer state | Investigate | E2E uses one process per plugin client.                                                                                                                        | Add multi-plugin same-process test before refactor.                       |
| Mutation collector    | Keep        | Focused renderer tests cover serialized append and set-props mutations.                                                                                        | Add full/incremental comparison tests before changing mutation semantics. |

### `packages/solid-runtime`

| Area                     | Decision              | Evidence                                                                                           | Action                                                          |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Worker runtime           | Keep                  | Solid worker scenarios pass in Svelte host, including full and incremental benchmark updates.      | Keep enabled.                                                   |
| WebSocket client runtime | Keep                  | Solid node-server scenarios pass in Svelte host, including full and incremental benchmark updates. | Keep bridge-client path.                                        |
| Main-thread runtime      | Keep disabled in demo | E2E verifies Svelte host disables Solid main-thread mode.                                          | Re-enable only with a dedicated browser runtime implementation. |
| Package dependencies     | Keep                  | `check-types` passes without `ws` and `@types/ws`; source uses the runtime `WebSocket` global.     | Keep unused server-only dev dependencies removed.               |
| Prop update behavior     | Investigate           | No E2E host currently drives Solid prop updates.                                                   | Add focused test before changing reset semantics.               |

### `packages/host-sdk`

| Area                   | Decision | Evidence                                                                                                                                             | Action                                                                              |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Worker controller      | Keep     | Worker E2E passes across hosts.                                                                                                                      | Keep current Worker setup.                                                          |
| WebSocket controller   | Keep     | Node-server E2E passes; temporary debug logs removed.                                                                                                | Keep error logging and plugin log forwarding.                                       |
| Main-thread controller | Keep     | Main-thread E2E passes for React plugins.                                                                                                            | Document React-specific dev-mode constraint later.                                  |
| MutableTree            | Keep     | `mutable-tree.test.ts` covers insert/update/remove paths, initial incremental `setRoot` from an empty tree, and nested mutation propagation to root. | Keep immutable reattachment behavior; extend tests before broad mutation refactors. |

### `packages/host-svelte`

| Area                     | Decision    | Evidence                                                                                         | Action                                  |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------ | --------------------------------------- |
| PluginHost lifecycle     | Keep        | Mode-switching E2E passes; `svelte-check` has 0 warnings after explicit initial context capture. | Keep lifecycle shape.                   |
| ComponentRenderer events | Keep        | Simple counter and advanced form E2E pass.                                                       | Keep event extraction behavior.         |
| Text children rendering  | Keep        | Svelte host simple and custom component assertions pass.                                         | Keep string-node handling.              |
| Unknown node handling    | Investigate | Fallback is useful for debugging but not directly covered.                                       | Add small adapter test before changing. |

### `packages/tui-renderer`

| Area          | Decision    | Evidence                                                                                  | Action                                                                            |
| ------------- | ----------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Package scope | Investigate | Package builds and has focused terminal primitive tests, but it is not in browser E2E.    | Keep until a TUI scope decision is made.                                          |
| Tests         | Keep        | `pnpm test` now runs meaningful TUI primitive contract tests without `--passWithNoTests`. | Add integration-style TUI tests only if the package becomes active product scope. |

### `examples/*`

| Area                             | Decision | Evidence                                                                                                              | Action                                               |
| -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Svelte host demo                 | Keep     | Broadest E2E matrix passes, including benchmark full/incremental parity for React and Solid worker/node-server modes. | Treat as primary integration surface.                |
| React host demo                  | Keep     | React host parity scenarios pass.                                                                                     | Keep as parity fixture.                              |
| Vue host demo                    | Keep     | Vue host parity scenarios pass.                                                                                       | Keep as parity fixture.                              |
| React plugin example             | Keep     | Worker/main/node E2E scenarios pass.                                                                                  | Keep canonical React plugin fixture.                 |
| Solid plugin example             | Keep     | Solid worker/node scenarios pass; build script now uses typed `Bun.BunPlugin`.                                        | Keep canonical Solid plugin fixture.                 |
| Bridge server                    | Keep     | Bun bridge tests and node-server E2E pass.                                                                            | Keep bridge architecture.                            |
| Deprecated React server examples | Remove   | `examples/plugin-example/AGENTS.md` forbids `*.server.ts`; bridge client entries are covered by node-server E2E.      | Deleted `.server.ts` entries and `server:*` scripts. |
| Svelte UI wrappers               | Keep     | Debug logs removed; Svelte checks and E2E pass.                                                                       | Keep current controlled/uncontrolled input behavior. |

### `docs`

| Area                     | Decision    | Evidence                                                                                                                             | Action                                                                                       |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Root build participation | Keep        | Root `pnpm build` includes docs and docs production build passes through the Webpack/Fumadocs virtual collection compatibility shim. | Keep docs in root build; revisit Turbopack only after Fumadocs/Next support can be retested. |
| Validation scope         | Investigate | Docs typecheck and production build pass, but docs is not covered by browser E2E.                                                    | Add docs browser validation only if docs becomes part of the supported runtime UX surface.   |
| Metadata origin          | Investigate | Production build emits a non-fatal `metadataBase` warning because the deployment origin is not encoded in config.                    | Set `metadataBase` once the final docs deployment URL is chosen.                             |

## Cleanup Backlog

| Priority | Item                                   | Evidence                                                                                             | Proposed Task                                                     |
| -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P0       | None                                   | Latest strict and baseline Playwright E2E are 31/31 passing; Cypress E2E is 24/24 passing.           | No immediate bugfix task.                                         |
| P2       | Add handler lifecycle leak coverage    | Incremental handler registry keeps stale handler IDs by design until lifecycle semantics are tested. | Add stale-handler cleanup tests before changing registry cleanup. |
| P2       | Set docs `metadataBase`                | Docs production build passes but warns because the final deployment origin is not configured.        | Set the docs origin after deployment target is decided.           |
| P2       | Decide long-term TUI package scope     | TUI renderer has unit coverage but no product-level integration path.                                | Keep, document, or remove TUI as a separate roadmap decision.     |
| P2       | Reduce remaining operational log noise | Bridge/plugin clients still log lifecycle events during E2E.                                         | Add quiet mode env for E2E if logs become hard to read.           |

## Handoff Summary

### Stable Commands

- `pnpm check-types`
- `pnpm test`
- `pnpm build`
- `pnpm --filter docs run types:check`
- `pnpm --filter docs build`
- `pnpm test:e2e:baseline`
- `pnpm test:e2e:cypress`

### Strict Command

- `pnpm test:e2e`

### Known Failing Functional Scenarios

- None

### Recommended Next Fix Order

- P2: Add handler lifecycle leak coverage.
- P2: Set docs `metadataBase` when the deployment origin is known.
- P2: Decide long-term TUI package scope.
