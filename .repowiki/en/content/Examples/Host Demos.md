# Host Demos

<cite>
**Referenced Files in This Document**
- [examples/host-svelte-demo/](file://examples/host-svelte-demo/)
- [examples/host-react-demo/](file://examples/host-react-demo/)
- [examples/host-vue-demo/](file://examples/host-vue-demo/)
- [examples/host-macos-demo/](file://examples/host-macos-demo/)
- [examples/host-appkit-demo/](file://examples/host-appkit-demo/)
- [examples/tui-demo/](file://examples/tui-demo/)
- [README.md](file://README.md)
</cite>

## Table of Contents

1. [host-svelte-demo](#host-svelte-demo)
2. [host-react-demo](#host-react-demo)
3. [host-vue-demo](#host-vue-demo)
4. [host-macos-demo](#host-macos-demo)
5. [host-appkit-demo](#host-appkit-demo)
6. [tui-demo](#tui-demo)

## host-svelte-demo

**Primary web example** showcasing all runtime modes and features.

### How to Run

```bash
cd examples/host-svelte-demo
pnpm dev:all
```

Opens at `http://localhost:5173`.

### Features

| Feature             | Description                        |
| ------------------- | ---------------------------------- |
| Worker mode         | Plugins run in browser Web Workers |
| WebSocket mode      | Plugins run in Node.js via bridge  |
| Main thread mode    | Development-only direct loading    |
| Mode switching      | UI to switch between modes         |
| Framework switching | React or Solid plugins             |
| Benchmark mode      | Compare full-tree vs incremental   |

### Key Scripts

```bash
pnpm dev        # SvelteKit dev server only
pnpm dev:all    # Bridge + plugins + SvelteKit
pnpm plugins:all # Build and run all plugins
```

### Architecture

```
host-svelte-demo/
├── src/
│   ├── routes/          # SvelteKit pages
│   └── lib/
│       └── components/  # Host components
├── server/
│   └── index.ts         # Bridge server
└── static/
    └── plugins/         # Plugin bundles
```

**Section sources**

- [examples/host-svelte-demo/](file://examples/host-svelte-demo/)
- [README.md](file://README.md#L35-L48)

## host-react-demo

React 19 host implementation with shadcn/ui components.

### How to Run

```bash
cd examples/host-react-demo
pnpm dev:all
```

### Features

- React 19 with hooks
- Custom `ComponentRenderer` for recursive UINode rendering
- Event proxying via handler IDs
- shadcn/ui integration

### Key Implementation

```tsx
function ComponentRenderer({ node, registry, onEvent }) {
  if (isLayoutTag(node.type)) {
    const eventProps = createEventProps(node.props, onEvent);
    return (
      <node.type {...node.props} {...eventProps}>
        {node.children.map((child, i) =>
          typeof child === "string" ? (
            child
          ) : (
            <ComponentRenderer key={child.id} node={child} {...props} />
          ),
        )}
      </node.type>
    );
  }
  // Custom component rendering...
}
```

**Section sources**

- [examples/host-react-demo/](file://examples/host-react-demo/)

## host-vue-demo

Vue 3 host with reka-ui component library.

### How to Run

```bash
cd examples/host-vue-demo
pnpm dev:all
```

### Features

- Vue 3 Composition API
- `h()` render functions for dynamic components
- Controlled component patterns
- reka-ui integration

### Key Implementation

```typescript
function renderNode(node: UINode) {
  if (isLayoutTag(node.type)) {
    return h(
      node.type,
      node.props,
      node.children.map((child) =>
        typeof child === "string" ? child : renderNode(child),
      ),
    );
  }
  // Custom component...
}
```

**Section sources**

- [examples/host-vue-demo/](file://examples/host-vue-demo/)

## host-macos-demo

Native macOS SwiftUI application.

### How to Run

```bash
# Terminal 1: Bridge server
cd examples/bridge-server && bun src/index.ts

# Terminal 2: Plugin client
cd examples/plugin-example && bun src/simple-demo.client.ts

# Terminal 3: Xcode
cd examples/host-macos-demo
open HostMacOSDemo.xcodeproj
# Press Cmd+R in Xcode
```

### Features

- SwiftUI view building from UINode trees
- RPC protocol implementation in Swift
- Handler ID pattern for events
- WebSocket client in Swift

### Supported Elements

div, p, span, h1-h6, button, input, ul/li

**Section sources**

- [examples/host-macos-demo/README.md](file://examples/host-macos-demo/README.md)

## host-appkit-demo

Advanced native macOS with diff-based reconciliation.

### How to Run

Same as host-macos-demo, but open `HostAppKitDemo.xcodeproj`.

### Architecture

```
┌─────────────────┐
│   UINode Tree   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  NodeViewModel  │  ← Intermediate layer with dirty tracking
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TreeReconciler  │  ← ID-based diffing algorithm
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   NSView Tree   │  ← Imperative updates only
└─────────────────┘
```

### Features

- View model layer with dirty-tracking bitfields
- O(1) node diffing via stable IDs
- Imperative NSView updates (not full rebuilds)
- Same architecture as React Native

**Section sources**

- [examples/host-appkit-demo/README.md](file://examples/host-appkit-demo/README.md)

## tui-demo

Terminal UI renderer (no DOM).

### How to Run

```bash
cd examples/tui-demo
pnpm dev
```

### Features

- React components render to terminal
- ANSI escape codes for output
- Standalone (no browser needed)

**Section sources**

- [examples/tui-demo/](file://examples/tui-demo/)
