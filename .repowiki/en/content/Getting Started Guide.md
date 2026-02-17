# Getting Started Guide

<cite>
**Referenced Files in This Document**
- [package.json](file://package.json)
- [pnpm-workspace.yaml](file://pnpm-workspace.yaml)
- [AGENTS.md](file://AGENTS.md)
- [README.md](file://README.md)
</cite>

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Running Examples](#running-examples)
5. [Development Workflow](#development-workflow)

## Prerequisites

| Requirement | Version  | Notes                                |
| ----------- | -------- | ------------------------------------ |
| Node.js     | >= 18    | Required for build tools             |
| pnpm        | 10.28.2+ | Package manager (catalog support)    |
| Bun         | Latest   | Optional, for running server plugins |

**Section sources**

- [package.json](file://package.json#L19-L22)

## Installation

```bash
# Clone the repository
git clone https://github.com/HuakunShen/uniview.git
cd uniview

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

**Section sources**

- [AGENTS.md](file://AGENTS.md#L292-L297)
- [README.md](file://README.md#L165-L169)

## Quick Start

### Create a React Plugin

```typescript
// worker.ts
import { startWorkerPlugin } from "@uniview/react-runtime";
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

### Create a Solid Plugin

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
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
};

export default App;
```

**Note**: Solid plugins require Babel transformation with `babel-preset-solid` set to `generate: "universal"`.

**Section sources**

- [README.md](file://README.md#L90-L128)

### Create a Host (Svelte)

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

**Section sources**

- [README.md](file://README.md#L130-L147)

## Running Examples

### Web Example (Svelte Host)

```bash
cd examples/host-svelte-demo
pnpm dev:all
```

Opens at `http://localhost:5173`. Try both Worker and WebSocket modes.

### Benchmark Mode

```bash
cd examples/host-svelte-demo
pnpm dev:all
# Open http://localhost:5173?demo=benchmark&update=incremental
```

Compares full-tree vs incremental update performance with 1000-2000 items.

### Terminal UI Example

```bash
cd examples/tui-demo
pnpm dev
```

Renders React plugins directly to terminal (no browser).

### Native macOS Example

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

**Section sources**

- [README.md](file://README.md#L35-L62)
- [README.md](file://README.md#L165-L194)

## Development Workflow

### Build Commands

```bash
# Build all packages
pnpm build

# Development mode (turbo watch)
pnpm dev

# Type checking
pnpm check-types

# Linting
pnpm lint

# Formatting
pnpm format
```

**Section sources**

- [AGENTS.md](file://AGENTS.md#L290-L316)
- [package.json](file://package.json#L4-L10)

### Project Structure

```
uniview/
├── packages/           # Core libraries
│   ├── protocol/       # Types, schemas, RPC interfaces
│   ├── react-renderer/ # Custom React reconciler
│   ├── solid-renderer/ # Solid universal renderer
│   ├── react-runtime/  # React plugin bootstrap
│   ├── solid-runtime/  # Solid plugin bootstrap
│   ├── host-sdk/       # Framework-agnostic controller
│   ├── host-svelte/    # Svelte 5 adapter
│   └── tui-renderer/   # Terminal UI renderer
├── examples/           # Demo applications
│   ├── host-svelte-demo/
│   ├── host-react-demo/
│   ├── host-vue-demo/
│   ├── bridge-server/
│   └── plugin-example/
├── vendors/            # Submodules
│   └── kkrpc/
└── docs/               # Documentation site
```

**Section sources**

- [AGENTS.md](file://AGENTS.md#L12-L36)
- [README.md](file://README.md#L197-L219)

### Creating New Packages

```bash
# Use tsdown template (NEVER create manually)
pnpm create tsdown@latest packages/my-package -t react

# Update package.json exports (use .mjs for ESM)
# Add to pnpm-workspace.yaml if needed
# Add build scripts to turbo.json
```

**Section sources**

- [AGENTS.md](file://AGENTS.md#L65-L71)
- [AGENTS.md](file://AGENTS.md#L356-L369)
