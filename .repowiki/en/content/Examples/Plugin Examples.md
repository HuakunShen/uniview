# Plugin Examples

<cite>
**Referenced Files in This Document**
- [examples/plugin-api/](file://examples/plugin-api/)
- [examples/plugin-solid-api/](file://examples/plugin-solid-api/)
- [examples/plugin-example/](file://examples/plugin-example/)
- [examples/plugin-solid-example/](file://examples/plugin-solid-example/)
- [README.md](file://README.md)
</cite>

## Table of Contents

1. [plugin-api](#plugin-api)
2. [plugin-solid-api](#plugin-solid-api)
3. [plugin-example](#plugin-example)
4. [plugin-solid-example](#plugin-solid-example)

## plugin-api

Reusable React component primitives for plugins.

### Purpose

Provides UI components that plugins can use:

- Button
- Input
- Switch
- Toggle
- Form components

### Usage

```tsx
import { Button, Input, Switch } from "@uniview/plugin-api";

function MyPlugin() {
  return (
    <div>
      <Input placeholder="Enter text" />
      <Button onClick={() => alert("clicked")}>Submit</Button>
      <Switch checked={true} onChange={handleChange} />
    </div>
  );
}
```

**Section sources**

- [examples/plugin-api/](file://examples/plugin-api/)

## plugin-solid-api

Solid.js component primitives.

### Purpose

Same as `plugin-api` but for Solid.js plugins:

- Solid component implementations
- Universal transform compatible

### Usage

```tsx
import { Button, Input } from "@uniview/plugin-solid-api";
import { createSignal } from "solid-js";

function MyPlugin() {
  const [value, setValue] = createSignal("");

  return (
    <div>
      <Input value={value()} onInput={setValue} />
      <Button title="Submit" onClick={() => alert(value())} />
    </div>
  );
}
```

**Section sources**

- [examples/plugin-solid-api/](file://examples/plugin-solid-api/)

## plugin-example

React demo plugins showcasing different complexity levels.

### Included Plugins

| Plugin        | Description           |
| ------------- | --------------------- |
| simple-demo   | Basic counter example |
| advanced-demo | Forms, state, events  |
| benchmark     | Performance testing   |

### How to Run

```bash
# Worker mode: Built bundles served from bridge
cd examples/host-svelte-demo && pnpm dev:all

# WebSocket mode: Run client directly
cd examples/plugin-example && bun src/simple-demo.client.ts
```

### Simple Demo

```tsx
// src/simple-demo/App.tsx
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="p-4">
      <h1>Simple Demo</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}
```

### Benchmark Plugin

Tests performance with 1000-2000 items:

- Full-tree vs incremental updates
- Real-time metrics display

**Section sources**

- [examples/plugin-example/](file://examples/plugin-example/)
- [README.md](file://README.md#L49-L55)

## plugin-solid-example

Solid.js demo plugins.

### Build Requirements

Solid plugins require Babel transformation:

```typescript
// build.ts
import { transformSync } from "@babel/core";
import solid from "babel-preset-solid";

const result = transformSync(code, {
  presets: [[solid, { generate: "universal", hydratable: false }]],
});
```

### How to Build

```bash
cd examples/plugin-solid-example
bun run build.ts
```

### How to Run

```bash
cd examples/host-svelte-demo
pnpm dev:all:solid
```

### Example Plugin

```tsx
// src/App.tsx
import { createSignal, For } from "solid-js";

export default function App() {
  const [items, setItems] = createSignal([
    { id: 1, text: "Item 1" },
    { id: 2, text: "Item 2" },
  ]);

  return (
    <div>
      <h1>Solid Plugin</h1>
      <ul>
        <For each={items()}>{(item) => <li>{item.text}</li>}</For>
      </ul>
    </div>
  );
}
```

**Section sources**

- [examples/plugin-solid-example/](file://examples/plugin-solid-example/)
- [README.md](file://README.md#L57-L62)
