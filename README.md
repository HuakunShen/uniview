# Uniview

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/HuakunShen/uniview)
A universal plugin system for React and Solid plugins that render in any host framework.

## Overview

Uniview enables writing plugins in React or Solid that can be rendered by Svelte, Vue, React, or any other framework. Plugins run in isolated environments (Web Workers, Node.js, Deno, Bun) and communicate with hosts via RPC.

```
                              RPC (kkrpc)
┌───────────────────────┐ ◄──────────────────► ┌──────────────────┐
│  Plugin (React/Solid) │      UINode tree     │  Host (Svelte)   │
│  Web Worker           │                      │  or Vue, React   │
└───────────────────────┘                      └──────────────────┘
```

**Key Features:**

- Write plugins in React or Solid, render anywhere
- Sandboxed execution in Web Workers for security
- Server-side plugins via Node.js/Deno/Bun with WebSocket Bridge
- Framework-agnostic protocol - hosts implement their own adapters
- Type-safe RPC communication via kkrpc

## Packages

| Package                                              | Description                                            |
| ---------------------------------------------------- | ------------------------------------------------------ |
| [@uniview/protocol](./packages/protocol)             | Core types, UINode schema, RPC interfaces              |
| [@uniview/react-renderer](./packages/react-renderer) | Custom React reconciler producing UINode trees         |
| [@uniview/solid-renderer](./packages/solid-renderer) | Solid universal renderer producing UINode trees        |
| [@uniview/runtime](./packages/runtime)               | React plugin bootstrap for Worker/WebSocket            |
| [@uniview/solid-runtime](./packages/solid-runtime)   | Solid plugin bootstrap for Worker/WebSocket            |
| [@uniview/host-sdk](./packages/host-sdk)             | Framework-agnostic host controller                     |
| [@uniview/host-svelte](./packages/host-svelte)       | Svelte 5 rendering adapter                             |
| [@uniview/tui-renderer](./packages/tui-renderer)     | Terminal UI renderer (non-DOM, like React Native)      |

## Quick Start

### Running the Examples

The fastest way to see Uniview in action:

**Web Example (Svelte Host):**

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

**Solid Plugin Example:**

```bash
# Build Solid plugins (requires Babel transform)
cd examples/plugin-solid-example && bun run build.ts

# Run with bridge + Solid plugins + Svelte host
cd examples/host-svelte-demo
pnpm dev:all:solid
```

Open `http://localhost:5173`, select "Solid" in the framework selector.

**Terminal UI Example:**

```bash
cd examples/tui-demo
pnpm dev
```

Renders React plugins directly to terminal (no browser, no DOM).

**Native macOS Example (SwiftUI):**

```bash
# Terminal 1: Start bridge
cd examples/bridge-server && bun src/index.ts

# Terminal 2: Start plugin
cd examples/plugin-example && bun src/simple-demo.client.ts

# Open Xcode project and run
cd examples/host-macos-demo
open HostMacOSDemo.xcodeproj
# Press Cmd+R in Xcode
```

Renders React plugins as native SwiftUI app.

**Native macOS Example (AppKit — diff-based reconciliation):**

```bash
# Terminal 1: Start bridge
cd examples/bridge-server && bun src/index.ts

# Terminal 2: Start plugin
cd examples/plugin-example && bun src/simple-demo.client.ts

# Open Xcode project and run
cd examples/host-appkit-demo
open HostAppKitDemo.xcodeproj
# Press Cmd+R in Xcode
```

Same React plugins rendered as native AppKit views with a view model layer and id-based tree reconciler for efficient in-place updates.

### Plugin Side (React)

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

### Plugin Side (Solid)

Or write plugins in Solid with the same pattern:

```typescript
// worker.ts
import { startSolidWorkerPlugin } from "@uniview/solid-runtime";
import App from "./App";

startSolidWorkerPlugin({ App });
```

```tsx
// App.tsx
import { createSignal } from "solid-js";

const App = () => {
  const [count, setCount] = createSignal(0);

  return (
    <div className="p-4">
      <p>Count: {count()}</p>
      <Button onClick={() => setCount((c) => c + 1)} title="Increment" />
    </div>
  );
};

export default App;
```

Solid plugins require a build step (Babel + `babel-preset-solid` with `generate: "universal"`) since the universal JSX transform can't run directly in Bun/Node. See `examples/plugin-solid-example/build.ts` for the build configuration.

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
│   ├── solid-renderer/     # Solid universal renderer
│   ├── runtime/            # React plugin bootstrap (worker + ws-client)
│   ├── solid-runtime/      # Solid plugin bootstrap (worker + ws-client)
│   ├── host-sdk/           # Host controller logic
│   ├── host-svelte/        # Svelte 5 adapter
│   └── tui-renderer/       # Terminal UI renderer (non-DOM)
├── examples/
│   ├── host-svelte-demo/   # Web example (Svelte + Bridge)
│   ├── host-macos-demo/    # Native macOS app (SwiftUI)
│   ├── host-appkit-demo/   # Native macOS app (AppKit, diff-based)
│   ├── host-react-demo/    # React host example
│   ├── host-vue-demo/      # Vue host example
│   ├── tui-demo/           # Terminal UI example
│   ├── bridge-server/      # WebSocket bridge server
│   ├── plugin-api/         # Reusable React components
│   ├── plugin-solid-api/   # Reusable Solid components
│   ├── plugin-example/     # React example plugins
│   └── plugin-solid-example/ # Solid example plugins
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
Plugin (React or Solid)
     │
     ▼
┌─────────────────────┐
│  react-renderer /   │  Custom reconciler converts
│  solid-renderer     │  components to in-memory tree
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

## Host Targets

Uniview plugins render on any target that implements the UINode protocol:

| Target | Example | Rendering Approach |
|---|---|---|
| **Svelte** (Web) | `host-svelte-demo` | Svelte 5 `ComponentRenderer` |
| **React** (Web) | `host-react-demo` | React component tree |
| **Vue** (Web) | `host-vue-demo` | Vue component tree |
| **SwiftUI** (macOS) | `host-macos-demo` | Declarative SwiftUI views |
| **AppKit** (macOS) | `host-appkit-demo` | Imperative NSViews with diff reconciler |
| **Terminal** | `tui-demo` | ANSI escape codes (standalone) |

The AppKit demo uses a view model layer with dirty-tracking bitfields and a tree reconciler that matches nodes by stable ID for O(1) diffing — the same architecture used by React Native. See `examples/host-appkit-demo/README.md` for a full design guide on building this kind of system.

## License

MIT
