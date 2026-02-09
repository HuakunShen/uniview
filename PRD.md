# PRD: `@uniview/solid-renderer` — SolidJS Universal Renderer for Uniview

**Author:** Hacker  
**Date:** February 2026  
**Status:** Draft  
**Repository:** https://github.com/HuakunShen/uniview

---

## 1. Executive Summary

Uniview is a framework-agnostic plugin system that allows plugins to describe their UI as a serializable JSON tree (`UINode`) and send it to a host application for rendering. Currently, plugins are authored in React using a custom React reconciler (`@uniview/react-renderer`). However, even the simplest React plugin produces ~900KB pre-minification and ~300KB+ post-minification, because the `react` + `react-reconciler` packages must be bundled into every plugin — even though the plugin never touches the DOM.

This PRD defines a new package, `@uniview/solid-renderer`, that uses SolidJS's universal renderer (`solid-js/universal`) to achieve the same UINode output at a fraction of the bundle size (~7-15KB minified for a simple plugin). SolidJS is a compiler-based framework with no virtual DOM, fine-grained reactivity, JSX syntax (familiar to React developers), and a production-ready custom renderer API.

---

## 2. Background & Context

### 2.1 Current Architecture

Uniview is a monorepo with the following packages:

| Package | Purpose |
|---|---|
| `@uniview/protocol` | Shared types: `UINode`, `HostToPluginAPI`, `PluginToHostAPI`, `PROTOCOL_VERSION`, Zod schemas |
| `@uniview/react-renderer` | Custom React reconciler that builds in-memory `InternalNode` tree → serializes to `UINode` |
| `@uniview/runtime` | Plugin bootstrap & lifecycle (`PluginRuntime`, worker/WS entry points) |
| `@uniview/host-sdk` | Framework-agnostic host controller (`PluginController`) |
| `@uniview/host-svelte` | Svelte 5 adapter for rendering `UINode` trees in the host |

### 2.2 Current Plugin Authoring Flow (React)

1. Plugin author writes a standard React component (`App.tsx`) using hooks, state, JSX.
2. The entry point calls `startWorkerPlugin({ App })` from `@uniview/runtime`.
3. `@uniview/runtime` creates a `PluginRuntime` which:
   - Creates a `HandlerRegistry` (maps event handler functions → string IDs)
   - Creates a `RenderBridge` (pub/sub for tree updates)
   - Calls the custom React reconciler from `@uniview/react-renderer`
4. The custom reconciler implements React's `HostConfig` interface:
   - `createInstance(type, props)` → creates `InternalNode` objects (not DOM nodes)
   - `createTextInstance(text)` → creates `TextNode` objects
   - `appendChild(parent, child)` → builds the tree
   - `commitUpdate(instance, newProps)` → updates props
   - `resetAfterCommit(container)` → triggers `RenderBridge` notification
5. `serializeTree()` subscribes to `RenderBridge` and converts `InternalNode` → `UINode`:
   - Text nodes → strings
   - Non-serializable props filtered out (`children`, `key`, `ref`, functions)
   - Event handlers (`onClick`, etc.) → registered in `HandlerRegistry`, replaced with `_onClickHandlerId: "h_abc123"`
   - Validates all remaining props are JSON-serializable
   - Recursively processes children
6. The serialized `UINode` tree is sent to the host via `kkrpc` RPC: `rpc.updateTree(uiNode)`
7. Host receives tree, renders it using `ComponentRenderer.svelte` (or any framework)
8. When user interacts (clicks button), host calls `controller.execute(handlerId, args)` → RPC → plugin's `HandlerRegistry` executes the original function → React state update → new tree sent to host

### 2.3 Key Type Definitions (from `@uniview/protocol`)

```typescript
// UINode — the serializable tree format
interface UINode {
  id: string;
  type: string;          // "div", "button", "Button", "Card", etc.
  props: JSONValue;      // Only JSON-serializable values
  children: (UINode | string)[];
}

// Plugin exposes these methods to the host
interface HostToPluginAPI {
  initialize(props: JSONValue): Promise<void>;
  updateProps(props: JSONValue): Promise<void>;
  executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>;
  destroy(): Promise<void>;
}

// Host exposes these methods to the plugin
interface PluginToHostAPI {
  updateTree(tree: UINode): Promise<void>;
  log(level: LogLevel, args: JSONValue[]): Promise<void>;
}
```

