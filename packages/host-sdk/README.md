# @uniview/host-sdk

Framework-agnostic SDK for hosting Uniview plugins.

## Installation

```bash
pnpm add @uniview/host-sdk
```

## Overview

This package provides the host-side infrastructure for loading and managing Uniview plugins. It includes:

- **PluginController**: Interface for controlling plugins
- **WorkerController**: Load plugins in Web Workers
- **ComponentRegistry**: Map component types to implementations

## Quick Start

```typescript
import {
  createWorkerController,
  createComponentRegistry,
} from "@uniview/host-sdk";

// Create a registry for custom components
const registry = createComponentRegistry();
registry.register("Button", MyButtonComponent);

// Create a controller to load the plugin
const controller = createWorkerController({
  pluginUrl: "/plugins/my-plugin.js",
  initialProps: { userId: "123" },
});

// Subscribe to tree updates
controller.subscribe((tree) => {
  console.log("New UI tree:", tree);
  // Render the tree using your framework
});

// Connect to start the plugin
await controller.connect();
```

## API

### createWorkerController

Create a controller that loads a plugin in a Web Worker:

```typescript
interface WorkerControllerOptions {
  pluginUrl: string; // URL to the plugin bundle
  initialProps?: JSONValue; // Props to pass on initialize
}

function createWorkerController(
  options: WorkerControllerOptions,
): PluginController;
```

### PluginController

The main interface for controlling plugins:

```typescript
interface PluginController {
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reload(): Promise<void>;

  // Props
  updateProps(props: JSONValue): Promise<void>;

  // Tree
  getTree(): UINode | null;
  subscribe(callback: (tree: UINode | null) => void): () => void;

  // Events
  execute(handlerId: HandlerId, args?: JSONValue[]): Promise<void>;

  // Status
  getStatus(): {
    mode: HostMode;
    connected: boolean;
    lastError?: string;
  };
}
```

### createComponentRegistry

Create a registry for mapping component types to implementations:

```typescript
interface ComponentRegistry<T = unknown> {
  register(type: string, component: T, metadata?: ComponentMetadata): void;
  get(type: string): T | undefined;
  has(type: string): boolean;
  list(): string[];
  clear(): void;
}

function createComponentRegistry<T>(): ComponentRegistry<T>;
```

## Usage with Frameworks

### Svelte

Use `@uniview/host-svelte` which provides ready-to-use components:

```svelte
<script>
  import { PluginHost } from '@uniview/host-svelte';
  import { createWorkerController, createComponentRegistry } from '@uniview/host-sdk';

  const registry = createComponentRegistry();
  const controller = createWorkerController({ pluginUrl: '/plugin.js' });
</script>

<PluginHost {controller} {registry} />
```

### React / Vue / Other

Implement your own renderer using the controller:

```typescript
const controller = createWorkerController({ pluginUrl: "/plugin.js" });

// Subscribe to updates
controller.subscribe((tree) => {
  // Re-render your UI with the new tree
  renderTree(tree, registry);
});

// Handle events by converting handler IDs to actual calls
function handleEvent(handlerId: string, ...args: unknown[]) {
  controller.execute(handlerId, args);
}

await controller.connect();
```

## Component Registry

The registry maps component type names to your framework's components:

```typescript
const registry = createComponentRegistry<SvelteComponent>();

// Register custom components
registry.register("Button", Button);
registry.register("Card", Card);
registry.register("Modal", Modal);

// Check if a type is registered
if (registry.has("Button")) {
  const ButtonComponent = registry.get("Button");
}

// List all registered types
console.log(registry.list()); // ['Button', 'Card', 'Modal']
```

### Layout Tags vs Custom Components

- **Layout tags** (`div`, `span`, `p`, etc.) are rendered as native elements
- **Custom components** (anything not a layout tag) are looked up in the registry

```typescript
// In your renderer:
if (LAYOUT_TAGS.includes(node.type)) {
  // Render as native element
} else if (registry.has(node.type)) {
  // Render registered component
} else {
  // Unknown component - show error or fallback
}
```

## Host Modes

| Mode        | Description                  | Use Case               |
| ----------- | ---------------------------- | ---------------------- |
| `worker`    | Plugin runs in Web Worker    | Production, sandboxed  |
| `websocket` | Plugin runs on remote server | Server-side plugins    |
| `main`      | Plugin runs in main thread   | Development, debugging |

Currently, only `worker` mode is fully implemented via `createWorkerController`.
