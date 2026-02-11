# @uniview/react-runtime

**Parent:** [../../AGENTS.md](../../AGENTS.md)

## OVERVIEW

Plugin bootstrap for Worker/Node/Deno with React reconciler, HandlerRegistry, and kkrpc transport.

## STRUCTURE

```
src/
├── runtime.ts            # Core PluginRuntime with RPC handlers
├── worker-entry.ts       # Worker bootstrap: startWorkerPlugin()
├── ws-client.ts          # Bridge client: createWebSocketPluginClient()
└── ws-client-entry.ts    # Bridge helper: connectToHostServer()
```

## WHERE TO LOOK

| Task               | Location                 | Notes                          |
| ------------------ | ------------------------ | ------------------------------ |
| Worker bootstrap   | `src/worker-entry.ts`    | WorkerChildIO + RPCChannel     |
| Core runtime       | `src/runtime.ts`         | HandlerRegistry + tree updates |
| Bridge client      | `src/ws-client.ts`       | ElysiaWebSocketClientIO        |
| Bridge server mode | `src/ws-server-entry.ts` | @deprecated - use ws-client    |

## CONVENTIONS

### Multi-Entry Package

Entry points via package.json exports:

- `.` → `startWorkerPlugin()` (Worker mode)
- `./ws-client` → `createWebSocketPluginClient()` (Bridge mode)
- `./ws-server` → deprecated server mode

### RPC Lifecycle

1. Host calls `initialize()` → Runtime creates `HandlerRegistry` + renderer bridge
2. Bridge subscribes to updates → `serializeTree()` replaces functions with IDs → `rpc.updateTree()`
3. Host calls `executeHandler(handlerId, args)` → Registry executes handler in React context
4. Host calls `destroy()` → `handlerRegistry.clear()`, `io.destroy()`

### Handler Registry Pattern

Functions become string IDs before crossing RPC:

```typescript
// Plugin: onClick handler
const handlerId = registry.register(() => setCount((c) => c + 1));
props._onClickHandlerId = handlerId;

// Host: event received
rpc.executeHandler(handlerId, []); // Calls handler in plugin context
```

## ANTI-PATTERNS

- ❌ **NEVER** access `window`/`document` - breaks Worker/Node/Deno compatibility
- ❌ **NEVER** import Node-only modules in worker entry - breaks browser builds
- ❌ **NEVER** call host API from your own RPC handlers - causes infinite loops
- ❌ **MUST NOT** use ws-server mode - prefer bridge architecture (ws-client)
