# @uniview/example-plugin

Example plugins demonstrating the Uniview plugin system in different runtime modes.

## Overview

This package contains:

- **Worker plugins** - Run in browser Web Workers (sandboxed)
- **WebSocket client plugins** - Run in Node.js/Deno/Bun, connect to a Bridge server

## Plugins

| Plugin          | Description                  | Modes             |
| --------------- | ---------------------------- | ----------------- |
| `simple-demo`   | Basic counter with state     | Worker, WebSocket |
| `advanced-demo` | Complex UI with forms, lists | Worker, WebSocket |

## Architecture

### Web Worker Mode

```
┌─────────────────┐                 ┌─────────────────┐
│  Browser Host   │  ◄─postMessage─►│  Web Worker     │
│  (SvelteKit)    │                 │  (Plugin)       │
└─────────────────┘                 └─────────────────┘
```

Plugins are bundled JavaScript files loaded into Web Workers. Full sandbox isolation.

### WebSocket Mode (Bridge Architecture)

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Browser Host   │◄─────►│  Bridge Server  │◄─────►│  Plugin Client  │
│  (SvelteKit)    │  WS   │  (Elysia)       │  WS   │  (Node.js)      │
└─────────────────┘       └─────────────────┘       └─────────────────┘
     :5173                      :3000                   (connects to bridge)
```

**Why Bridge Architecture?**

1. **Plugins as Clients**: Plugins connect TO the bridge, not the other way around. No need to manage ports or NAT traversal.
2. **Single Port**: All plugins multiplex through one server port (`:3000`), simplifying firewall/proxy config.
3. **Transparent Forwarding**: Bridge doesn't parse RPC messages, just forwards bytes between matched pairs.
4. **Simplified Deployment**: Only the bridge needs a stable address; plugins can run anywhere.

## Running the Example

### Quick Start (All-in-One)

```bash
cd examples/host-svelte-demo
pnpm dev:all
```

This starts:

1. Bridge server on `:3000`
2. Plugin clients (simple-demo, advanced-demo)
3. SvelteKit dev server on `:5173`

### Manual Start (3 Terminals)

**Terminal 1: Bridge Server**

```bash
cd examples/host-svelte-demo
bun server/index.ts
```

**Terminal 2: Plugin Clients**

```bash
cd examples/plugin-example
pnpm client
```

**Terminal 3: SvelteKit Host**

```bash
cd examples/host-svelte-demo
pnpm dev
```

Then open `http://localhost:5173` and select "Node.js" mode.

## Plugin Structure

```
examples/plugin-example/
├── src/
│   ├── simple-demo.tsx        # React component
│   ├── simple-demo.worker.ts  # Worker entry point
│   ├── simple-demo.client.ts  # WebSocket client entry
│   ├── advanced-demo.tsx
│   ├── advanced-demo.worker.ts
│   └── advanced-demo.client.ts
├── dist/                      # Built worker bundles
├── build.ts                   # Bun build script
└── package.json
```

## Creating a New Plugin

### 1. Create the React Component

```tsx
// src/my-plugin.tsx
import { useState } from "react";

export default function MyPlugin() {
  const [value, setValue] = useState("");

  return (
    <div>
      <input value={value} onChange={(e) => setValue(e.target.value)} />
      <p>You typed: {value}</p>
    </div>
  );
}
```

### 2. Create Worker Entry (Browser Mode)

```typescript
// src/my-plugin.worker.ts
import { startWorkerPlugin } from "@uniview/runtime";
import App from "./my-plugin";

startWorkerPlugin({ App });
```

### 3. Create Client Entry (WebSocket Mode)

```typescript
// src/my-plugin.client.ts
import { connectToHostServer } from "@uniview/runtime/ws-client";
import App from "./my-plugin";

connectToHostServer({
  App,
  serverUrl: "ws://localhost:3000",
  pluginId: "my-plugin",
});
```

### 4. Add Build Entries

Update `build.ts`:

```typescript
const entrypoints = [
  "./src/simple-demo.worker.ts",
  "./src/advanced-demo.worker.ts",
  "./src/my-plugin.worker.ts", // Add this
];
```

### 5. Add npm Scripts

```json
{
  "scripts": {
    "client:my-plugin": "bun src/my-plugin.client.ts"
  }
}
```

## Scripts

| Script                 | Description                        |
| ---------------------- | ---------------------------------- |
| `pnpm build`           | Build worker bundles to `dist/`    |
| `pnpm dev`             | Build with watch mode              |
| `pnpm client`          | Start all WebSocket client plugins |
| `pnpm client:simple`   | Start only simple-demo client      |
| `pnpm client:advanced` | Start only advanced-demo client    |

## Key Files

- **`build.ts`** - Bun build configuration for worker bundles
- **`*.worker.ts`** - Entry points for Web Worker mode
- **`*.client.ts`** - Entry points for WebSocket client mode
- **`*.tsx`** - React plugin components (shared between modes)
