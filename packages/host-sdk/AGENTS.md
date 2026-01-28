# @uniview/host-sdk

**Parent:** [../../AGENTS.md](../../AGENTS.md)

## OVERVIEW

Framework-agnostic host infrastructure. Provides unified `PluginController` interface for Worker/WebSocket/Main modes, plus component registry.

## STRUCTURE

```
src/
├── index.ts                    # Main exports
├── types.ts                    # PluginController interface
├── registry.ts                 # ComponentRegistry implementation
└── controllers/
    ├── worker.ts               # Web Worker controller
    ├── websocket.ts            # WebSocket controller
    └── main.ts                 # Main thread controller (dev only)
```

## WHERE TO LOOK

| Task                 | Location                       | Notes                     |
| -------------------- | ------------------------------ | ------------------------- |
| Controller interface | `src/types.ts`                 | PluginController contract |
| Worker mode          | `src/controllers/worker.ts`    | createWorkerController    |
| WebSocket mode       | `src/controllers/websocket.ts` | createWebSocketController |
| Registry             | `src/registry.ts`              | createComponentRegistry   |

## CONVENTIONS

### Unified Interface

All controllers implement same `PluginController` interface regardless of transport. Host code doesn't change when switching modes.

### Tree Subscription

Controllers use Set-based subscriber pattern - multiple subscribers supported, cleanup via unsubscribe function.

### Status Reporting

`getStatus()` returns `{ mode, connected, lastError }` - host can show connection state in UI.

## ANTI-PATTERNS

- ❌ **NEVER** couple to specific framework - SDK is framework-agnostic
- ❌ **NEVER** assume Worker availability - provide fallback or error
- ❌ **NEVER** expose raw RPC channel - encapsulate in controller

## NOTES

### Component Registry

Generic `<T>` - framework adapters instantiate with their component type:

- Svelte: `ComponentRegistry<typeof SvelteComponent>`
- Vue: `ComponentRegistry<DefineComponent>`
- React: `ComponentRegistry<ComponentType>`

### Error Handling

Controllers catch RPC errors, store in `lastError`, emit error events. Host can display errors without try/catch around controller methods.

### Lifecycle

connect() → subscribe(cb) → updateProps()/execute() → disconnect()
Always disconnect on unmount to prevent memory leaks.
