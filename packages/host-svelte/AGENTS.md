# @uniview/host-svelte

**Parent:** [../../AGENTS.md](../../AGENTS.md)

## OVERVIEW

Svelte 5 adapter rendering UINode trees via recursive ComponentRenderer with event proxy via use:action.

## STRUCTURE

```
src/
├── index.ts                   # Component exports
├── PluginHost.svelte          # Lifecycle manager, context provider
└── ComponentRenderer.svelte   # Recursive UINode → Svelte renderer
```

## WHERE TO LOOK

| Task              | Location                 | Notes                                    |
| ----------------- | ------------------------ | ---------------------------------------- |
| Tree rendering    | ComponentRenderer.svelte | Self-referential, handles all node types |
| Event proxy       | ComponentRenderer.svelte | attachEvents action maps handler IDs     |
| Context injection | PluginHost.svelte        | Sets controller/registry context         |

## CONVENTIONS

### Svelte 5 Runes

- `$props()` for component props
- `$state()` for local reactive state
- `$derived()` for computed values
- `$effect()` (rarely - prefers onMount/onDestroy)

### Context Pattern

PluginHost injects context keys: `uniview:controller` and `uniview:registry`. ComponentRenderer consumes via `getContext()`.

### Event Proxy via use:action

Svelte 5 can't spread event handlers. ComponentRenderer uses `attachEvents` action that:

- Maps handler IDs (`_onClickHandlerId`) to async proxy functions
- Calls `controller.execute(handlerId, args)` on event
- Provides update/destroy lifecycle for dynamic event binding

Text children are rendered as `{child}`. Unknown types show error div.

## ANTI-PATTERNS

- ❌ **NEVER** use Svelte 4 syntax (`export let`, stores) - breaks runes
- ❌ **NEVER** drop string children - must render text nodes directly
- ❌ **NEVER** render unknown types silently - show `<Unknown: {type}>`