### 2.4 The Bundle Size Problem

The React-based approach requires bundling into every plugin:
- `react` (~6KB min) — component model, hooks, fiber architecture
- `react-reconciler` (~280KB min) — full fiber reconciler with scheduling, concurrent features, prioritization

Total overhead: **~300KB minified** before any plugin code. This is unavoidable because the reconciler is what enables the custom rendering target.

### 2.5 Why SolidJS

SolidJS is a compiler-based reactive framework:
- **No virtual DOM**: Fine-grained reactivity, reactive primitives track dependencies at the signal level
- **JSX syntax**: Familiar to React developers, minimal learning curve
- **`solid-js/universal`**: A production-ready API (`createRenderer`) that lets you define custom rendering operations (`createElement`, `insertNode`, `setProperty`, etc.). The Solid compiler generates code that calls YOUR functions instead of DOM APIs.
- **Tiny runtime**: Solid's reactive core is ~7KB minified
- **Compiler-driven**: The Babel/Vite plugin transforms JSX at build time into optimized function calls — no runtime diffing
- **Production-proven**: Used in production apps, `solid-js/universal` shipped since v1.2

---

## 3. Goals

### 3.1 Primary Goals

1. **Create `@uniview/solid-renderer`** — a new package that uses `solid-js/universal` to produce `UINode` trees, fully compatible with the existing `@uniview/protocol` and host-side packages.
2. **Achieve ~95% bundle size reduction** — target ~10-15KB minified for a simple plugin (vs ~300KB+ with React).
3. **Full compatibility with the existing host** — the host does not need to change at all. Solid plugins produce identical `UINode` trees that are indistinguishable from React plugins.
4. **Create `@uniview/solid-runtime`** (or extend `@uniview/runtime`) — provide `startWorkerPlugin()` and `connectToHostServer()` equivalents for Solid plugins.

### 3.2 Secondary Goals

5. **Provide a migration guide** for plugin authors moving from React to Solid.
6. **Create demo plugins** (`solid-demo-plugin-simple`, `solid-demo-plugin-advanced`) mirroring the existing React demos.
7. **Maintain DX parity** — Solid plugin authoring should feel as natural as React plugin authoring.
8. **Support all existing runtime modes** — Worker mode, WebSocket mode, Main Thread mode.

### 3.3 Non-Goals

- Replacing the React renderer. React remains a supported plugin authoring option.
- Changing the `@uniview/protocol` types or the `UINode` format.
- Modifying host-side packages (`host-sdk`, `host-svelte`).
- Supporting SSR or hydration (plugins are client-only).

---

## 4. Technical Design

### 4.1 Package Structure

```
packages/
  solid-renderer/
    src/
      renderer.ts          # createRenderer() setup — the core universal renderer
      handler-registry.ts  # Reuse or fork from react-renderer's HandlerRegistry
      serialize.ts         # Convert Solid's node tree → UINode (may be simpler than React's)
      types.ts             # SolidNode, SolidTextNode internal types
      index.ts             # Public API exports
    package.json
    tsconfig.json
    AGENTS.md

  solid-runtime/           # OR extend existing runtime package
    src/
      runtime.ts           # SolidPluginRuntime — lifecycle, RPC handlers
      worker-entry.ts      # startWorkerPlugin() for Solid
      ws-client-entry.ts   # connectToHostServer() for Solid
      index.ts
    package.json
    tsconfig.json
    AGENTS.md

  solid-demo-plugin-simple/
    src/
      App.tsx              # Simple counter demo in Solid
      worker.ts            # Entry point
    package.json
    vite.config.ts

  solid-demo-plugin-advanced/
    src/
      App.tsx              # Advanced demo with multiple components, events, state
      worker.ts
    package.json
    vite.config.ts
```

### 4.2 Core: `@uniview/solid-renderer`

#### 4.2.1 The Universal Renderer

This is the heart of the package. It uses `createRenderer` from `solid-js/universal` to define how Solid's compiled output interacts with your custom node tree.

