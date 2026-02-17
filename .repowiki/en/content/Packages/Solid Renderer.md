# Solid Renderer

<cite>
**Referenced Files in This Document**
- [packages/solid-renderer/package.json](file://packages/solid-renderer/package.json)
- [packages/solid-renderer/src/index.ts](file://packages/solid-renderer/src/index.ts)
- [AGENTS.md](file://AGENTS.md)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [API Reference](#api-reference)
4. [Build Requirements](#build-requirements)
5. [Usage Examples](#usage-examples)

## Overview

`@uniview/solid-renderer` provides a Solid.js universal renderer that produces serializable UI trees. Similar to `@uniview/react-renderer` but for Solid.js applications.

**Key Features:**

- Solid.js universal renderer (no DOM)
- Same serialization pipeline as React renderer
- Handler registry for event serialization
- Works in Web Workers, Node.js, Deno, Bun

**Section sources**

- [packages/solid-renderer/package.json](file://packages/solid-renderer/package.json)

## Installation

```bash
pnpm add @uniview/solid-renderer
```

## API Reference

### Core Exports

```typescript
// Solid renderer API
export { render, effect, memo, createElement } from "./renderer/reconciler";

// Re-exports from solid-js
export { For, Show, createSignal, createEffect, createMemo } from "solid-js";

// Serialization
export { HandlerRegistry } from "./serialization/handler-registry";
export { serializeTree } from "./serialization/serialize";

// Mutations
export { MutationCollector } from "./mutation/mutation-collector";
```

### render

```typescript
import { render } from "@uniview/solid-renderer";

const registry = new HandlerRegistry();
const dispose = render(() => <App />, {
  registry,
  onUpdate: (root) => {
    const tree = serializeTree(root, registry);
    // Send tree to host
  }
});
```

### Serialization

Same API as React renderer:

```typescript
import { serializeTree, HandlerRegistry } from "@uniview/solid-renderer";

const registry = new HandlerRegistry();
const tree = serializeTree(solidNode, registry);
```

**Section sources**

- [packages/solid-renderer/src/index.ts](file://packages/solid-renderer/src/index.ts)

## Build Requirements

Solid plugins require Babel transformation with `babel-preset-solid`:

```typescript
// build.ts
import { transformSync } from "@babel/core";
import solid from "babel-preset-solid";

const result = transformSync(code, {
  presets: [[solid, { generate: "universal", hydratable: false }]],
});
```

### Why Universal Transform?

The `generate: "universal"` option tells Solid to produce platform-agnostic code instead of DOM-specific code. This is required for:

- Web Workers (no DOM)
- Node.js (no DOM)
- Server-side rendering

### Build Example

```typescript
// examples/plugin-solid-example/build.ts
import { build } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";

await build({
  entryPoints: ["src/worker.ts"],
  bundle: true,
  format: "iife",
  plugins: [solidPlugin()],
  outfile: "dist/plugin.js",
});
```

**Section sources**

- [AGENTS.md](file://AGENTS.md)

## Usage Examples

### Solid Component

```tsx
import { createSignal, For } from "solid-js";

function TodoList() {
  const [todos, setTodos] = createSignal([
    { id: 1, text: "Learn Solid" },
    { id: 2, text: "Build plugin" },
  ]);

  return (
    <div>
      <h1>Todos</h1>
      <ul>
        <For each={todos()}>
          {(todo) => (
            <li>
              <span>{todo.text}</span>
              <button onClick={() => removeTodo(todo.id)}>Delete</button>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
```

### With Runtime

```typescript
// worker.ts
import { startSolidWorkerPlugin } from "@uniview/solid-runtime";
import App from "./App";

startSolidWorkerPlugin({ App });
```

**Section sources**

- [AGENTS.md](file://AGENTS.md)
