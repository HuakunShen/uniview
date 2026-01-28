# @uniview/example-host-react

**Parent:** [../../AGENTS.md](../../AGENTS.md)

## OVERVIEW

Full React 19 host implementation demonstrating proper plugin lifecycle management, custom component rendering, and shadcn/ui integration.

## STRUCTURE

```
src/
├── lib/
│   ├── plugin/             # Core plugin rendering logic
│   │   ├── PluginHost.tsx  # Lifecycle & context provider
│   │   ├── ComponentRenderer.tsx # Recursive UINode renderer
│   │   └── PluginContext.ts # React Context for controller/registry
│   └── components/
│       ├── plugin/         # Plugin-ready wrapper components
│       └── ui/             # shadcn/ui base components
└── App.tsx                 # Main application & controller setup
```

## WHERE TO LOOK

| Task              | Location                           | Notes                                          |
| ----------------- | ---------------------------------- | ---------------------------------------------- |
| Plugin Lifecycle  | `App.tsx`                          | Controller creation via useEffect+useRef       |
| Tree Rendering    | `lib/plugin/ComponentRenderer.tsx` | Recursive renderer, event proxying             |
| Context Provider  | `lib/plugin/PluginHost.tsx`        | Injects controller/registry via Context        |
| Plugin Components | `lib/components/plugin/`           | Adapters mapping plugin props to UI components |

## CONVENTIONS

### Controller Lifecycle

Use `useEffect` + `useRef` pattern to manage `PluginController` lifecycle. **DO NOT** use `useMemo` as it creates the new controller before cleaning up the old one, causing duplicate connections in Node.js mode.

```typescript
useEffect(() => {
  controllerRef.current?.disconnect(); // Cleanup old first
  const newController = createWorkerController(...);
  controllerRef.current = newController;
  // ...
  return () => {
    newController.disconnect();
  };
}, [deps]);
```

### Component Renderer

Recursive component that handles:

1. **Layout Tags**: Renders native HTML elements (`div`, `span`, etc.)
2. **Custom Components**: Looks up `type` in `ComponentRegistry`
3. **Event Proxy**: Maps handler IDs (`_onClickHandlerId`) to async functions executing RPC calls
4. **Void Elements**: Handles self-closing tags (`br`, `input`, etc.) special case

### Event Handling

Events are proxied via `createHandler`:

```typescript
function createHandler(handlerId: string) {
  return async (...args: unknown[]) => {
    await controller.execute(handlerId, args);
  };
}
```

**Avoid passing `e.nativeEvent`** or circular structures to `execute()`.

## ANTI-PATTERNS

- ❌ **NEVER** use `useMemo` for controller creation - causes race conditions
- ❌ **NEVER** pass full React SyntheticEvents over RPC - extracting values is okay, passing event object is not
- ❌ **NEVER** forget to include `PluginContext` - components need access to controller