```typescript
// packages/solid-renderer/src/renderer.ts
import { createRenderer } from "solid-js/universal";
import type { UINode } from "@uniview/protocol";

// Internal node type used during rendering
interface SolidNode {
  id: string;
  type: string;
  props: Record<string, any>;
  children: (SolidNode | string)[];
  _parent?: SolidNode;
}

const handlerRegistry = new HandlerRegistry();
let nodeIdCounter = 0;

function generateId(): string {
  return `s_${nodeIdCounter++}`;
}

export const {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  use,
} = createRenderer<SolidNode | string>({

  createElement(type: string): SolidNode {
    return {
      id: generateId(),
      type,
      props: {},
      children: [],
    };
  },

  createTextNode(value: string): string {
    return value;
  },

  replaceText(textNode: string, value: string): string {
    // Solid handles text reactively — this needs careful implementation
    // since strings are immutable, we need a wrapper or parent update
    return value;
  },

  setProperty(node: SolidNode, name: string, value: any): void {
    if (typeof node === "string") return;

    if (typeof value === "function" && name.startsWith("on")) {
      // Register handler, store handler ID
      const handlerId = handlerRegistry.register(value);
      const eventName = name.charAt(2).toLowerCase() + name.slice(3);
      node.props[`_on${name.slice(2)}HandlerId`] = handlerId;
    } else if (isSerializable(value)) {
      node.props[name] = value;
    }
    // Non-serializable, non-function props are dropped (same as React renderer)
  },

  insertNode(parent: SolidNode, node: SolidNode | string, anchor?: SolidNode | string): void {
    if (typeof parent === "string") return;

    if (anchor != null) {
      const index = parent.children.indexOf(anchor);
      if (index >= 0) {
        parent.children.splice(index, 0, node);
      } else {
        parent.children.push(node);
      }
    } else {
      parent.children.push(node);
    }

    if (typeof node !== "string") {
      node._parent = parent;
    }
  },

  isTextNode(node: SolidNode | string): boolean {
    return typeof node === "string";
  },

  removeNode(parent: SolidNode, node: SolidNode | string): void {
    if (typeof parent === "string") return;
    const index = parent.children.indexOf(node);
    if (index >= 0) {
      parent.children.splice(index, 1);
    }
  },

  getParentNode(node: SolidNode): SolidNode | undefined {
    if (typeof node === "string") return undefined;
    return node._parent;
  },

  getFirstChild(node: SolidNode): SolidNode | string | undefined {
    if (typeof node === "string") return undefined;
    return node.children[0];
  },

  getNextSibling(node: SolidNode | string): SolidNode | string | undefined {
    if (typeof node === "string") return undefined;
    const parent = node._parent;
    if (!parent) return undefined;
    const index = parent.children.indexOf(node);
    return parent.children[index + 1];
  },
});
```

#### 4.2.2 Serialization

The Solid renderer builds `SolidNode` objects in memory. These need to be serialized to `UINode` before sending to the host. This is simpler than the React version because:
- No need to handle React-specific props (`key`, `ref`, `children` as prop)
- No need to traverse a fiber tree
- The `SolidNode` structure is already very close to `UINode`

```typescript
// packages/solid-renderer/src/serialize.ts
import type { UINode } from "@uniview/protocol";

export function serializeTree(node: SolidNode): UINode {
  return {
    id: node.id,
    type: node.type,
    props: sanitizeProps(node.props),
    children: node.children.map(child =>
      typeof child === "string" ? child : serializeTree(child)
    ),
  };
}

function sanitizeProps(props: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== "function" && isJsonSerializable(value)) {
      clean[key] = value;
    }
  }
  return clean;
}
```

#### 4.2.3 Handler Registry

Reuse or fork the existing `HandlerRegistry` from `@uniview/react-renderer`. The interface is identical:

```typescript
class HandlerRegistry {
  private handlers: Map<string, Function> = new Map();
  private counter = 0;

  register(fn: Function): string {
    const id = `h_${this.counter++}`;
    this.handlers.set(id, fn);
    return id;
  }

  execute(id: string, args: any[]): any {
    const handler = this.handlers.get(id);
    if (!handler) throw new Error(`Handler ${id} not found`);
    return handler(...args);
  }

  clear(): void {
    this.handlers.clear();
    this.counter = 0;
  }
}
```

