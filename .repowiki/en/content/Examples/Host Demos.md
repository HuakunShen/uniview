# Host Demos

<cite>
**Referenced Files in This Document**
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L15-L352)
- [examples/host-svelte-demo/package.json](file://examples/host-svelte-demo/package.json#L6-L53)
- [examples/host-react-demo/src/App.tsx](file://examples/host-react-demo/src/App.tsx#L24-L120)
- [examples/host-vue-demo/src/App.vue](file://examples/host-vue-demo/src/App.vue#L19-L110)
- [packages/host-svelte/src/PluginHost.svelte](file://packages/host-svelte/src/PluginHost.svelte#L1-L51)
- [README.md](file://README.md#L41-L134)
</cite>

## Table of Contents

1. [Svelte Host Demo](#svelte-host-demo)
2. [React Host Demo](#react-host-demo)
3. [Vue Host Demo](#vue-host-demo)
4. [Native and Terminal Demos](#native-and-terminal-demos)

## Svelte Host Demo

The Svelte demo is the primary full-stack demo. It supports React and Solid plugins, simple/advanced/benchmark demos, Worker/main-thread/Node server runtime modes, full/incremental update modes, URL query synchronization, custom plugin component registration, explicit tree resync, and keyed `PluginHost` remounts when the scenario changes.

```mermaid
graph TD
    Dev[pnpm dev] --> Bridge[bridge-server]
    Dev --> Build[React/Solid plugin builds]
    Dev --> Clients[React/Solid plugin clients]
    Dev --> Host[SvelteKit/Vite host]
    Host --> Registry[Button/Input/Switch/Toggle registry]
    Host --> Controller[Worker/WebSocket/Main controller]
    Controller --> PluginHost[PluginHost]
```

**Diagram sources**

- [examples/host-svelte-demo/package.json](file://examples/host-svelte-demo/package.json#L6-L20)
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L63-L138)
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L178-L309)

**Section sources**

- [examples/host-svelte-demo/package.json](file://examples/host-svelte-demo/package.json#L6-L53)
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L15-L138)
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L178-L352)
- [packages/host-svelte/src/PluginHost.svelte](file://packages/host-svelte/src/PluginHost.svelte#L1-L51)

## React Host Demo

The React demo shows how to implement a host adapter directly in React using the framework-agnostic host SDK. Controller lifecycle is managed with `useEffect` and `useRef`, registries are memoized, and runtime mode switches disconnect the previous controller before replacing it.

**Section sources**

- [examples/host-react-demo/src/App.tsx](file://examples/host-react-demo/src/App.tsx#L24-L76)
- [examples/host-react-demo/src/App.tsx](file://examples/host-react-demo/src/App.tsx#L94-L120)

## Vue Host Demo

The Vue demo uses Composition API state, computed controller configuration, and a watcher to disconnect old controllers. It demonstrates the same Worker/WebSocket/main-thread modes for React plugins using Vue's component and render-function ecosystem.

**Section sources**

- [examples/host-vue-demo/src/App.vue](file://examples/host-vue-demo/src/App.vue#L19-L70)
- [examples/host-vue-demo/src/App.vue](file://examples/host-vue-demo/src/App.vue#L88-L110)

## Native and Terminal Demos

The README also documents native macOS SwiftUI/AppKit demos that consume bridge traffic and a terminal UI demo that renders React to a terminal target. These are examples of host portability beyond browser frameworks.

**Section sources**

- [README.md](file://README.md#L92-L134)
