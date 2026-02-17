# Host SDK

<cite>
**Referenced Files in This Document**
- [packages/host-sdk/src/index.ts](file://packages/host-sdk/src/index.ts)
- [packages/host-sdk/src/types.ts](file://packages/host-sdk/src/types.ts)
- [packages/host-sdk/src/registry.ts](file://packages/host-sdk/src/registry.ts)
- [packages/host-sdk/package.json](file://packages/host-sdk/package.json)
- [AGENTS.md](file://AGENTS.md)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [PluginController Interface](#plugincontroller-interface)
4. [Controllers](#controllers)
5. [Component Registry](#component-registry)
6. [Usage Examples](#usage-examples)

## Overview

`@uniview/host-sdk` provides framework-agnostic infrastructure for hosting Uniview plugins. It includes:

- Unified `PluginController` interface for all runtime modes
- Component registry for mapping types to implementations
- Mutable tree for incremental updates

**Section sources**

- [packages/host-sdk/src/index.ts](file://packages/host-sdk/src/index.ts)
- [AGENTS.md](file://AGENTS.md#L240-L258)

## Installation

```bash
pnpm add @uniview/host-sdk
```

## PluginController Interface

All controllers implement the same interface:

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

### Status Types

```typescript
type HostMode = "worker" | "websocket" | "main";
```

**Section sources**

- [packages/host-sdk/src/types.ts](file://packages/host-sdk/src/types.ts)

## Controllers

### createWorkerController

Load plugin in Web Worker:

```typescript
import { createWorkerController } from "@uniview/host-sdk";

const controller = createWorkerController({
  pluginUrl: "/plugins/my-plugin.js",
  initialProps: { userId: "123" },
});

await controller.connect();
```

### createWebSocketController

Connect to bridge server:

```typescript
import { createWebSocketController } from "@uniview/host-sdk";

const controller = createWebSocketController({
  serverUrl: "ws://localhost:3000",
  pluginId: "my-plugin",
});

await controller.connect();
```

### createMainController

Direct import (development only):

```typescript
import { createMainController } from "@uniview/host-sdk";
import App from "./plugin/App";

const controller = createMainController({ App });

await controller.connect();
```

**Section sources**

- [packages/host-sdk/src/index.ts](file://packages/host-sdk/src/index.ts#L8-L19)

## Component Registry

Framework-agnostic registry for component mapping:

```typescript
import { createComponentRegistry } from "@uniview/host-sdk";

// Create typed registry
const registry = createComponentRegistry<SvelteComponent>();

// Register components
registry.register("Button", ButtonComponent);
registry.register("Card", CardComponent, { description: "Card component" });

// Lookup
const Button = registry.get("Button");
const hasCard = registry.has("Card");

// List all
const types = registry.list(); // ["Button", "Card"]

// Clear
registry.clear();
```

### Registry Interface

```typescript
interface ComponentRegistry<T = unknown> {
  register(type: string, component: T, metadata?: ComponentMetadata): void;
  get(type: string): T | undefined;
  has(type: string): boolean;
  list(): string[];
  clear(): void;
}
```

**Section sources**

- [packages/host-sdk/src/registry.ts](file://packages/host-sdk/src/registry.ts)

## Usage Examples

### Basic Setup

```typescript
import {
  createWorkerController,
  createComponentRegistry,
} from "@uniview/host-sdk";

const registry = createComponentRegistry();
registry.register("Button", MyButton);

const controller = createWorkerController({
  pluginUrl: "/plugin.js",
});

// Subscribe to tree updates
const unsubscribe = controller.subscribe((tree) => {
  if (tree) {
    renderTree(tree, registry);
  }
});

await controller.connect();

// Later: cleanup
unsubscribe();
await controller.disconnect();
```

### Event Handling

```typescript
// In your renderer
function handleClick(handlerId: string, event: Event) {
  const args = [serializeEvent(event)];
  controller.execute(handlerId, args);
}

// Extract handler ID from props
const handlerId = props._onClickHandlerId;
if (handlerId) {
  element.onclick = () => handleClick(handlerId, event);
}
```

### Status Monitoring

```typescript
const status = controller.getStatus();

if (!status.connected) {
  console.log("Mode:", status.mode);
  if (status.lastError) {
    console.error("Error:", status.lastError);
  }
}
```

**Section sources**

- [AGENTS.md](file://AGENTS.md#L269-L288)