**Important consideration:** The HandlerRegistry from react-renderer is coupled to the serialization step. In Solid, handlers are registered in `setProperty` (not during a separate serialization pass), so the flow is slightly different. The registry should be a shared singleton within the renderer module.

#### 4.2.4 Reactive Tree Updates

This is the key architectural challenge. In the React renderer, the flow is:

```
React state change → reconciler rebuilds InternalNode tree → resetAfterCommit → RenderBridge notifies → serializeTree() → updateTree(UINode)
```

In Solid, there is no reconciler commit cycle. Solid's reactivity is fine-grained: when a signal changes, only the specific `setProperty` or `insertNode` calls that depend on it are re-executed. There is no "full tree rebuild."

**Two approaches:**

**Approach A: Full Tree Serialization on Every Change (Simpler, Recommended for v1)**

After every reactive update, serialize the entire root `SolidNode` tree and send it to the host. This matches the current React behavior (which also sends full trees). Use `queueMicrotask` or `requestAnimationFrame` to batch multiple synchronous updates into a single `updateTree` call.

```typescript
let pendingUpdate = false;
let rootNode: SolidNode;

function scheduleUpdate() {
  if (pendingUpdate) return;
  pendingUpdate = true;
  queueMicrotask(() => {
    pendingUpdate = false;
    const tree = serializeTree(rootNode);
    hostApi.updateTree(tree);
  });
}

// Hook into renderer — after any mutation, schedule an update
// Override insertNode, removeNode, setProperty to call scheduleUpdate()
```

**Approach B: Incremental Diffs (Future Optimization)**

Instead of sending full trees, send only the mutations (insert, remove, setProp). This would require protocol changes and is out of scope for v1, but worth designing with it in mind.

### 4.3 Solid Runtime: `@uniview/solid-runtime`

This is the equivalent of `@uniview/runtime` but for Solid plugins. It may be a separate package or integrated into the existing runtime with a Solid-specific entry point.

#### 4.3.1 SolidPluginRuntime

```typescript
// packages/solid-runtime/src/runtime.ts
import { render } from "@uniview/solid-renderer";
import type { HostToPluginAPI, PluginToHostAPI, UINode } from "@uniview/protocol";

export class SolidPluginRuntime {
  private handlerRegistry: HandlerRegistry;
  private rootNode: SolidNode;
  private dispose?: () => void;
  private hostApi: PluginToHostAPI;

  constructor(hostApi: PluginToHostAPI) {
    this.hostApi = hostApi;
    this.handlerRegistry = getHandlerRegistry(); // from renderer module
    this.rootNode = { id: "root", type: "root", props: {}, children: [] };
  }

  // Called by host via RPC
  async initialize(AppComponent: any, props: JSONValue): Promise<void> {
    // Solid's render() returns a dispose function
    this.dispose = render(
      () => createComponent(AppComponent, props || {}),
      this.rootNode
    );

    // Initial tree send
    const tree = serializeTree(this.rootNode);
    await this.hostApi.updateTree(tree);
  }

  async executeHandler(handlerId: string, args: JSONValue[]): Promise<void> {
    const result = this.handlerRegistry.execute(handlerId, args);
    // After handler execution, Solid's reactivity will trigger updates
    // which will be batched and sent via scheduleUpdate()
  }

  async destroy(): Promise<void> {
    this.dispose?.();
    this.handlerRegistry.clear();
  }

  // Expose as HostToPluginAPI
  getApi(): HostToPluginAPI {
    return {
      initialize: (props) => this.initialize(/* AppComponent passed separately */, props),
      updateProps: (props) => { /* update signals */ },
      executeHandler: (id, args) => this.executeHandler(id, args),
      destroy: () => this.destroy(),
    };
  }
}
```

#### 4.3.2 Worker Entry Point

```typescript
// packages/solid-runtime/src/worker-entry.ts
import { RPCChannel, WorkerChildIO } from "kkrpc";
import { SolidPluginRuntime } from "./runtime";
import type { HostToPluginAPI, PluginToHostAPI } from "@uniview/protocol";

export function startWorkerPlugin(Components: Record<string, any>) {
  const io = new WorkerChildIO();
  const channel = new RPCChannel<HostToPluginAPI, PluginToHostAPI>(io);

  let runtime: SolidPluginRuntime;

  channel.expose({
    async initialize(props) {
      const AppComponent = Components.App || Object.values(Components)[0];
      runtime = new SolidPluginRuntime(channel.getApi());
      await runtime.initialize(AppComponent, props);
    },
    async updateProps(props) {
      // Forward to runtime
    },
    async executeHandler(handlerId, args) {
      await runtime.executeHandler(handlerId, args);
    },
    async destroy() {
      await runtime.destroy();
    },
  } satisfies HostToPluginAPI);
}
```

