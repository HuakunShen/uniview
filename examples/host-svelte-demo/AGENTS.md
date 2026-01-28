# host-svelte-demo - PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-28T02:00:00Z
**Commit:** 45adfe3e0d0c1993b182d3d707bbffaced01b1b1
**Branch:** main

## OVERVIEW

Full-stack SvelteKit demo with Elysia WebSocket bridge multiplexer supporting Worker, Node.js, and main-thread runtime modes.

## WHERE TO LOOK

| Task                  | Location                             | Notes                                |
| --------------------- | ------------------------------------ | ------------------------------------ |
| Bridge server         | `server/index.ts`                    | Elysia WebSocket multiplexer         |
| Plugin host UI        | `src/routes/+page.svelte`            | Mode switching, PluginHost rendering |
| Component adapters    | `src/lib/components/plugin/*.svelte` | PluginButton, PluginInput wrappers   |
| Plugin client scripts | `../plugin-example/dist/*.worker.js` | Served via bridge GET endpoint       |

## CONVENTIONS

### Development Workflow

- **One-command startup**: `pnpm dev:all` runs bridge + plugins + SvelteKit in parallel via `run-p`
- **Bridge port**: Fixed at `:3000` - single multiplexer for all WebSocket traffic
- **Plugin URLs**: Worker plugins served from `http://localhost:3000/:filename` (bridge GET endpoint)
- **Controller lifecycle**: Created via `$derived`, cleaned up via `$effect` on mode/demo change

### Bridge Protocol

- **Plugin endpoint**: `/plugins/:pluginId` - plugins connect as clients
- **Host endpoint**: `/host/:pluginId` - hosts connect after plugin is ready
- **Message forwarding**: Transparent byte forwarding preserves kkrpc protocol (no parsing)
- **Connection state**: `Map<string, {pluginWs?, hostWs?}>` tracks per-plugin pairs

### Component Adaptation

Plugin primitives → Svelte components via `createComponentRegistry()`:

```typescript
registry.register('Button', PluginButton);
registry.register('Input', PluginInput);
```

## ANTI-PATTERNS

- ❌ **NEVER** bypass bridge - ALL WebSocket traffic (host ↔ plugin) must flow through `:3000`
- ❌ **NEVER** hardcode bridge URLs in plugin code - use `connectToHostServer()` from `@uniview/runtime`
- ❌ **NEVER** spawn separate servers per plugin - multiplex through single bridge port
- ❌ **NEVER** forget `controller.disconnect()` - leaks connections on mode switch
