# Solid Runtime

<cite>
**Referenced Files in This Document**
- [packages/solid-runtime/package.json](file://packages/solid-runtime/package.json#L1-L43)
- [packages/solid-runtime/src/index.ts](file://packages/solid-runtime/src/index.ts#L1-L18)
- [packages/solid-runtime/src/runtime.ts](file://packages/solid-runtime/src/runtime.ts#L46-L219)
- [packages/solid-runtime/src/worker-entry.ts](file://packages/solid-runtime/src/worker-entry.ts#L1-L24)
- [packages/solid-runtime/src/ws-client-entry.ts](file://packages/solid-runtime/src/ws-client-entry.ts#L1-L15)
- [packages/solid-runtime/src/ws-client.ts](file://packages/solid-runtime/src/ws-client.ts#L46-L220)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Entry Points](#entry-points)
3. [Runtime Lifecycle](#runtime-lifecycle)
4. [Worker Mode](#worker-mode)
5. [WebSocket Mode](#websocket-mode)

## Overview

`@uniview/solid-runtime` is the Solid counterpart to the React runtime. It uses `@uniview/solid-renderer`, kkrpc transports, protocol version checks, handler registries, and optional mutation collection to expose Solid plugins through the same `HostToPluginAPI` contract. Uncaught exceptions and unhandled rejections are wired through `reportError` to the host.

**Section sources**

- [packages/solid-runtime/package.json](file://packages/solid-runtime/package.json#L1-L43)
- [packages/solid-runtime/src/index.ts](file://packages/solid-runtime/src/index.ts#L1-L18)

## Entry Points

The package exports Worker/runtime APIs at `.` and bridge-client APIs at `./ws-client`. Both entry points are built by tsdown from package source.

**Section sources**

- [packages/solid-runtime/package.json](file://packages/solid-runtime/package.json#L7-L14)
- [packages/solid-runtime/src/index.ts](file://packages/solid-runtime/src/index.ts#L1-L18)
- [packages/solid-runtime/src/ws-client-entry.ts](file://packages/solid-runtime/src/ws-client-entry.ts#L1-L15)

## Runtime Lifecycle

The core runtime resets Solid root state before initialization and prop updates, creates a root node, configures either full-tree callbacks or mutation callbacks, renders the Solid component inside `createRoot`, executes handler IDs through `HandlerRegistry`, supports `syncTree`, and tears down with `destroy`. Handler IDs are stable (`${nodeId}:${propName}`) with no `clear()`-per-update reset that previously reused IDs and caused late event RPCs to execute wrong handlers. Benchmark stats (`bytesSent`, `messagesSent`) are gated behind a `debug: true` option.

**Section sources**

- [packages/solid-runtime/src/runtime.ts](file://packages/solid-runtime/src/runtime.ts#L57-L168)
- [packages/solid-runtime/src/runtime.ts](file://packages/solid-runtime/src/runtime.ts#L170-L219)

## Worker Mode

`startSolidWorkerPlugin()` creates `WorkerChildIO`, constructs an RPC channel, and starts `createSolidPluginRuntime` with the Solid app and optional update mode.

**Section sources**

- [packages/solid-runtime/src/worker-entry.ts](file://packages/solid-runtime/src/worker-entry.ts#L1-L24)

## WebSocket Mode

`connectSolidToHostServer()` dynamically imports the Solid bridge client. The client options mirror React's bridge client: `App`, `serverUrl`, `pluginId`, update mode, reconnect delay, and reconnect attempt limits.

**Section sources**

- [packages/solid-runtime/src/ws-client-entry.ts](file://packages/solid-runtime/src/ws-client-entry.ts#L1-L15)
- [packages/solid-runtime/src/ws-client.ts](file://packages/solid-runtime/src/ws-client.ts#L46-L89)
- [packages/solid-runtime/src/ws-client.ts](file://packages/solid-runtime/src/ws-client.ts#L115-L220)