### 4.4 Build Configuration

Solid plugins require the Solid compiler (Babel preset or Vite plugin) configured in `universal` mode:

```typescript
// vite.config.ts for a Solid plugin
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [
    solidPlugin({
      solid: {
        moduleName: "@uniview/solid-renderer",  // Import renderer from our package
        generate: "universal",                   // Use universal output (not DOM)
      },
    }),
  ],
  build: {
    lib: {
      entry: "src/worker.ts",
      formats: ["es"],
    },
    rollupOptions: {
      // Do NOT externalize solid-js — it must be bundled into the plugin
      // But it's tiny (~7KB) so this is fine
    },
  },
});
```

**Critical:** The `moduleName` option tells the Solid compiler to import `createElement`, `insertNode`, `setProp`, etc. from `@uniview/solid-renderer` instead of `solid-js/web`. This is how the custom renderer is wired up.

The `@uniview/solid-renderer` package must export all the named exports that `solid-js/universal`'s `createRenderer` returns:
- `render`, `effect`, `memo`, `createComponent`, `createElement`, `createTextNode`, `insertNode`, `insert`, `spread`, `setProp`, `mergeProps`, `use`

Plus it should re-export Solid's control flow components for auto-import:
```typescript
// packages/solid-renderer/src/index.ts
export { render, effect, memo, createComponent, createElement, ... } from "./renderer";
export { For, Show, Switch, Match, Index, ErrorBoundary } from "solid-js";
export { createSignal, createEffect, createMemo, onMount, onCleanup } from "solid-js";
```

### 4.5 Plugin Author Experience

A Solid plugin should look almost identical to a React plugin:

```tsx
// src/App.tsx (Solid plugin)
import { createSignal } from "solid-js";

export default function App() {
  const [count, setCount] = createSignal(0);

  return (
    <div className="p-4">
      <p>Count: {count()}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}
```

```typescript
// src/worker.ts
import { startWorkerPlugin } from "@uniview/solid-runtime";
import App from "./App";

startWorkerPlugin({ App });
```

Key differences from React for plugin authors:
- `createSignal` instead of `useState` (signals are read with `count()` not `count`)
- `createEffect` instead of `useEffect`
- `createMemo` instead of `useMemo`
- `<Show when={...}>` instead of `{condition && <Component />}`
- `<For each={list}>` instead of `{list.map(...)}`
- No `useCallback` / `useMemo` needed (Solid is reactive by default)
- Props are accessed as `props.name` not destructured (destructuring breaks reactivity)

### 4.6 Text Node Handling

Solid's universal renderer passes text as primitive strings to `createTextNode`. Since strings are immutable in JavaScript, the `replaceText` callback needs special handling. Two options:

**Option A: Wrapper Object**
```typescript
interface SolidTextNode {
  _type: "text";
  value: string;
}

// In createTextNode:
createTextNode(value: string): SolidTextNode {
  return { _type: "text", value };
}

// In replaceText:
replaceText(node: SolidTextNode, value: string): void {
  node.value = value;
  scheduleUpdate();
}

// In isTextNode:
isTextNode(node: any): boolean {
  return node?._type === "text";
}

// In serializeTree, convert SolidTextNode → string for UINode.children
```

**Option B: Parent-level Update**
Track text nodes by their parent and index, update the parent's children array directly.

**Recommendation:** Option A (wrapper object) is cleaner and more explicit.

### 4.7 Handler ID Cleanup

In the React renderer, `HandlerRegistry` can grow unboundedly because handler IDs are generated on every serialize pass. With Solid's fine-grained approach, handlers are registered in `setProperty`, which is called only when a prop actually changes.

