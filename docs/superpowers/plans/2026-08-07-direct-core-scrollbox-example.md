# Direct-Core Scrollbox Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add correct bounded scrolling to Uniview's direct-core TUI path, demonstrate it with a Space Lens example, publish the TUI packages, and update `space-lens` to the published version.

**Architecture:** The custom layout engine will opt into explicit negative free-space distribution through `flexShrink`. The paint pipeline will use a controlled `scrollTop` offset with box clipping, while callers own keyboard state and scrollbar rendering through the existing framework-neutral viewport helpers. A direct-core example will exercise the complete lifecycle and `space-lens` will consume the released core package.

**Tech Stack:** TypeScript, `@uniview/tui-core`, Yoga layout adapter, Vitest, Bun/Node TTY runtime, pnpm release scripts, npm package publication.

## Global Constraints

- Keep Uniview framework- and app-agnostic; Space Lens-specific data stays in the example and consumer.
- Use the public `@uniview/tui-core` surface in the example; do not import internal renderer packages.
- Keep scroll state and high-frequency input local to the terminal process.
- Follow the direct-core lifecycle: one app per stream pair, pure view, initial render, input-driven re-render, and `destroy()` before exit.
- Use test-first changes: each production behavior starts with a failing test and is verified in isolation before refactoring.
- Do not publish until the TUI verification and dry-run commands pass on a clean synchronized `main` branch.

---

### Task 1: Lock the layout and paint behavior with failing tests

**Files:**
- Modify: `packages/tui-core/tests/layout/layout.test.ts`
- Modify: `packages/tui-core/tests/layout/engine-equivalence.test.ts`
- Modify: `packages/tui-core/tests/paint/paint.test.ts`

**Interfaces:**
- Consumes: existing `computeLayout`, `customLayoutEngine`, `yogaLayoutEngine`, and `renderToBuffer`.
- Produces: executable specifications for explicit flex shrink and `scrollTop`/overflow rendering.

- [ ] **Step 1: Write a failing flex-shrink test**

Add a column fixture with a 3-row header, a 20-row content box styled `{ flexGrow: 1, flexShrink: 1, border: "rounded", padding: 1 }`, and a 40-row list inside a 20-row terminal. Assert that the panel box height equals the remaining terminal height and the list child geometry does not determine the panel’s outer height.

- [ ] **Step 2: Run the focused layout test and verify the expected failure**

Run:

```bash
pnpm --filter @uniview/tui-core exec vitest run tests/layout/layout.test.ts -t "shrinks"
```

Expected: FAIL because the custom engine currently leaves the content-sized flex child taller than the available main axis.

- [ ] **Step 3: Write failing paint tests**

Add three minimal scenes: a visible child extending beyond its parent, a hidden child extending beyond its parent, and a scroll container with `scrollTop: 2`. Assert visible content can paint in the ancestor clip, hidden content stops at the box, and the scroll container paints the row originally at y=2 at the viewport’s first content row while its border remains fixed.

- [ ] **Step 4: Run the focused paint tests and verify the expected failure**

Run:

```bash
pnpm --filter @uniview/tui-core exec vitest run tests/paint/paint.test.ts -t "overflow|scroll"
```

Expected: FAIL because the style has no scroll offset behavior and all descendants currently inherit the box intersection clip.

- [ ] **Step 5: Commit the red tests**

```bash
git add packages/tui-core/tests/layout/layout.test.ts packages/tui-core/tests/layout/engine-equivalence.test.ts packages/tui-core/tests/paint/paint.test.ts
git commit -m "test(tui): specify bounded flex and scroll painting"
```

### Task 2: Implement bounded flex and scroll painting

**Files:**
- Modify: `packages/tui-core/src/layout/layout.ts`
- Modify: `packages/tui-core/src/style/tui-style.ts`
- Modify: `packages/tui-core/src/paint/paint.ts`
- Modify: `packages/tui-core/src/layout/yoga-engine.ts` only if the new equivalence fixture exposes an adapter mismatch
- Test: `packages/tui-core/tests/layout/layout.test.ts`, `packages/tui-core/tests/layout/engine-equivalence.test.ts`, `packages/tui-core/tests/paint/paint.test.ts`

**Interfaces:**
- Consumes: the failing tests from Task 1.
- Produces: `TuiStyle.scrollTop?: number`, explicit custom-engine negative free-space distribution, and nested scroll-aware paint traversal.

- [ ] **Step 1: Implement explicit negative free-space distribution**

