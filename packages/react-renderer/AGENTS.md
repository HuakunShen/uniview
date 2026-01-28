# @uniview/react-renderer

**Parent:** [../../AGENTS.md](../../AGENTS.md)

## OVERVIEW

Custom React reconciler producing serializable `InternalNode` trees instead of DOM.

## STRUCTURE

```
src/
├── reconciler/
│   ├── host-config.ts   # React reconciler HostConfig implementation
│   ├── renderer.ts       # Renderer API, RenderBridge, createRenderer
│   ├── types.ts         # InternalNode, TextNode interfaces
│   └── bridge.ts        # RenderBridge for decoupled subscriptions
└── serialization/
    ├── serialize.ts     # InternalNode → UINode conversion
    └── handler-registry.ts  # Function → ID mapping for events
```

## WHERE TO LOOK

| Task               | Location                                | Notes                                  |
| ------------------ | --------------------------------------- | -------------------------------------- |
| Reconciler config  | `src/reconciler/host-config.ts`         | Full HostConfig for react-reconciler   |
| Renderer API       | `src/reconciler/renderer.ts`            | createRenderer, render, RenderBridge   |
| Tree serialization | `src/serialization/serialize.ts`        | serializeTree(): InternalNode → UINode |
| Handler registry   | `src/serialization/handler-registry.ts` | HandlerRegistry class, execute by ID   |
| Internal types     | `src/reconciler/types.ts`               | InternalNode, TextNode interfaces      |

## CONVENTIONS

### No DOM

Reconciler creates in-memory `InternalNode` objects, never touches DOM. Works in Web Workers, Node.js, Deno.

### Handler ID Pattern

`HandlerRegistry.register()` returns numeric ID (`handler_0`, `handler_1`, ...). Functions stored in Map, invoked via `execute(id, args)`. Event props (onClick, onSubmit) replaced with `data-on-click`, `data-on-submit` containing handler IDs.

### Bridge Subscription

`RenderBridge.update()` called by reconciler after each commit. Subscribers receive `InternalNode | null` root. Decouples reconciler from consumers.

## ANTI-PATTERNS

- ❌ **NEVER** import `react-dom` - breaks Worker compatibility
- ❌ **NEVER** mutate `InternalNode` after creation - treat as immutable
- ❌ **NEVER** pass functions over RPC - use handler IDs
- ❌ **NEVER** assume handlers are sync - `execute()` returns Promise

## NOTES

### Reconciler HostConfig

Key methods in `host-config.ts`:

- `createInstance(type, props)`: Creates `InternalNode { id, type, props, children[], parent }`
- `createTextInstance(text)`: Creates `TextNode { _isTextNode: true, text }`
- `appendChild(parent, child)`: Builds parent-child hierarchy
- `commitUpdate(instance, newProps)`: Updates props (triggers bridge.update())
- `resetAfterCommit(container)`: Calls `container.update()` to notify subscribers

### Serialization Pipeline

`serializeTree(node, registry)` recursively converts tree:

1. Detects `TextNode` → returns `string`
2. Filters non-serializable props (children, key, ref, functions)
3. Converts event props → handler IDs via registry
4. Validates JSON-serializable via `JSON.stringify()`
5. Recursively serializes children
6. Returns `UINode { type, props, children[], id }`
