# @uniview/example-plugin - PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-28T02:00:00Z
**Commit:** 45adfe3e0d0c1993b182d3d707bbffaced01b1b1
**Branch:** main

## OVERVIEW

Demo plugins demonstrating Worker and WebSocket modes for Uniview plugin system.

## WHERE TO LOOK

| Task                      | Location          | Notes                               |
| ------------------------- | ----------------- | ----------------------------------- |
| Bun build configuration   | `build.ts`        | Custom Bun.build script, dev server |
| Worker mode entry points  | `src/*.worker.ts` | Uses startWorkerPlugin()            |
| WebSocket client entry    | `src/*.client.ts` | Uses connectToHostServer()          |
| React components (shared) | `src/*.tsx`       | React app code for both modes       |

## CONVENTIONS

### Build System

- **Worker bundles**: Built via `Bun.build()` in `build.ts` (non-standard, not tsdown)
- **Output**: ESM format, target: "browser", sourcemaps: "external"
- **Dev server**: `pnpm dev` or `bun build.ts --serve` serves dist/ on port 3000
- **Entry points**: Add new worker entries to `build.ts` entrypoints array

### Runtime Modes

- **Worker mode**: `*.worker.ts` imports `startWorkerPlugin()` from `@uniview/react-runtime`
- **WebSocket mode**: `*.client.ts` imports `connectToHostServer()` from `@uniview/react-runtime/ws-client`
- **Shared React**: `*.tsx` components work identically in both modes
- **Triple runtime support**: Worker (browser), WebSocket (Node.js/Deno/Bun), Main Thread (dev)

### Entry Point Patterns

```typescript
// Worker mode (browser Web Worker)
import { startWorkerPlugin } from "@uniview/react-runtime";
import App from "./my-plugin";
startWorkerPlugin({ App });

// WebSocket mode (Node.js/Deno/Bun client)
import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import App from "./my-plugin";
connectToHostServer({
  App,
  serverUrl: "ws://localhost:3000",
  pluginId: "my-plugin",
});
```

## ANTI-PATTERNS (THIS PACKAGE)

- ❌ **NEVER** use `*.server.ts` entry points - deprecated, use `*.client.ts` instead
- ❌ **NEVER** bundle client/server entry points in Bun.build - only worker bundles
- ❌ **NEVER** mix Worker and WebSocket initialization in same file
- ❌ **NEVER** forget to add new worker entries to `build.ts` entrypoints array
- ❌ **DO NOT** run `*.client.ts` files with Bun.build - they execute directly with `bun src/*.client.ts`
