# Development Guidelines

<cite>
**Referenced Files in This Document**
- [AGENTS.md](file://AGENTS.md#L66-L113)
- [package.json](file://package.json#L4-L40)
- [pnpm-workspace.yaml](file://pnpm-workspace.yaml#L1-L9)
- [turbo.json](file://turbo.json#L1-L25)
- [packages/protocol/tsconfig.json](file://packages/protocol/tsconfig.json#L1-L20)
- [packages/host-svelte/tsconfig.json](file://packages/host-svelte/tsconfig.json#L1-L21)
- [cypress.config.ts](file://cypress.config.ts#L1-L17)
- [scripts/run-cypress.ts](file://scripts/run-cypress.ts#L20-L41)
</cite>

## Table of Contents

1. [Code Conventions](#code-conventions)
2. [Build System](#build-system)
3. [TypeScript Rules](#typescript-rules)
4. [Testing Practices](#testing-practices)
5. [Project Anti-Patterns](#project-anti-patterns)

## Code Conventions

The repository uses Svelte 5 runes in Svelte code, React 19 for React packages and demos, and Solid for Solid renderer/runtime experiments. Source formatting is Prettier-driven outside `docs/`, imports are sorted with `@ianvs/prettier-plugin-sort-imports`, and package source should remain ESM-compatible. Svelte components should use `$props`, `$state`, `$derived`, and Svelte 5 lifecycle patterns rather than Svelte 4 `export let` or store-heavy patterns.

**Section sources**

- [AGENTS.md](file://AGENTS.md#L76-L96)
- [package.json](file://package.json#L17-L25)

## Build System

Packages live under `packages/*`, examples under `examples/*`, and docs under `docs`. Root scripts delegate build, dev, lint, type-check, and test tasks to Turbo. The pnpm catalog centralizes `kkrpc`, `react`, and `react-reconciler` versions. When adding packages, follow the project convention of using tsdown templates rather than hand-writing package scaffolding.

```yaml
packages:
  - packages/*
  - examples/*
  - docs

catalog:
  kkrpc: ^0.6.7
  react: ^19.2.4
  react-reconciler: ^0.33.0
```

**Section sources**

- [AGENTS.md](file://AGENTS.md#L68-L74)
- [package.json](file://package.json#L4-L16)
- [pnpm-workspace.yaml](file://pnpm-workspace.yaml#L1-L9)
- [turbo.json](file://turbo.json#L4-L24)

## TypeScript Rules

Core packages target modern JavaScript, preserve module syntax, use bundler module resolution, enable strict checks, and generate declarations through TypeScript while tsdown builds JavaScript. Svelte packages extend `@tsconfig/svelte` and add DOM libs; docs and Cypress have separate targeted configs.

**Section sources**

- [AGENTS.md](file://AGENTS.md#L76-L82)
- [packages/protocol/tsconfig.json](file://packages/protocol/tsconfig.json#L1-L20)
- [packages/host-svelte/tsconfig.json](file://packages/host-svelte/tsconfig.json#L1-L21)

## Testing Practices

Package tests use Vitest and live under package-level `tests/` directories. E2E scripts build packages before launching fixtures, and Cypress targets host demos through fixed localhost ports. Use `pnpm test` for package tests and `pnpm test:e2e:cypress` or `pnpm cypress:open` for browser validation.

**Section sources**

- [AGENTS.md](file://AGENTS.md#L91-L96)
- [package.json](file://package.json#L10-L15)
- [cypress.config.ts](file://cypress.config.ts#L1-L17)
- [scripts/run-cypress.ts](file://scripts/run-cypress.ts#L20-L41)

## Project Anti-Patterns

The most important constraints are: keep protocol product-agnostic, never pass functions over RPC, never access `window` or `document` from plugins intended for Worker/Node/Deno/Bun, do not import `react-dom` in plugins, do not couple `host-sdk` to any framework, and do not reintroduce plugin-as-server runtime entry points. Server-side plugins should use bridge-client mode.

**Section sources**

- [AGENTS.md](file://AGENTS.md#L98-L113)
- [AGENTS.md](file://AGENTS.md#L130-L177)
