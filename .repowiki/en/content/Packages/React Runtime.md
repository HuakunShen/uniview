# React Runtime

<cite>
**Referenced Files in This Document**
- [packages/react-runtime/package.json](file://packages/react-runtime/package.json#L1-L45)
- [packages/react-runtime/src/index.ts](file://packages/react-runtime/src/index.ts#L1-L12)
- [packages/react-runtime/src/runtime.ts](file://packages/react-runtime/src/runtime.ts#L26-L170)
- [packages/react-runtime/src/worker-entry.ts](file://packages/react-runtime/src/worker-entry.ts#L1-L24)
- [packages/react-runtime/src/ws-client-entry.ts](file://packages/react-runtime/src/ws-client-entry.ts#L1-L15)
- [packages/react-runtime/src/ws-client.ts](file://packages/react-runtime/src/ws-client.ts#L22-L274)
- [packages/react-runtime/tsdown.config.ts](file://packages/react-runtime/tsdown.config.ts#L3-L9)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Entry Points](#entry-points)
3. [Core Runtime Lifecycle](#core-runtime-lifecycle)
4. [Worker Mode](#worker-mode)
5. [WebSocket Bridge Client Mode](#websocket-bridge-client-mode)
6. [Update Modes and Benchmark Stats](#update-modes-and-benchmark-stats)

## Overview

`@uniview/react-runtime` bootstraps React plugins for Worker and WebSocket bridge execution. It creates the renderer, handler registry, mutation collector when needed, and kkrpc channel, then exposes the `HostToPluginAPI` required by the protocol.

**Section sources**

- [packages/react-runtime/package.json](file://packages/react-runtime/package.json#L1-L45)
- [packages/react-runtime/src/runtime.ts](file://packages/react-runtime/src/runtime.ts#L26-L75)

## Entry Points

The package exports the root runtime APIs from `.` and the server-side bridge client from `./ws-client`. The old plugin-as-server style entry point is not present.

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./ws-client": "./dist/ws-client.mjs"
  }
}
```

**Section sources**

- [packages/react-runtime/package.json](file://packages/react-runtime/package.json#L7-L14)
- [packages/react-runtime/tsdown.config.ts](file://packages/react-runtime/tsdown.config.ts#L3-L9)
- [packages/react-runtime/src/index.ts](file://packages/react-runtime/src/index.ts#L1-L12)

## Core Runtime Lifecycle

During `initialize`, the runtime checks protocol version, creates `HandlerRegistry` and renderer bridge, subscribes to either full-tree or mutation updates, renders the React app with initial props, and sends updates to the host. Later host calls update props, execute registered handlers, request full-tree sync, or destroy runtime state.

**Section sources**

- [packages/react-runtime/src/runtime.ts](file://packages/react-runtime/src/runtime.ts#L48-L119)
- [packages/react-runtime/src/runtime.ts](file://packages/react-runtime/src/runtime.ts#L121-L159)

## Worker Mode

`startWorkerPlugin()` creates a `WorkerChildIO`, constructs an RPC channel, passes the runtime's exposed API into the channel, and starts the runtime. Worker options are `App` and optional update `mode`.

**Section sources**

- [packages/react-runtime/src/worker-entry.ts](file://packages/react-runtime/src/worker-entry.ts#L1-L24)

## WebSocket Bridge Client Mode

`connectToHostServer()` dynamically imports `ws-client` and creates a bridge client. The WebSocket client connects to `${serverUrl}/plugins/${pluginId}`, supports reconnection, resets runtime state on reconnect, and exposes the same host-facing API as Worker mode.

**Section sources**

- [packages/react-runtime/src/ws-client-entry.ts](file://packages/react-runtime/src/ws-client-entry.ts#L1-L15)
- [packages/react-runtime/src/ws-client.ts](file://packages/react-runtime/src/ws-client.ts#L22-L90)
- [packages/react-runtime/src/ws-client.ts](file://packages/react-runtime/src/ws-client.ts#L111-L274)

## Update Modes and Benchmark Stats

Full mode serializes and sends the current tree through `updateTree`. Incremental mode attaches a `MutationCollector` and sends mutation batches through `applyMutations`, while also tracking `bytesSent` and `messagesSent` on `globalThis.__uniview_stats` for benchmark demos.

**Section sources**

- [packages/react-runtime/src/runtime.ts](file://packages/react-runtime/src/runtime.ts#L37-L46)
- [packages/react-runtime/src/runtime.ts](file://packages/react-runtime/src/runtime.ts#L71-L115)
- [packages/react-runtime/src/ws-client.ts](file://packages/react-runtime/src/ws-client.ts#L53-L90)
- [packages/react-runtime/src/ws-client.ts](file://packages/react-runtime/src/ws-client.ts#L120-L168)
