# @uniview/runtime

Plugin-side runtime for Uniview that bootstraps React plugins in various environments.

## Installation

```bash
pnpm add @uniview/runtime
```

## Overview

This package provides the runtime environment for Uniview plugins. It handles:

- React reconciler setup
- Tree serialization and updates
- RPC communication with the host
- Handler execution from host events

## Quick Start

### Web Worker Plugin

The simplest way to create a worker-based plugin:

```typescript
// worker.ts
import { startWorkerPlugin } from "@uniview/runtime";
import App from "./App";

startWorkerPlugin({ App });
```

That's it! The runtime handles all communication with the host.

### Custom Runtime

For more control, use `createPluginRuntime`:

```typescript
import { createPluginRuntime } from "@uniview/runtime";
import type { PluginToHostAPI } from "@uniview/protocol";

const hostApi: PluginToHostAPI = {
  updateTree: (tree) => {
    /* send to host */
  },
  log: (level, args) => console.log(level, ...args),
  reportError: (err) => console.error(err),
};

const runtime = createPluginRuntime({
  App: MyApp,
  hostApi,
  onInitialize: (props) => {
    // Called when host sends initialize
  },
  onUpdateProps: (props) => {
    // Called when host updates props
  },
});

// Start the runtime
runtime.start();

// Later: cleanup
runtime.stop();
```

## API

### startWorkerPlugin

Bootstrap a plugin in a Web Worker with automatic RPC setup:

```typescript
function startWorkerPlugin(options: { App: React.ComponentType }): void;
```

### createPluginRuntime

Create a plugin runtime with custom transport:

```typescript
interface PluginRuntimeOptions {
  App: React.ComponentType;
  hostApi: PluginToHostAPI;
  onInitialize?: (props: JSONValue) => void;
  onUpdateProps?: (props: JSONValue) => void;
}

interface PluginRuntime {
  start(): void;
  stop(): void;
  executeHandler(handlerId: string, args: JSONValue[]): Promise<void>;
}

function createPluginRuntime(options: PluginRuntimeOptions): PluginRuntime;
```

## Writing a Plugin

A Uniview plugin is just a React component:

```tsx
// App.tsx
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>My Plugin</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}
```

### Building for Worker

Bundle your plugin for worker execution:

```typescript
// tsdown.config.ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/worker.ts"],
  format: ["esm"],
  platform: "browser",
  outDir: "dist",
  clean: true,
});
```

## Supported Environments

| Environment | Entry Point           | Notes                    |
| ----------- | --------------------- | ------------------------ |
| Web Worker  | `startWorkerPlugin`   | Primary, fully supported |
| Node.js     | `createPluginRuntime` | With WebSocket transport |
| Deno        | `createPluginRuntime` | With WebSocket transport |

## How It Works

1. **Initialize**: Host sends `initialize` with protocol version and initial props
2. **Render**: Runtime renders your React app through the custom reconciler
3. **Serialize**: On every React update, the tree is serialized to `UINode`
4. **Send**: Serialized tree is sent to host via `updateTree`
5. **Events**: When host calls `executeHandler`, runtime finds and executes the handler
6. **Cleanup**: On `destroy`, runtime stops and clears handlers