However, stale handlers need cleanup. Options:
- **Generation-based cleanup:** Increment a generation counter on each `scheduleUpdate`, mark handlers with their generation, and prune old ones.
- **WeakRef-based cleanup:** Store handlers as WeakRefs if possible.
- **Clear-and-rebuild on full serialize:** Before each full tree serialization, clear the registry and re-register all handlers found in the tree. (Simplest for v1, matches React behavior.)

**Recommendation for v1:** Clear-and-rebuild. When `scheduleUpdate` fires, walk the tree, re-register all function props, then serialize. This ensures the registry stays in sync.

---

## 5. Shared Code & Refactoring

### 5.1 Extract `HandlerRegistry` to `@uniview/protocol` or a Shared Package

The `HandlerRegistry` is identical between React and Solid renderers. It should be extracted to a shared location:
- Option A: Move to `@uniview/protocol` (it's a pure data structure, no framework deps)
- Option B: Create `@uniview/renderer-shared` for code shared between renderers

### 5.2 Runtime Abstraction

The `PluginRuntime` logic (RPC setup, lifecycle methods, worker bootstrap) is largely framework-agnostic. Consider:
- Making `@uniview/runtime` accept a generic renderer adapter
- Or keeping `@uniview/solid-runtime` as a separate thin package that delegates to shared runtime logic

### 5.3 Re-export Strategy from `@uniview/solid-renderer`

The Solid compiler's `moduleName` option expects ALL rendering primitives to be importable from a single module. The `@uniview/solid-renderer` must re-export:

1. All `createRenderer` results (render, createElement, insertNode, etc.)
2. Solid's control flow (`For`, `Show`, `Switch`, `Match`, `Index`, `ErrorBoundary`)
3. Solid's reactive primitives (`createSignal`, `createEffect`, `createMemo`, `onMount`, `onCleanup`, `batch`, `untrack`)

This is because when `generate: "universal"` is set, the compiler rewrites JSX to import from `moduleName`. Plugin authors should also be able to `import { createSignal } from "@uniview/solid-renderer"` for convenience, though they can also import directly from `solid-js`.

---

## 6. Testing Strategy

### 6.1 Unit Tests

| Test | Description |
|---|---|
| `createElement` | Verify it creates a `SolidNode` with correct id, type, empty props/children |
| `createTextNode` | Verify it creates a text wrapper with correct value |
| `setProperty` (regular) | Verify serializable props are stored on the node |
| `setProperty` (handler) | Verify function props are registered in HandlerRegistry and replaced with handler IDs |
| `setProperty` (non-serializable) | Verify non-serializable, non-function props are dropped |
| `insertNode` | Verify children ordering, anchor-based insertion |
| `removeNode` | Verify child is removed from parent |
| `replaceText` | Verify text node value is updated |
| `serializeTree` | Verify full tree → UINode conversion, including nested children, text nodes, handler IDs |
| `HandlerRegistry` | Verify register, execute, clear operations |
| `scheduleUpdate` batching | Verify multiple synchronous changes result in a single `updateTree` call |

### 6.2 Integration Tests

| Test | Description |
|---|---|
| Simple counter plugin | Verify the full flow: Solid component → UINode → host rendering → click → handler execution → re-render |
| Props update | Verify host can update plugin props and the tree re-renders |
| Conditional rendering (`<Show>`) | Verify conditional blocks produce correct UINode when toggled |
| List rendering (`<For>`) | Verify dynamic lists produce correct UINode with proper keying |
| Lifecycle (`onMount`, `onCleanup`) | Verify lifecycle hooks fire correctly in the plugin runtime |
| Worker mode | Verify full RPC round-trip in a Web Worker |
| WebSocket mode | Verify full RPC round-trip over WebSocket |
| Destroy/cleanup | Verify all resources are freed and handlers cleared |

### 6.3 Bundle Size Benchmarks

| Benchmark | Target |
|---|---|
| Simple counter plugin (minified) | < 15KB |
| Simple counter plugin (minified + gzipped) | < 5KB |
| Advanced plugin with multiple components | < 25KB |
| Comparison vs React equivalent | > 90% reduction |

Run bundle analysis with `vite-bundle-visualizer` or `rollup-plugin-visualizer` on each demo plugin.

### 6.4 Compatibility Tests

Verify that UINode output from Solid plugins is byte-for-byte structurally compatible with UINode output from React plugins:
- Same `id`, `type`, `props`, `children` structure
- Same handler ID format (`_on{Event}HandlerId`)
- Same prop filtering rules (no functions, no non-serializable values)
- Host-side `ComponentRenderer.svelte` renders Solid plugin output identically

---

## 7. Milestones & Implementation Order

### Phase 1: Core Renderer (Week 1-2)

- [ ] Create `packages/solid-renderer/` package scaffold
- [ ] Implement `createRenderer` with all universal renderer methods
- [ ] Implement `SolidTextNode` wrapper for text handling
- [ ] Implement `HandlerRegistry` (fork from react-renderer or extract shared)
- [ ] Implement `serializeTree()` for `SolidNode` → `UINode`
- [ ] Implement `scheduleUpdate()` with microtask batching
- [ ] Set up re-exports (Solid primitives + control flow)
- [ ] Unit tests for all renderer methods and serialization

### Phase 2: Runtime & Worker Entry (Week 2-3)

- [ ] Create `packages/solid-runtime/` package scaffold (or extend `@uniview/runtime`)
- [ ] Implement `SolidPluginRuntime` with full lifecycle
- [ ] Implement `startWorkerPlugin()` for Solid
- [ ] Implement WebSocket client entry for Solid
- [ ] Wire up `scheduleUpdate()` → `hostApi.updateTree()` pipeline
- [ ] Wire up `executeHandler()` → `HandlerRegistry.execute()` → reactive update pipeline
- [ ] Integration test: full round-trip in Worker mode

### Phase 3: Demo Plugins & Build Config (Week 3-4)

- [ ] Create `packages/solid-demo-plugin-simple/` (counter)
- [ ] Create `packages/solid-demo-plugin-advanced/` (multiple components, lists, conditionals)
- [ ] Validate Vite config with `vite-plugin-solid` in universal mode
- [ ] Bundle size benchmarking
- [ ] Verify output renders correctly in the Svelte host demo
- [ ] Verify both React and Solid plugins can run simultaneously in the same host

### Phase 4: Documentation & Polish (Week 4)

- [ ] Write `AGENTS.md` for both new packages
- [ ] Write plugin authoring guide (Solid vs React comparison)
- [ ] Update root README with Solid as a supported plugin framework
- [ ] Update docs site if applicable
- [ ] Add bundle size badge/comparison to README

---

## 8. Open Questions & Risks

### 8.1 Open Questions

1. **Text node reactivity:** Solid's `replaceText` receives the old text node and new value. Since UINode children are `(UINode | string)[]`, how do we update a string in-place in the parent's children array? The wrapper object approach (Section 4.6 Option A) seems cleanest but needs validation.

2. **Handler cleanup strategy:** Should we clear-and-rebuild the entire HandlerRegistry on each tree serialization, or use incremental tracking? Clear-and-rebuild is simpler but means handler IDs change on every update, which could cause issues if the host caches handler IDs.

3. **`spread` implementation:** Solid's `spread` is used for `<div {...dynamicProps}>`. In the universal renderer, this calls `spread(node, accessor)` where `accessor` returns the props object. We need to handle this correctly, especially for reactive prop objects.

4. **Separate package vs. extended runtime:** Should `solid-runtime` be a new package or should `@uniview/runtime` be made framework-agnostic with renderer-specific adapters? Separate package is simpler for v1; unification can happen later.

5. **Re-export versioning:** If `@uniview/solid-renderer` re-exports from `solid-js`, we need to pin the Solid version carefully. Breaking changes in Solid's API would break the renderer.

### 8.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Solid's universal renderer has edge cases not covered by React renderer | Medium | Medium | Extensive testing with complex component trees |
| Handler ID instability between updates | Low | High | Design handler registry to produce stable IDs when possible |
| Solid compiler output changes in future versions | Low | Medium | Pin `solid-js` and `vite-plugin-solid` versions |
| Plugin authors find Solid DX unfamiliar | Medium | Low | Provide comprehensive migration guide and side-by-side examples |
| `scheduleUpdate` batching misses some reactive updates | Medium | High | Test with rapid successive state changes, ensure all mutations trigger serialization |

---

## 9. Success Criteria

1. **Bundle size:** Simple Solid plugin < 15KB minified (vs ~300KB React)
2. **Compatibility:** Solid plugins render identically to React plugins in the same host
3. **Feature parity:** All React plugin capabilities (state, events, conditional rendering, lists, lifecycle) work in Solid plugins
4. **Runtime modes:** Worker and WebSocket modes both work
5. **No host changes:** Existing `@uniview/host-sdk` and `@uniview/host-svelte` work unchanged
6. **Demo plugins:** Both simple and advanced demos pass all integration tests

---

## 10. Appendix

### A. SolidJS Universal Renderer API Reference

From `solid-js/universal`, `createRenderer<T>()` accepts:

```typescript
interface RendererOptions<T> {
  createElement(type: string): T;
  createTextNode(value: string): T;
  replaceText(node: T, value: string): void;
  setProperty(node: T, name: string, value: any, prev?: any): void;
  insertNode(parent: T, node: T, anchor?: T): void;
  isTextNode(node: T): boolean;
  removeNode(parent: T, node: T): void;
  getParentNode(node: T): T | undefined;
  getFirstChild(node: T): T | undefined;
  getNextSibling(node: T): T | undefined;
}
```

Returns: `{ render, effect, memo, createComponent, createElement, createTextNode, insertNode, insert, spread, setProp, mergeProps, use }`

### B. React vs Solid: Plugin Author Quick Reference

| Concept | React | Solid |
|---|---|---|
| State | `const [x, setX] = useState(0)` | `const [x, setX] = createSignal(0)` |
| Read state | `{x}` | `{x()}` (signals are functions) |
| Side effect | `useEffect(() => { ... }, [dep])` | `createEffect(() => { ... })` (auto-tracks) |
| Computed | `const x = useMemo(() => ..., [dep])` | `const x = createMemo(() => ...)` |
| Conditional | `{show && <Comp />}` | `<Show when={show()}><Comp /></Show>` |
| List | `{items.map(i => <Item key={i.id} />)}` | `<For each={items()}>{(item) => <Item />}</For>` |
| Mount | `useEffect(() => { ... }, [])` | `onMount(() => { ... })` |
| Cleanup | `useEffect(() => () => cleanup, [])` | `onCleanup(() => { ... })` |
| Props | `function Comp({ name, age })` | `function Comp(props) { props.name }` |
| Memoization | `React.memo`, `useCallback` | Not needed (fine-grained by default) |

### C. Relevant Source Files in Current Codebase

| File | Purpose |
|---|---|
| `packages/protocol/src/tree.ts` | `UINode` type definition |
| `packages/protocol/src/rpc.ts` | `HostToPluginAPI`, `PluginToHostAPI` interfaces |
| `packages/protocol/src/version.ts` | `PROTOCOL_VERSION` |
| `packages/react-renderer/src/reconciler/host-config.ts` | React HostConfig implementation (reference) |
| `packages/react-renderer/src/reconciler/renderer.ts` | React renderer + RenderBridge (reference) |
| `packages/react-renderer/src/serialization/serialize.ts` | `serializeTree()` for React (reference) |
| `packages/react-renderer/src/serialization/handler-registry.ts` | HandlerRegistry (reuse/fork) |
| `packages/runtime/src/runtime.ts` | PluginRuntime (reference for lifecycle) |
| `packages/runtime/src/worker-entry.ts` | `startWorkerPlugin()` (reference) |
| `packages/host-svelte/src/lib/ComponentRenderer.svelte` | Host-side renderer (should work unchanged) |

### D. External References

- [SolidJS Universal Renderer docs](https://github.com/solidjs/solid/tree/main/packages/solid/universal)
- [SolidJS Universal Renderer release notes (v1.2)](https://github.com/solidjs/solid/releases/tag/v1.2.0)
- [Custom Renderer tutorial (This Dot Labs)](https://www.thisdot.co/blog/how-to-create-your-own-custom-renderer-in-solidjs)
- [Solid Universal Renderer Template](https://github.com/whoisryosuke/solid-universal-renderer-template)
- [vite-plugin-solid](https://github.com/solidjs/vite-plugin-solid) — required for build config
- [babel-preset-solid](https://github.com/solidjs/solid/tree/main/packages/babel-preset-solid) — `moduleName` and `generate` options
