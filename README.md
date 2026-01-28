# Uniview

A universal plugin system for React plugins that render in any host framework.

## Overview

Uniview enables writing plugins in React that can be rendered by Svelte, Vue, React, or any other framework. Plugins run in isolated environments (Web Workers, Node.js, Deno, Bun) and communicate with hosts via RPC.

```
                         RPC (kkrpc)
┌──────────────────┐ ◄──────────────────► ┌──────────────────┐
│  Plugin (React)  │      UINode tree     │  Host (Svelte)   │
│  Web Worker      │                      │  or Vue, React   │
└──────────────────┘                      └──────────────────┘
```

**Key Features:**

- Write plugins once in React, render anywhere
- Sandboxed execution in Web Workers for security
- Server-side plugins via Node.js/Deno/Bun with WebSocket Bridge
- Framework-agnostic protocol - hosts implement their own adapters
- Type-safe RPC communication via kkrpc

## Packages

| Package                                              | Description                                        |
| ---------------------------------------------------- | -------------------------------------------------- |
| [@uniview/protocol](./packages/protocol)             | Core types, UINode schema, RPC interfaces          |
| [@uniview/react-renderer](./packages/react-renderer) | Custom React reconciler producing UINode trees     |
| [@uniview/runtime](./packages/runtime)               | Plugin bootstrap for Worker/WebSocket environments |
| [@uniview/host-sdk](./packages/host-sdk)             | Framework-agnostic host controller                 |
| [@uniview/host-svelte](./packages/host-svelte)       | Svelte 5 rendering adapter                         |

## Quick Start

### Running the Example

The fastest way to see Uniview in action:

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the complete example (bridge + plugins + host)
cd examples/host-svelte-demo
pnpm dev:all
```

Then open `http://localhost:5173` and try both Worker and Node.js modes.

### Plugin Side

Create a React component and bootstrap it with the runtime:

```typescript
// worker.ts
import { startWorkerPlugin } from "@uniview/runtime";
import App from "./App";

startWorkerPlugin({ App });
```

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

### Host Side (Svelte)

Load and render the plugin:

```svelte
<script lang="ts">
  import { PluginHost } from '@uniview/host-svelte';
  import { createWorkerController, createComponentRegistry } from '@uniview/host-sdk';

  const registry = createComponentRegistry();
  const controller = createWorkerController({
    pluginUrl: '/plugins/my-plugin.js'
  });
</script>

<PluginHost {controller} {registry}>
  {#snippet loading()}
    <p>Loading plugin...</p>
  {/snippet}
</PluginHost>
```

## Architecture

### Web Worker Mode (Browser)

```
┌─────────────────┐                 ┌─────────────────┐
│  Browser Host   │  ◄─postMessage─►│  Web Worker     │
│  (Svelte)       │                 │  (Plugin)       │
└─────────────────┘                 └─────────────────┘
```

### WebSocket Mode (Bridge Architecture)

For server-side plugins, Uniview uses a **Bridge Server** pattern:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Browser Host   │◄─────►│  Bridge Server  │◄─────►│  Plugin Client  │
│  (Svelte)       │  WS   │  (Elysia)       │  WS   │  (Node.js)      │
└─────────────────┘       └─────────────────┘       └─────────────────┘
     :5173                      :3000               (connects to bridge)
```

**Why Bridge Architecture?**

1. **Plugins as Clients**: Plugins connect TO the bridge server. No need to manage ports or NAT traversal.
2. **Single Port**: All plugins multiplex through one port (`:3000`), simplifying deployment.
3. **Transparent Forwarding**: Bridge forwards bytes without parsing, preserving kkrpc protocol.
4. **Simplified Networking**: Only bridge needs a stable address; plugins can run anywhere.

```typescript
// Plugin connects as client
import { connectToHostServer } from "@uniview/runtime/ws-client";

connectToHostServer({
  App: MyPlugin,
  serverUrl: "ws://localhost:3000",
  pluginId: "my-plugin",
});

// Host connects to same bridge
const controller = createWebSocketController({
  serverUrl: "ws://localhost:3000",
  pluginId: "my-plugin",
});
```

## Runtime Modes

| Mode            | Environment      | Isolation        | Use Case                         |
| --------------- | ---------------- | ---------------- | -------------------------------- |
| **Worker**      | Browser          | Full sandbox     | Production, untrusted plugins    |
| **WebSocket**   | Node.js/Deno/Bun | Process boundary | Server-side, full runtime access |
| **Main Thread** | Browser          | None             | Development only                 |

```typescript
// Worker mode (production)
const controller = createWorkerController({
  pluginUrl: "/plugins/my-plugin.js",
});

// WebSocket mode (server-side plugins)
const controller = createWebSocketController({
  serverUrl: "ws://localhost:3000",
  pluginId: "my-plugin",
});

// Main thread mode (development)
import App from "./plugin/App";
const controller = createMainController({ App });
```

## Project Structure

```
uniview/
├── packages/
│   ├── protocol/           # Shared types and contracts
│   ├── react-renderer/     # Custom React reconciler
│   ├── runtime/            # Plugin bootstrap (worker + ws-client)
│   ├── host-sdk/           # Host controller logic
│   └── host-svelte/        # Svelte 5 adapter
├── examples/
│   ├── host-svelte-demo/   # Example host + bridge server
│   ├── plugin-api/         # Reusable React components
│   └── plugin-example/     # Example plugins
├── vendors/
│   └── kkrpc/              # RPC library (submodule)
└── docs/                   # Documentation site
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the full example
cd examples/host-svelte-demo
pnpm dev:all  # Starts bridge + plugins + host

# Or run components separately:
# Terminal 1: Bridge server
bun server/index.ts

# Terminal 2: Plugin clients
cd ../plugin-example && pnpm client

# Terminal 3: SvelteKit host
pnpm dev
```

## Documentation

See the [docs](./docs) folder or visit the documentation site for:

- [Architecture](./docs/content/docs/architecture.mdx) - System design and data flow
- [Runtime Modes](./docs/content/docs/guides/runtime-modes.mdx) - Worker, WebSocket, Main Thread
- [Getting Started](./docs/content/docs/getting-started.mdx) - Build your first plugin

## How It Works

```
Plugin (React)
     │
     ▼
┌─────────────────────┐
│  react-renderer     │  Custom reconciler converts React
│  (InternalNode)     │  elements to in-memory tree
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  serializeTree()    │  Converts to JSON-safe UINode,
│  HandlerRegistry    │  replaces functions with IDs
└──────────┬──────────┘
           │
           ▼ RPC (kkrpc)
┌─────────────────────┐
│  host-sdk           │  PluginController manages
│  PluginController   │  connection and tree updates
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  host-svelte        │  ComponentRenderer recursively
│  ComponentRenderer  │  renders UINode as Svelte
└─────────────────────┘
```

## Inspiration

Inspired by [Raycast's plugin architecture](https://www.raycast.com/blog/how-raycast-api-extensions-work) which uses a custom React reconciler to render plugins using native AppKit components. Uniview takes this concept to the web, rendering to any framework.

## License

MIT
