# Solid Runtime

<cite>
**Referenced Files in This Document**
- [packages/solid-runtime/package.json](file://packages/solid-runtime/package.json)
- [AGENTS.md](file://AGENTS.md)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Entry Points](#entry-points)
4. [Worker Mode](#worker-mode)
5. [WebSocket Mode](#websocket-mode)
6. [Build Requirements](#build-requirements)

## Overview

`@uniview/solid-runtime` provides the bootstrap layer for Solid.js plugins. Similar to `@uniview/react-runtime` but for Solid applications.

**Section sources**

- [packages/solid-runtime/package.json](file://packages/solid-runtime/package.json)

## Installation

```bash
pnpm add @uniview/solid-runtime
```

## Entry Points

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./ws-client": "./dist/ws-client.mjs"
  }
}
```

| Entry         | Purpose                  |
| ------------- | ------------------------ |
| `.`           | Worker mode (Web Worker) |
| `./ws-client` | WebSocket client         |

**Section sources**

- [packages/solid-runtime/package.json](file://packages/solid-runtime/package.json)

## Worker Mode

```typescript
// worker.ts
import { startSolidWorkerPlugin } from "@uniview/solid-runtime";
import App from "./App";

startSolidWorkerPlugin({
  App,
  mode: "full",
});
```

### Options

```typescript
interface SolidWorkerOptions {
  App: () => JSX.Element;
  mode?: "full" | "incremental";
}
```

## WebSocket Mode

```typescript
import { createSolidWebSocketPluginClient } from "@uniview/solid-runtime/ws-client";
import App from "./App";

createSolidWebSocketPluginClient({
  App,
  serverUrl: "ws://localhost:3000",
  pluginId: "solid-plugin",
});
```

## Build Requirements

Solid plugins require Babel transformation:

```typescript
// build.ts
import { transformSync } from "@babel/core";
import solid from "babel-preset-solid";

// Transform JSX to universal Solid code
const result = transformSync(code, {
  presets: [[solid, { generate: "universal", hydratable: false }]],
});
```

### esbuild Plugin

```typescript
import { solidPlugin } from "esbuild-plugin-solid";

await build({
  plugins: [solidPlugin()],
});
```

**Section sources**

- [AGENTS.md](file://AGENTS.md)
