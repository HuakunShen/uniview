# React Runtime

<cite>
**Referenced Files in This Document**
- [packages/react-runtime/package.json](file://packages/react-runtime/package.json)
- [AGENTS.md](file://AGENTS.md)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Entry Points](#entry-points)
4. [Worker Mode](#worker-mode)
5. [WebSocket Mode](#websocket-mode)
6. [Usage Examples](#usage-examples)

## Overview

`@uniview/react-runtime` provides the bootstrap layer for React plugins. It handles:

- RPC lifecycle management
- Tree serialization and transmission
- Handler execution
- Multiple entry points for different environments

**Section sources**

- [packages/react-runtime/package.json](file://packages/react-runtime/package.json)
- [AGENTS.md](file://AGENTS.md#L111-L125)

## Installation

```bash
pnpm add @uniview/react-runtime
```

## Entry Points

Multi-entry package structure:

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./ws-client": "./dist/ws-client.mjs",
    "./ws-server": "./dist/ws-server.mjs"
  }
}
```

| Entry         | Purpose                             |
| ------------- | ----------------------------------- |
| `.`           | Worker mode (Web Worker)            |
| `./ws-client` | WebSocket client (Node.js/Deno/Bun) |
| `./ws-server` | Deprecated server mode              |

**Section sources**

- [packages/react-runtime/package.json](file://packages/react-runtime/package.json)

## Worker Mode

Bootstrap React plugin in a Web Worker:

```typescript
// worker.ts
import { startWorkerPlugin } from "@uniview/react-runtime";
import App from "./App";

startWorkerPlugin({
  App,
  mode: "full", // or "incremental"
});
```

### Options

```typescript
interface WorkerPluginOptions {
  App: React.ComponentType;
  mode?: "full" | "incremental";
  initialProps?: Record<string, unknown>;
}
```

### What It Does

1. Creates `RenderBridge` and `HandlerRegistry`
2. Renders `App` component
3. Subscribes to tree updates
4. Serializes tree with handler IDs
5. Sends tree to host via kkrpc
6. Exposes `executeHandler` for host events

**Section sources**

- [AGENTS.md](file://AGENTS.md#L54-L57)

## WebSocket Mode

Connect server-side plugin to bridge:

```typescript
// client.ts
import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import App from "./App";

connectToHostServer({
  App,
  serverUrl: "ws://localhost:3000",
  pluginId: "my-plugin",
  mode: "incremental",
});
```

### Options

```typescript
interface WebSocketPluginOptions {
  App: React.ComponentType;
  serverUrl: string;
  pluginId: string;
  mode?: "full" | "incremental";
}
```

### Bridge Architecture

```
Plugin (Node.js) ←→ Bridge Server ←→ Browser Host
```

The plugin connects TO the bridge as a client. This avoids NAT/port issues.

**Section sources**

- [AGENTS.md](file://AGENTS.md#L151-L167)

## Usage Examples

### Basic Plugin

```tsx
// App.tsx
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="p-4">
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}
```

```typescript
// worker.ts
import { startWorkerPlugin } from "@uniview/react-runtime";
import App from "./App";

startWorkerPlugin({ App });
```

### With Props

```tsx
// App.tsx
interface Props {
  userId: string;
  theme: "light" | "dark";
}

export default function App({ userId, theme }: Props) {
  return (
    <div className={theme}>
      <p>User: {userId}</p>
    </div>
  );
}
```

```typescript
// Host calls updateProps
controller.updateProps({ theme: "dark" });
```

### Incremental Mode

```typescript
import { startWorkerPlugin } from "@uniview/react-runtime";
import App from "./App";

startWorkerPlugin({
  App,
  mode: "incremental", // Only send mutations
});
```

Performance improvement for large lists:

- Full tree: ~87KB/message
- Incremental: ~69KB/message

**Section sources**

- [AGENTS.md](file://AGENTS.md#L186-L192)