In `arrange`, calculate shrink weights from each child’s main-axis base size multiplied by `style.flexShrink ?? 0`. When `free < 0`, subtract the proportional amount from shrinkable children, clamp each main size at zero, and distribute rounding remainder deterministically. Leave children with no explicit shrink value unchanged.

- [ ] **Step 2: Add the controlled scroll style field**

Add `scrollTop?: number` next to `overflow` in `TuiStyle`. It is a render-time offset only and must not participate in intrinsic sizing.

- [ ] **Step 3: Implement overflow and scroll traversal**

Pass the ancestor clip for `overflow: "visible"`; pass `boxClip` for hidden and scroll nodes. Add an accumulated paint offset so a scroll node translates only its descendants by `-scrollTop`; draw the node’s own border, title, footer, background, and owner stamp at its original layout box.

- [ ] **Step 4: Run focused tests and the layout equivalence suite**

Run:

```bash
pnpm --filter @uniview/tui-core exec vitest run tests/layout/layout.test.ts tests/layout/engine-equivalence.test.ts tests/paint/paint.test.ts
```

Expected: all new tests pass, existing tests remain green, and the custom/Yoga geometry agrees for the explicit shrink fixture.

- [ ] **Step 5: Commit the green core change**

```bash
git add packages/tui-core/src packages/tui-core/tests
git commit -m "feat(tui-core): support bounded flex and scroll offsets"
```

### Task 3: Make viewport state resize-safe

**Files:**
- Modify: `packages/tui-core/src/virtual/virtual-window.ts`
- Modify: `packages/tui-core/tests/virtual/virtual-window.test.ts`

**Interfaces:**
- Consumes: the existing `VirtualListMachine` API.
- Produces: `setItemCount(itemCount: number)` and `setViewportHeight(viewportHeight: number)` methods that clamp `scrollTop`, preserve `ensureVisible`, and keep `maxScroll` correct.

- [ ] **Step 1: Write failing resize/data mutation tests**

