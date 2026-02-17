# Development Guidelines

<cite>
**Referenced Files in This Document**
- [AGENTS.md](file://AGENTS.md)
- [package.json](file://package.json)
- [turbo.json](file://turbo.json)
- [pnpm-workspace.yaml](file://pnpm-workspace.yaml)
</cite>

## Table of Contents

1. [Code Conventions](#code-conventions)
2. [Build System](#build-system)
3. [TypeScript Configuration](#typescript-configuration)
4. [Testing](#testing)
5. [Anti-Patterns](#anti-patterns)

## Code Conventions

### Framework Versions

| Framework | Version        | Notes                        |
| --------- | -------------- | ---------------------------- |
| Svelte    | 5 (runes only) | Svelte 4 syntax deprecated   |
| React     | 19.2.4         |                              |
| Solid.js  | Latest         | Universal transform required |

### Import Sorting

Imports sorted via `@ianvs/prettier-plugin-sort-imports`:

```typescript
// External imports first
import { useState } from "react";
import type { UINode } from "@uniview/protocol";

// Internal imports second
import { serializeTree } from "./serialize";
```

### Formatting

- **Formatter**: Prettier with Tailwind plugin
- **Semicolons**: None
- **Indentation**: Tabs
- **Quotes**: Double quotes for JSON, single for code

**Section sources**

- [AGENTS.md](file://AGENTS.md#L82-L87)

## Build System

### Package Creation

**ALWAYS** use tsdown templates—never create packages manually:

```bash
# Available templates
pnpm create tsdown@latest packages/my-package -t default
pnpm create tsdown@latest packages/my-package -t react
pnpm create tsdown@latest packages/my-package -t svelte
```

### Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
  - examples/*
  - docs

catalog:
  kkrpc: ^0.6.7
  react: ^19.2.4
  react-reconciler: ^0.33.0
```

### Turbo Tasks

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "lint": { "dependsOn": ["^lint"] },
    "check-types": { "dependsOn": ["^check-types"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

**Section sources**

- [AGENTS.md](file://AGENTS.md#L65-L71)
- [turbo.json](file://turbo.json)
- [pnpm-workspace.yaml](file://pnpm-workspace.yaml)

## TypeScript Configuration

### Standard Configuration

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "emitDeclarationOnly": true
  }
}
```

### Key Rules

- **Target**: `esnext` for modern output
- **Module**: `preserve` - bundler handles transformation
- **Strictness**: Full strict mode enabled
- **Declarations**: tsdown handles JS, tsconfig handles types

**Section sources**

- [AGENTS.md](file://AGENTS.md#L73-L79)

## Testing

### Framework

- **Unit Tests**: Vitest
- **Browser Tests**: Vitest Browser Mode + Playwright
- **Location**: `tests/*.test.ts` or `tests/*.test.tsx` in package root

### Playground Pattern

UI packages use `playground/` as Vite root for browser testing:

```
packages/my-package/
├── src/
├── tests/
└── playground/
    └── index.html
```

**Section sources**

- [AGENTS.md](file://AGENTS.md#L89-L93)

## Anti-Patterns

### Build System

| Violation                   | Reason                          |
| --------------------------- | ------------------------------- |
| ❌ Create packages manually | Use `pnpm create tsdown@latest` |
| ❌ Use .js for ESM outputs  | Use .mjs consistently           |

### Plugin Development

| Violation                               | Reason                              |
| --------------------------------------- | ----------------------------------- |
| ❌ Access `window` or `document`        | Breaks Worker/Node.js compatibility |
| ❌ Pass functions directly over RPC     | Functions can't serialize           |
| ❌ Call own exposed RPC methods         | Creates circular dependency         |
| ❌ Import `react-dom`                   | Breaks Worker compatibility         |
| ❌ Assume synchronous execution         | Handlers may be async               |
| ❌ Mutate `InternalNode` after creation | Treat as immutable                  |

### Type Safety

| Violation                 | Reason            |
| ------------------------- | ----------------- |
| ❌ Use `@ts-ignore`       | Hides real errors |
| ❌ Use `@ts-expect-error` | Hides real errors |
| ❌ Use `as any`           | Loses type safety |

### Protocol

| Violation                                         | Reason                        |
| ------------------------------------------------- | ----------------------------- |
| ❌ Define product-specific primitives in protocol | Keep protocol agnostic        |
| ❌ Change types without bumping PROTOCOL_VERSION  | Breaks existing hosts/plugins |
| ❌ Pass non-JSONValue over RPC                    | Runtime validation failure    |
| ❌ Remove LAYOUT_TAGS                             | Hosts may depend on them      |

### Host SDK

| Violation                       | Reason                         |
| ------------------------------- | ------------------------------ |
| ❌ Couple to specific framework | Must remain framework-agnostic |
| ❌ Assume Worker availability   | Provide fallback or error      |
| ❌ Expose raw RPC channel       | Encapsulate in controller      |

### Svelte

| Violation              | Reason                         |
| ---------------------- | ------------------------------ |
| ❌ Use Svelte 4 syntax | Svelte 5 runes only            |
| ❌ Drop text children  | Hosts must render string nodes |

**Section sources**

- [AGENTS.md](file://AGENTS.md#L95-L109)
- [AGENTS.md](file://AGENTS.md#L231-L238)
- [AGENTS.md](file://AGENTS.md#L284-L288)
