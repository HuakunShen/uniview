# Plugin Examples

<cite>
**Referenced Files in This Document**
- [examples/plugin-api/src/index.ts](file://examples/plugin-api/src/index.ts#L1-L11)
- [examples/plugin-api/src/components/Button.tsx](file://examples/plugin-api/src/components/Button.tsx#L1-L32)
- [examples/plugin-api/src/components/Input.tsx](file://examples/plugin-api/src/components/Input.tsx#L1-L38)
- [examples/plugin-example/package.json](file://examples/plugin-example/package.json#L12-L34)
- [examples/plugin-example/build.ts](file://examples/plugin-example/build.ts#L3-L103)
- [examples/plugin-example/src/simple-demo.tsx](file://examples/plugin-example/src/simple-demo.tsx#L1-L77)
- [examples/plugin-example/src/benchmark.tsx](file://examples/plugin-example/src/benchmark.tsx#L75-L176)
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L63-L234)
- [examples/plugin-solid-example/build.ts](file://examples/plugin-solid-example/build.ts#L1-L115)
- [examples/plugin-solid-example/package.json](file://examples/plugin-solid-example/package.json#L7-L29)
</cite>

## Table of Contents

1. [Plugin API Packages](#plugin-api-packages)
2. [React Plugin Example](#react-plugin-example)
3. [Solid Plugin Example](#solid-plugin-example)
4. [Benchmark Plugins](#benchmark-plugins)

## Plugin API Packages

`examples/plugin-api` exports React primitives that intentionally render custom element type names such as `Button` and `Input`. These names cross the protocol boundary and are resolved by host registries. The primitives keep product-specific component concepts out of `@uniview/protocol` while still giving plugin authors ergonomic component APIs. A new `raycast.tsx` module provides Raycast-style primitives including `List`, `Grid`, `Detail`, `Form`, `ActionPanel`, and `CommandPalette`.

**Section sources**

- [examples/plugin-api/src/index.ts](file://examples/plugin-api/src/index.ts#L1-L11)
- [examples/plugin-api/src/components/Button.tsx](file://examples/plugin-api/src/components/Button.tsx#L1-L32)
- [examples/plugin-api/src/components/Input.tsx](file://examples/plugin-api/src/components/Input.tsx#L1-L38)
- [examples/plugin-api/src/raycast.tsx](file://examples/plugin-api/src/raycast.tsx#L1-L671)

## React Plugin Example

`examples/plugin-example` builds both browser Worker bundles and Bun-compatible WebSocket client bundles. The simple demo uses React state and plugin API `Button`/`Input` components; worker entries call `startWorkerPlugin`, while client entries call the runtime bridge client. New demo variants include clipboard-history, detail, form, grid, and raycast demos that showcase Raycast-style UI patterns. Worker/server/client entry points follow the `.worker.ts`/`.client.ts`/`.tsx` naming convention.

**Section sources**

- [examples/plugin-example/package.json](file://examples/plugin-example/package.json#L12-L34)
- [examples/plugin-example/build.ts](file://examples/plugin-example/build.ts#L3-L47)
- [examples/plugin-example/src/simple-demo.tsx](file://examples/plugin-example/src/simple-demo.tsx#L1-L77)
- [examples/plugin-example/src/raycast-demo.tsx](file://examples/plugin-example/src/raycast-demo.tsx#L1-L111)
- [examples/plugin-example/src/clipboard-history-demo.tsx](file://examples/plugin-example/src/clipboard-history-demo.tsx#L1-L203)
- [examples/plugin-example/src/form-demo.tsx](file://examples/plugin-example/src/form-demo.tsx#L1-L67)
- [examples/plugin-example/src/grid-demo.tsx](file://examples/plugin-example/src/grid-demo.tsx#L1-L137)
- [examples/plugin-example/src/detail-demo.tsx](file://examples/plugin-example/src/detail-demo.tsx#L1-L64)

## Solid Plugin Example

Solid plugins require a build transform that compiles JSX with `babel-preset-solid` using `moduleName: "@uniview/solid-renderer"` and `generate: "universal"`. The Solid example builds parallel Worker and client entries for simple, advanced, full benchmark, and incremental benchmark modes.

**Section sources**

- [examples/plugin-solid-example/package.json](file://examples/plugin-solid-example/package.json#L7-L29)
- [examples/plugin-solid-example/build.ts](file://examples/plugin-solid-example/build.ts#L1-L46)
- [examples/plugin-solid-example/build.ts](file://examples/plugin-solid-example/build.ts#L48-L115)

## Benchmark Plugins

Benchmark demos stress full-tree and incremental modes with hundreds of long-text items, deterministic pseudo-random operations, batch insert/remove/update actions, and runtime stats read from `globalThis.__uniview_stats`. The host Svelte demo exposes full/incremental selection for these benchmark bundles.

**Section sources**

- [examples/plugin-example/src/benchmark.tsx](file://examples/plugin-example/src/benchmark.tsx#L75-L176)
- [examples/plugin-example/src/benchmark.tsx](file://examples/plugin-example/src/benchmark.tsx#L228-L270)
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L63-L85)
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L211-L234)