Assert that shrinking the viewport clamps the offset to the new maximum, growing it moves the final row into the visible window, and reducing item count clamps the offset without producing a negative value.

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
pnpm --filter @uniview/tui-core exec vitest run tests/virtual/virtual-window.test.ts -t "viewport|item count"
```

- [ ] **Step 3: Implement the setters and shared clamp path**

Store mutable `itemCount` and `viewportHeight`, validate non-negative integer inputs, and route constructor and setter updates through the existing clamp calculation.

- [ ] **Step 4: Run the focused tests**

```bash
pnpm --filter @uniview/tui-core exec vitest run tests/virtual/virtual-window.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/tui-core/src/virtual/virtual-window.ts packages/tui-core/tests/virtual/virtual-window.test.ts
git commit -m "feat(tui-core): make virtual list viewport resize-safe"
```

### Task 4: Add the direct-core Space Lens example

**Files:**
- Create: `examples/tui/space-lens/package.json`
- Create: `examples/tui/space-lens/tsconfig.json`
- Create: `examples/tui/space-lens/README.md`
- Create: `examples/tui/space-lens/src/main.ts`
- Create: `examples/tui/space-lens/src/model.ts`
- Create: `examples/tui/space-lens/src/model.test.ts`
- Modify: `pnpm-workspace.yaml` only if the example is not already covered by the workspace glob

**Interfaces:**
- Consumes: public `createTuiApp`, `RenderNode`, `VirtualListMachine`, `scrollbarThumb`, and the new `scrollTop` style.
- Produces: a runnable `pnpm --filter @uniview/tui-space-lens dev` example and pure model tests for cursor/viewport behavior.

- [ ] **Step 1: Add failing model tests**

Test `moveCursor` clamps at both ends and updates the virtual list so the active row is visible; test `view` renders a bounded titled panel with the expected visible row slice and a scrollbar track/thumb.

- [ ] **Step 2: Run the example model test and verify failure**

```bash
pnpm --filter @uniview/tui-space-lens exec vitest run src/model.test.ts
```

Expected: FAIL because the example files do not exist.

- [ ] **Step 3: Implement the pure model and view**

Use 186 deterministic directory rows, a `VirtualListMachine` with one-row items, and a `view(state, size)` function. Reserve three header rows plus panel border/padding, set the panel to `{ flexGrow: 1, flexShrink: 1, overflow: "scroll", scrollTop }`, and render only the window rows. Paint the scrollbar in a one-cell column inside the panel.

- [ ] **Step 4: Implement direct-core runtime lifecycle**

Create one `createTuiApp` instance, render once, handle `j/k`, arrows, Home/End, PageUp/PageDown, resize, `q`, Ctrl-C, and stdin end, and call `app.destroy()` exactly once before process exit.

- [ ] **Step 5: Run model tests, typecheck, and build**

```bash
pnpm --filter @uniview/tui-space-lens test
pnpm --filter @uniview/tui-space-lens check-types
pnpm --filter @uniview/tui-space-lens build
```

- [ ] **Step 6: Document real-TTY verification**

Describe the keys, resize check, and cleanup behavior in the example README, including the expected bounded bottom border.

- [ ] **Step 7: Commit the example**

```bash
git add examples/tui pnpm-workspace.yaml
git commit -m "feat(examples): add direct-core scrollable Space Lens TUI"
```

### Task 5: Verify the complete Uniview TUI surface

**Files:**
- Modify: package versions and changelog/release metadata required by the repository’s existing TUI release workflow

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: verified build artifacts and a release-ready clean `main` branch.

- [ ] **Step 1: Run the full TUI test suite**

```bash
pnpm test:tui-release
```

- [ ] **Step 2: Run full TUI type checks and builds**

```bash
pnpm check-types:tui-release
pnpm build:tui-release
```

- [ ] **Step 3: Run package boundary and release workflow tests**

```bash
node --test scripts/verify-tui-package-boundaries.test.mjs scripts/tui-tarball-descriptor.test.mjs scripts/tui-release-workflow.test.mjs scripts/publish-tui-tarballs.test.mjs
node scripts/verify-tui-package-boundaries.mjs
```

- [ ] **Step 4: Bump all three public TUI packages to one new patch version**

Update `packages/tui-core/package.json`, `packages/tui-react/package.json`, and `packages/tui-solid/package.json` together, preserving all internal dependency range conventions required by the release script.

- [ ] **Step 5: Run the release dry run**

```bash
pnpm publish:tui:dry-run
```

- [ ] **Step 6: Commit and push the release-ready Uniview main branch**

```bash
git add packages/tui-core/package.json packages/tui-react/package.json packages/tui-solid/package.json
git commit -m "release: publish TUI scroll viewport support"
git push origin main
```

### Task 6: Publish and update Space Lens

**Files:**
- Modify: `/home/hk/dev/space-lens/apps/uniview-tui/package.json`
- Modify: `/home/hk/dev/space-lens/yarn.lock`
- Modify: `/home/hk/dev/space-lens/apps/uniview-tui/src/ui.ts`
- Create or modify: `/home/hk/dev/space-lens/apps/uniview-tui/src/ui.test.ts` if the existing app test layout has no suitable viewport regression test

**Interfaces:**
- Consumes: the published TUI package version and the example’s bounded viewport pattern.
- Produces: Space Lens using the registry package, with a visible bottom border and cursor-following scroll for scan and cleanup panes.

- [ ] **Step 1: Publish the verified Uniview TUI tarballs**

Run from `/home/hk/dev/uniview`:

```bash
pnpm publish:tui
```

Record the three published package names and exact version from the command output.

- [ ] **Step 2: Add a failing Space Lens viewport regression test**

Assert that a large row set rendered at a 20-row terminal produces a panel with a bottom border inside the frame and that moving the cursor to the final row changes the visible window rather than growing the panel.

- [ ] **Step 3: Update the Space Lens dependency and implementation**

Replace the local `file:../../../uniview/packages/tui-core` dependency with the exact published version, use the bounded flex/scroll model in both panes, and retain the existing cleanup behavior.

- [ ] **Step 4: Install, run the regression, typecheck, and build**

```bash
yarn install
yarn workspace @space-lens/uniview-tui test
yarn workspace @space-lens/uniview-tui typecheck
yarn workspace @space-lens/uniview-tui build
```

- [ ] **Step 5: Run the Space Lens TUI in a real terminal**

Use `yarn tui:uniview`, move to the first and final rows, switch modes, resize once, and quit with both `q` and Ctrl-C. Confirm the panel has a visible bounded bottom border and no row paints outside it.

- [ ] **Step 6: Commit and push the Space Lens integration**

```bash
git add apps/uniview-tui/package.json apps/uniview-tui/src yarn.lock
git commit -m "fix(uniview-tui): use published bounded scroll viewport"
git push origin main
```

### Task 7: Completion audit

- [ ] Verify the Uniview example exists under `examples/tui`, is documented, and uses only public core APIs.
- [ ] Verify core tests cover the original missing bottom-bound symptom, not only helper math.
- [ ] Verify the published package version is the exact version installed by `space-lens`.
- [ ] Verify both repositories are clean, synchronized, and the final TUI commands exit cleanly.
