# @uniview/example-host-vue

**Parent:** [../../AGENTS.md](../../AGENTS.md)

## OVERVIEW

Full Vue 3 host implementation demonstrating proper plugin lifecycle management, custom component rendering, and shadcn-vue integration.

## STRUCTURE

```
src/
├── lib/
│   ├── plugin/             # Core plugin rendering logic
│   │   ├── PluginHost.vue  # Lifecycle & context provider
│   │   ├── ComponentRenderer.vue # Recursive UINode renderer (render function)
│   │   └── usePluginContext.ts # Composition API context hook
│   └── components/
│       ├── plugin/         # Plugin-ready wrapper components
│       └── ui/             # shadcn-vue base components
└── App.vue                 # Main application & controller setup
```

## WHERE TO LOOK

| Task              | Location                           | Notes                                          |
| ----------------- | ---------------------------------- | ---------------------------------------------- |
| Plugin Lifecycle  | `App.vue`                          | Controller creation via watch/onUnmounted      |
| Tree Rendering    | `lib/plugin/ComponentRenderer.vue` | Recursive `h()` render function                |
| Context Provider  | `lib/plugin/PluginHost.vue`        | Provides controller/registry via `provide()`   |
| Plugin Components | `lib/components/plugin/`           | Adapters mapping plugin props to UI components |

## CONVENTIONS

### Component Rendering

Uses Vue's `h()` render function instead of template recursion for better control over dynamic components and layout tags:

```typescript
function renderNode(node: UINode | string): VNode | string {
  // ...
  if (type === "button") {
    return h("button", { ...p.attrs, onClick: p.onClick }, renderChildren());
  }
  // ...
  return h(RegisteredComponent, componentProps, {
    default: () => renderChildren(), // Slot for children
  });
}
```

### State Management (reka-ui v2)

Components use **Controlled Mode** with `computed` + event handlers, NOT `v-model` with watchers.
Using local ref watchers creates infinite feedback loops.

**Correct Pattern:**

```vue
<script setup>
const checkedState = computed(() => props.checked ?? false);
const handleUpdate = (v) => props.onChange?.(v);
</script>
<Switch :model-value="checkedState" @update:model-value="handleUpdate" />
```

### Context Injection

Uses `provide()` with reactive getters to handle controller swaps:

```typescript
provide(PluginContextKey, {
  get controller() {
    return props.controller;
  },
  get registry() {
    return props.registry;
  },
});
```

## ANTI-PATTERNS

- ❌ **NEVER** use `v-model` with watchers for plugin props - causes feedback loops
- ❌ **NEVER** rely on template recursion for unknown depths - use `h()`
- ❌ **NEVER** assume props are reactive without `toRef`/`computed` in Composition API
