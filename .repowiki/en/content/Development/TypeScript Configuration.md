# TypeScript Configuration

<cite>
**Referenced Files in This Document**
- [AGENTS.md](file://AGENTS.md#L76-L82)
- [packages/protocol/tsconfig.json](file://packages/protocol/tsconfig.json#L1-L20)
- [packages/host-svelte/tsconfig.json](file://packages/host-svelte/tsconfig.json#L1-L21)
- [packages/host-svelte/package.json](file://packages/host-svelte/package.json#L24-L53)
- [docs/tsconfig.json](file://docs/tsconfig.json#L1-L36)
- [cypress/tsconfig.json](file://cypress/tsconfig.json#L1-L13)
</cite>

## Table of Contents

1. [Shared Package Defaults](#shared-package-defaults)
2. [Framework-Specific Configs](#framework-specific-configs)
3. [Documentation and Cypress Configs](#documentation-and-cypress-configs)

## Shared Package Defaults

Core TypeScript packages target `esnext`, preserve ESM syntax for the bundler, use bundler module resolution, enable strict mode, require isolated/verbatim module syntax, and emit declarations only. tsdown is responsible for JavaScript bundle output while TypeScript checks declarations and types.

**Section sources**

- [AGENTS.md](file://AGENTS.md#L76-L82)
- [packages/protocol/tsconfig.json](file://packages/protocol/tsconfig.json#L1-L20)

## Framework-Specific Configs

Svelte packages extend `@tsconfig/svelte`, include DOM libs, run `svelte-check`, and still preserve the package-level strict/bundler settings. React-oriented packages follow the package pattern but add React peer/dev dependencies at the package level rather than a separate root JSX config.

**Section sources**

- [packages/host-svelte/tsconfig.json](file://packages/host-svelte/tsconfig.json#L1-L21)
- [packages/host-svelte/package.json](file://packages/host-svelte/package.json#L24-L53)

## Documentation and Cypress Configs

The docs app uses Next/Fumadocs settings: `jsx: react-jsx`, Next plugin support, path aliases, no emit, and generated `.next` type includes. Cypress has a focused TS config for E2E/support files with Cypress types and DOM libs.

**Section sources**

- [docs/tsconfig.json](file://docs/tsconfig.json#L1-L36)
- [cypress/tsconfig.json](file://cypress/tsconfig.json#L1-L13)
