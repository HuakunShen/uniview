# Final review 16 fix report

## Result

- Status: `DONE_WITH_CONCERNS`
- Base: `a86d31c72bbdab4ac3702c55b742f55367a2bfe8`
- Commit: recorded in the final handoff after the scoped commit is created
- Registry boundary: no publish command, registry-facing dry-run, `npm whoami`, `npm view`, or
  other npm registry request was run.

## Implemented findings

1. `univiewSolid()` now returns `resolve.dedupe: ["solid-js"]`, and its structural Vite plugin
   type exposes `dedupe: string[]`. The focused Vite unit test pins the exact value.
2. The durable root `test:tui-vite5-solid` command runs the real Vite 5.4.21 2048 and lazygit
   Solid examples. `verify:tui-packages` runs it after the existing ten-package unit/parity gate
   and before release builds, so packing and publication orchestration inherit the reactivity
   proof. The lazygit suite asserts Vite 5.4.21 and verifies signal-driven repaint without an
   explicit rerender call.
3. The CI step and release workflow contract test make the Vite 5 pre-build gate visible and
   mandatory. The Vite 8.1.5 packed-consumer signal smoke remains unchanged, so both documented
   compatibility endpoints are exercised.
4. The canonical design, implementation plan, npm-facing Solid README, public Solid guide, and
   repository release documentation describe Solid deduplication and the two endpoint gates.
5. Artifact wording now promises one immutable deterministic identity within a prepared run. It
   explicitly does not promise byte-identical `.tgz` output across independent `pnpm pack`
   invocations.

## TDD evidence

### RED

- Untouched two-example command:
  `pnpm --filter @uniview/tui-2048-solid --filter @uniview/tui-lazygit-solid test` emitted
  “You appear to have multiple instances of Solid.” The lazygit suite finished with 3 failures
  and 1 pass; the first reactive assertion expected a green Files border and received `null`,
  while the leaked root caused the next two tests to reject ownership.
- Focused untouched lazygit regression:
  `pnpm --filter @uniview/tui-lazygit-solid exec vitest run tests/app.test.tsx -t "focuses a panel by digit key"`
  failed 1 test with `expected null to be 'green'` and skipped 3.
- New helper assertion: focused `packages/tui-solid/tests/vite.test.ts` failed 1 of 3 because
  `config.resolve.dedupe` was `undefined`.
- New release-gate assertion: `scripts/tui-release-workflow.test.mjs` failed 1 of 5 because
  `test:tui-vite5-solid` did not exist.

### GREEN

- Focused helper unit: 3/3 passed.
- Focused lazygit digit-key reactivity: 1 passed, 3 skipped; no duplicate-Solid warning.
- Mandatory `pnpm test:tui-vite5-solid`: 39/39 passed — 34 in 2048 and 5 in lazygit, including
  the exact Vite 5.4.21 assertion and reactive repaint.
- `pnpm verify:tui-packages`: passed with 993/993 tests across the ten release-relevant packages,
  39/39 Vite 5 example tests, all ten release builds and type checks, 73/73 release-tool,
  descriptor, workflow, publisher, and boundary unit tests, plus the emitted package-boundary
  scan.
- Full root `pnpm test`: passed with localhost binding permitted. A concise underlying Turbo
  rerun reported 55/55 tasks successful across 48 packages.
- `pnpm --dir docs types:check`: passed.
- `pnpm --dir docs build`: passed and generated 51/51 static pages.
- Selected Prettier check, `git diff --check`, package JSON parse, CI YAML parse, unchanged
  `pnpm-lock.yaml`, no-suppression scan, and artifact-ignore checks all passed.

## Persistent artifact

- Descriptor:
  `/Volumes/Portable2TB/ExtDev/uniview/.tui-release/run-4Au2qy/tui-tarballs.json`
- Descriptor SHA-256: `5f1095f6b023f80566a94173d014f9384698caeb28c06c10c226fada6dcfa0f5`
- Core tarball SHA-256: `86028008c2bbd2c95d92804f3b87c7f1a063e5fb997af8fb93dcc8082bd0d90a`
- React tarball SHA-256: `77d7dc40f1587241dba13b46fe7ff549d85b25b92f40f531071b269f993b3582`
- Solid tarball SHA-256: `73511ad7a22b62d8e5ebcd74d7e06cf5673ef8e64e18ecc4399fe3f66906fb8b`
- Reuse: normal and production-only packed smoke passed on Node v25.2.1 using the exact descriptor
  above, including core, React, Solid, public subpaths, and the supported current Vite/vite-node
  signal smoke.

The run is intentionally preserved and ignored. It is fresh for this review and does not reuse
`.tui-release/run-CpKANZ`. No package was published.

## Scoped files

- `.github/workflows/ci.yml`
- `README.md`
- `package.json`
- `packages/tui-solid/src/vite.ts`
- `packages/tui-solid/tests/vite.test.ts`
- `packages/tui-solid/README.md`
- `examples/tui/lazygit-solid/tests/app.test.tsx`
- `scripts/tui-release-workflow.test.mjs`
- `docs/content/docs/tui/solid.mdx`
- `docs/superpowers/specs/2026-07-22-tui-npm-package-boundaries-design.md`
- `docs/superpowers/plans/2026-07-22-tui-npm-package-boundaries.md`
- `.superpowers/sdd/final-review-16-fix-report.md`

## Concerns and bounded omissions

- The local runtime is Node v25.2.1, which is accepted by Vite/vite-node but intentionally does
  not satisfy the private release-tool engine `^24.15.0 || >=26.0.0`; pnpm printed engine
  warnings. The Node 24 CI builder and Node 18/20/24 artifact matrix were not reproduced locally.
- The first sandboxed root test attempt could not bind Bun's ephemeral localhost port. The
  unchanged bridge suite passed 6/6 outside the network sandbox, and the full root suite then
  passed with localhost binding enabled.
- The final docs build retained the existing missing-`metadataBase` warning; an earlier build also
  emitted the known webpack dynamic-import cache warning. Compilation, TypeScript, and all 51
  static pages completed.
- Cross-run tarball byte equality is deliberately outside the contract. The prepared run's
  descriptor and hashes protect the exact bytes reused by smoke and publication.
