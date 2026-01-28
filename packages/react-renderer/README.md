# @uniview/react-renderer

Custom React reconciler for Uniview that produces serializable UI trees instead of DOM nodes.

## Installation

```bash
pnpm add @uniview/react-renderer
```

## Overview

This package provides a custom React reconciler that renders React components to an in-memory tree structure (`InternalNode`) which can then be serialized to `UINode` for transmission to host applications.

**Key Features:**

- No DOM dependencies - works in Web Workers, Node.js, Deno
- Serializable output - trees can be sent over RPC
- Handler registry - manages function-to-ID mapping for events

## API

### createRenderer / render

Create a renderer and render React elements:

```typescript
import { createRenderer, render, createRenderBridge } from '@uniview/react-renderer';

// Create a bridge to receive tree updates
const bridge = createRenderBridge();

// Subscribe to updates
bridge.subscribe((root) => {
  console.log('Tree updated:', root);
});

// Render a React element
render(<App />, bridge);
```

### RenderBridge

The bridge receives tree updates from the reconciler:

```typescript
interface RenderBridge {
  subscribe(callback: (root: InternalNode | null) => void): () => void;
  update(root: InternalNode | null): void;
}
```

### serializeTree

Convert internal nodes to protocol-compliant UINode:

```typescript
import { serializeTree, HandlerRegistry } from "@uniview/react-renderer";

const registry = new HandlerRegistry();
const bridge = createRenderBridge();

bridge.subscribe((root) => {
  if (root) {
    const uiNode = serializeTree(root, registry);
    // uiNode is now JSON-serializable
  }
});
```

### HandlerRegistry

Manages the mapping between event handler functions and their IDs:

```typescript
import { HandlerRegistry } from "@uniview/react-renderer";

const registry = new HandlerRegistry();

// Register a handler
const handlerId = registry.register(() => console.log("clicked"));

// Execute by ID
await registry.execute(handlerId, []);

// Clear all handlers
registry.clear();
```

## Internal Types

```typescript
// The internal tree node (before serialization)
interface InternalNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: (InternalNode | TextNode)[];
}

// Text content node
interface TextNode {
  id: string;
  text: string;
}
```

## Usage with Runtime

This package is typically used internally by `@uniview/runtime`. Direct usage is only needed for advanced customization:

```typescript
import { createRenderBridge, render, serializeTree, HandlerRegistry } from '@uniview/react-renderer';

function createCustomRuntime(App: React.ComponentType) {
  const bridge = createRenderBridge();
  const registry = new HandlerRegistry();

  bridge.subscribe((root) => {
    const tree = root ? serializeTree(root, registry) : null;
    // Send tree to host via your transport
  });

  render(<App />, bridge);

  return {
    executeHandler: (id: string, args: unknown[]) => registry.execute(id, args),
    destroy: () => registry.clear()
  };
}
```
