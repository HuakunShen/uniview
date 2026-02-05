# Draft: Standalone TUI React Reconciler (Ink-like)

## Requirements (confirmed)

- Goal: Build a standalone TUI framework (Ink-like) that renders React directly to terminal.
- No plugin system / RPC involved.
- Purpose: POC/demo + learning (weekend project, a few hours).
- Scope: Minimal complexity is fine; fixed layout acceptable.

## Technical Decisions (pending)

- Layout engine: fixed layout (chosen) vs Yoga flexbox (Ink/React Native style).
- Component set for MVP: Box/View, Text, Button, Input, List, Newline, etc.
- Input handling: keyboard-only (likely) vs mouse support.
- Rendering model: full re-render each commit vs incremental diff to terminal buffer.

## Research Findings

- Uniview already has a custom reconciler in `packages/react-renderer/src/reconciler/host-config.ts` that builds in-memory nodes and triggers updates via `RenderBridge.update()` in `resetAfterCommit()`.
- The host config pattern is minimal and mutation-based: `createInstance`, `appendChild`, `insertBefore`, `removeChild`, `commitUpdate`, `commitTextUpdate`, `appendChildToContainer`, `clearContainer`.
- Ink’s reconciler (from `vadimdemedes/ink`) uses Yoga layout, enforces text-only nesting rules, and applies styles on `createInstance` + `commitUpdate`.
- No populated `references/opentui` submodule; only listed in `AGENTS.md`.

## Open Questions

- None (fixed layout chosen for MVP).

## Scope Boundaries

- INCLUDE: custom React reconciler, terminal renderer, minimal component API, simple demo app.
- EXCLUDE: plugin system, RPC transport, complex UI widgets, mouse support (unless requested).
