# Standalone TUI React Reconciler (Ink-like)

## TL;DR

> **Quick Summary**: Build a standalone React-to-terminal renderer (Ink-like) using a custom `react-reconciler` host config and a simple fixed-layout terminal renderer. No plugins or RPC. MVP focuses on keyboard interaction and minimal components.
>
> **Deliverables**:
>
> - `@uniview/tui-renderer` package (custom reconciler + terminal renderer)
> - Minimal component API: `Box`, `Text`, `Button`, `Input`, `Newline`
> - Demo app under `examples/tui-demo`
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - sequential
> **Critical Path**: Package scaffold → Reconciler core → Terminal renderer → Input handling → Demo

---

## Context

### Original Request

Build a standalone Ink-like TUI renderer where React code renders directly to terminal (no plugin system). Weekend POC for learning; minimal complexity; fixed layout acceptable.

### Interview Summary

**Key Discussions**:

- This is **not** a plugin system; React code should render directly to TUI.
- MVP uses **fixed layout** (no Yoga) for speed.
- Keyboard-only input is acceptable.

**Research Findings**:

- `packages/react-renderer/src/reconciler/host-config.ts` shows a minimal mutation-based `react-reconciler` host config pattern.
- Ink’s reconciler uses Yoga and applies styles in `createInstance`/`commitUpdate` (external reference: https://github.com/vadimdemedes/ink/blob/master/src/reconciler.ts).
- No existing `references/opentui` content in repo.

### Metis Review

Metis invocation failed due to tool error (JSON Parse error). Proceeding with self-review and explicit guardrails.

---

## Work Objectives

### Core Objective

Implement a minimal standalone React renderer that outputs terminal UI using a custom reconciler and a fixed layout engine.

### Concrete Deliverables

- `packages/tui-renderer/` with:
  - `createRenderer()` + `render()` API
  - Custom host config for `react-reconciler`
  - Terminal renderer that draws a screen buffer via ANSI escape codes
  - Minimal component API (Box/Text/Button/Input/Newline)
- `examples/tui-demo/` running a simple interactive app

### Definition of Done

- [ ] `pnpm build` succeeds for new package
- [ ] `pnpm dev` (demo) renders UI in terminal
- [ ] Button responds to Enter/Space
- [ ] Input accepts text and updates state

### Must Have

- Fixed-layout rendering (vertical stacking + optional row layout)
- Keyboard input handling
- Re-render on state update

### Must NOT Have (Guardrails)

- No plugin/RPC system
- No Yoga layout in MVP
- No mouse support
- No advanced widgets (scroll view, tables, etc.)

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> All verification must be agent-executed (no manual testing).

### Test Decision

- **Infrastructure exists**: Unknown/unused
- **Automated tests**: None (MVP)
- **Framework**: None

### Agent-Executed QA Scenarios (MANDATORY)

```
Scenario: Counter demo renders and increments
  Tool: interactive_bash (tmux)
  Preconditions: demo script available
  Steps:
    1. tmux new-session: pnpm dev --filter tui-demo
    2. Wait for: "Counter" header (timeout: 5s)
    3. Assert: "Count: 0" visible
    4. Send keys: Tab (focus button)
    5. Send keys: Enter
    6. Assert: "Count: 1" visible
    7. Send keys: Enter twice
    8. Assert: "Count: 3" visible
  Expected Result: Count increments on Enter
  Evidence: terminal output captured

Scenario: Input accepts text
  Tool: interactive_bash (tmux)
  Preconditions: demo running
  Steps:
    1. Navigate to input (Tab)
    2. Type: "hello"
    3. Assert: input value shows "hello"
    4. Press Backspace twice
    5. Assert: input shows "hel"
  Expected Result: Input updates on keystrokes
  Evidence: terminal output captured
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1:
└── Task 1: Scaffold tui-renderer package

Wave 2:
└── Task 2: Implement reconciler core + node model

Wave 3:
└── Task 3: Implement terminal renderer (fixed layout)

Wave 4:
└── Task 4: Input handling + focus

Wave 5:
└── Task 5: Component API + demo app
```

Critical Path: 1 → 2 → 3 → 4 → 5

---

## TODOs

### Task 1: Scaffold `@uniview/tui-renderer`

**What to do**:

- Create `packages/tui-renderer/` using `pnpm create tsdown@latest` (default template)
- Add `react`, `react-reconciler`, `ansi-escapes`, `string-width` dependencies
- Set `exports` with `.mjs` output (align with repo conventions)

**Must NOT do**:

- Do not add Yoga or external UI libs

**Recommended Agent Profile**:

- **Category**: `quick`
- **Skills**: `frontend-ui-ux`

**Parallelization**:

- **Can Run In Parallel**: NO
- **Blocked By**: None
- **Blocks**: Task 2

**References**:

- `packages/react-renderer/src/reconciler/renderer.ts` - Renderer API pattern
- `packages/react-renderer/src/index.ts` - Export structure
- Repo convention: `AGENTS.md` (ESM `.mjs` output)

**Acceptance Criteria**:

- [ ] `pnpm build --filter tui-renderer` succeeds
- [ ] `dist/index.mjs` created

**Agent-Executed QA Scenario**:

```
Scenario: Package builds
  Tool: Bash
  Steps:
    1. pnpm build --filter tui-renderer
    2. Assert: build exits 0
  Expected Result: build succeeds
```

**Commit**: YES

- Message: `feat(tui-renderer): scaffold package`

---

### Task 2: Implement Reconciler Core + Node Model

**What to do**:

- Add `reconciler/host-config.ts` using mutation-based host config
- Define `TuiNode` + `TextNode` types (similar to `InternalNode`)
- Implement `createRenderer()` + `render()` API
- Use a `RenderBridge`-like subscription to trigger re-render

**Must NOT do**:

- Do not serialize to UINode (no plugin/RPC)

**Recommended Agent Profile**:

- **Category**: `unspecified-high`
- **Skills**: `frontend-ui-ux`

**Parallelization**:

- **Can Run In Parallel**: NO
- **Blocked By**: Task 1
- **Blocks**: Task 3

**References**:

- `packages/react-renderer/src/reconciler/host-config.ts` - HostConfig structure
- `packages/react-renderer/src/reconciler/types.ts` - Internal node types
- `packages/react-renderer/src/reconciler/renderer.ts` - Container setup
- Ink host config (external): https://github.com/vadimdemedes/ink/blob/master/src/reconciler.ts

**Acceptance Criteria**:

- [ ] `render(<App />)` creates a node tree
- [ ] `resetAfterCommit` triggers renderer

**Agent-Executed QA Scenario**:

```
Scenario: Tree updates propagate
  Tool: Bash
  Steps:
    1. Run minimal demo that updates state every second
    2. Assert: render callback invoked on update
  Expected Result: update loop triggers re-render
```

**Commit**: YES

- Message: `feat(tui-renderer): add custom reconciler core`

---

### Task 3: Terminal Renderer (Fixed Layout)

**What to do**:

- Implement a simple layout pass:
  - Default vertical stacking
  - Optional `flexDirection: "row"` for horizontal layout
  - Basic `padding` and `gap`
- Render to a screen buffer (2D array of characters)
- Clear terminal and print buffer each commit

**Must NOT do**:

- No Yoga integration
- No diff rendering (full redraw is fine)

**Recommended Agent Profile**:

- **Category**: `unspecified-high`
- **Skills**: `frontend-ui-ux`

**Parallelization**:

- **Can Run In Parallel**: NO
- **Blocked By**: Task 2
- **Blocks**: Task 4

**References**:

- `packages/react-renderer/src/reconciler/host-config.ts` - update lifecycle
- `string-width` docs - calculate text width
- `ansi-escapes` docs - cursor positioning + clear screen

**Acceptance Criteria**:

- [ ] Box/Text render at correct coordinates
- [ ] Terminal redraws on state updates

**Agent-Executed QA Scenario**:

```
Scenario: Rendering is visible
  Tool: interactive_bash (tmux)
  Steps:
    1. Run demo rendering nested boxes
    2. Assert: text appears in expected order
  Expected Result: visible output on terminal
```

**Commit**: YES

- Message: `feat(tui-renderer): fixed layout + terminal renderer`

---

### Task 4: Keyboard Input + Focus

**What to do**:

- Add input handling via `process.stdin` (raw mode)
- Implement focus traversal with Tab/Shift+Tab
- Implement `Button` activation with Enter/Space
- Implement `Input` editing with printable keys + Backspace

**Must NOT do**:

- No mouse events
- No complex IME handling

**Recommended Agent Profile**:

- **Category**: `unspecified-high`
- **Skills**: `frontend-ui-ux`

**Parallelization**:

- **Can Run In Parallel**: NO
- **Blocked By**: Task 3
- **Blocks**: Task 5

**References**:

- Node.js `readline`/`stdin` raw mode docs
- Ink’s input handling approach (external): https://github.com/vadimdemedes/ink/tree/master/src

**Acceptance Criteria**:

- [ ] Tab cycles focus
- [ ] Enter/Space triggers button handler
- [ ] Input updates on keystrokes

**Agent-Executed QA Scenario**:

```
Scenario: Keyboard interaction works
  Tool: interactive_bash (tmux)
  Steps:
    1. Run demo
    2. Tab to button, press Enter
    3. Assert: counter increments
  Expected Result: handler fires
```

**Commit**: YES

- Message: `feat(tui-renderer): keyboard input + focus`

---

### Task 5: Component API + Demo App

**What to do**:

- Expose `Box`, `Text`, `Button`, `Input`, `Newline` components
- Add `examples/tui-demo/` with counter + input demo
- Provide `pnpm dev --filter tui-demo` script

**Must NOT do**:

- No extra components beyond MVP

**Recommended Agent Profile**:

- **Category**: `quick`
- **Skills**: `frontend-ui-ux`

**Parallelization**:

- **Can Run In Parallel**: NO
- **Blocked By**: Task 4
- **Blocks**: None

**References**:

- `examples/plugin-api/src/components/Button.tsx` - Component wrapper pattern
- `packages/react-renderer/src/index.ts` - Export style

**Acceptance Criteria**:

- [ ] Demo renders in terminal
- [ ] Button increments counter
- [ ] Input updates value

**Agent-Executed QA Scenario**:

```
Scenario: Demo runs end-to-end
  Tool: interactive_bash (tmux)
  Steps:
    1. pnpm dev --filter tui-demo
    2. Assert: header visible
    3. Use Tab + Enter to increment
    4. Type in input and see updates
  Expected Result: interactive demo works
```

**Commit**: YES

- Message: `feat(examples): add TUI demo app`

---

## Commit Strategy

| After Task | Message                                                | Files                            |
| ---------- | ------------------------------------------------------ | -------------------------------- |
| 1          | `feat(tui-renderer): scaffold package`                 | `packages/tui-renderer/**/*`     |
| 2          | `feat(tui-renderer): add custom reconciler core`       | `packages/tui-renderer/src/**/*` |
| 3          | `feat(tui-renderer): fixed layout + terminal renderer` | `packages/tui-renderer/src/**/*` |
| 4          | `feat(tui-renderer): keyboard input + focus`           | `packages/tui-renderer/src/**/*` |
| 5          | `feat(examples): add TUI demo app`                     | `examples/tui-demo/**/*`         |

---

## Success Criteria

### Verification Commands

```bash
pnpm build --filter tui-renderer
pnpm dev --filter tui-demo
```

### Final Checklist

- [ ] Renderer works without DOM
- [ ] Fixed layout renders Box/Text correctly
- [ ] Keyboard interactions work
- [ ] Demo app is functional
