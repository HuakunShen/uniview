# Host SDK

<cite>
**Referenced Files in This Document**
- [packages/host-sdk/package.json](file://packages/host-sdk/package.json#L1-L49)
- [packages/host-sdk/src/index.ts](file://packages/host-sdk/src/index.ts#L1-L20)
- [packages/host-sdk/src/types.ts](file://packages/host-sdk/src/types.ts#L1-L65)
- [packages/host-sdk/src/registry.ts](file://packages/host-sdk/src/registry.ts#L1-L32)
- [packages/host-sdk/src/controllers/worker.ts](file://packages/host-sdk/src/controllers/worker.ts#L19-L148)
- [packages/host-sdk/src/controllers/websocket.ts](file://packages/host-sdk/src/controllers/websocket.ts#L20-L133)
- [packages/host-sdk/src/controllers/main.ts](file://packages/host-sdk/src/controllers/main.ts#L20-L128)
- [packages/host-sdk/src/mutable-tree.ts](file://packages/host-sdk/src/mutable-tree.ts#L1-L316)
- [packages/host-sdk/tests/mutable-tree.test.ts](file://packages/host-sdk/tests/mutable-tree.test.ts#L44-L182)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [PluginController Interface](#plugincontroller-interface)
3. [Controller Implementations](#controller-implementations)
4. [Component Registry](#component-registry)
5. [MutableTree](#mutabletree)

## Overview

`@uniview/host-sdk` is the framework-agnostic host layer. It exports the `PluginController` contract, runtime-specific controller factories, a generic component registry, and `MutableTree` for applying incremental mutation batches. Svelte, React, Vue, and native hosts can use this package without depending on each other's framework code.

**Section sources**

- [packages/host-sdk/package.json](file://packages/host-sdk/package.json#L1-L49)
- [packages/host-sdk/src/index.ts](file://packages/host-sdk/src/index.ts#L1-L20)

## PluginController Interface

Every controller exposes the same lifecycle, prop update, event execution, sync, status, tree access, and subscription methods. Current event execution is named `executeHandler`; the interface does not expose reload or generic execute methods. An optional `subscribeErrors` method propagates plugin-side errors to host UI.

```typescript
interface PluginController {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  updateProps(props: JSONValue): Promise<void>;
  executeHandler(handlerId: HandlerId, args?: JSONValue[]): Promise<void>;
  destroy(): Promise<void>;
  syncTree(): Promise<void>;
  getStatus(): { mode: HostMode; connected: boolean; lastError?: string };
  getTree(): UINode | null;
  subscribe(cb: (tree: UINode | null) => void): () => void;
  subscribeErrors?(cb: (message: string) => void): () => void;
}
```

**Section sources**

- [packages/host-sdk/src/types.ts](file://packages/host-sdk/src/types.ts#L3-L52)

## Controller Implementations

Worker controllers fetch a plugin bundle, construct a module Worker from a Blob URL, create a `workerTransport()` from `kkrpc/worker`, expose the host API, and initialize the plugin with `PROTOCOL_VERSION`. WebSocket controllers connect to `/host/:pluginId` on the bridge server using `webSocketClientTransport()` from `kkrpc/ws` and share the same full-tree/mutation subscriber model. Main-thread controllers use `@uniview/react-renderer` directly for development and can run in full or incremental mode. All controllers now use `RPCChannel` directly from `kkrpc` (not `kkrpc/browser`) with simplified generics.

**Section sources**

- [packages/host-sdk/src/controllers/worker.ts](file://packages/host-sdk/src/controllers/worker.ts#L19-L148)
- [packages/host-sdk/src/controllers/websocket.ts](file://packages/host-sdk/src/controllers/websocket.ts#L20-L133)
- [packages/host-sdk/src/controllers/main.ts](file://packages/host-sdk/src/controllers/main.ts#L20-L128)

## Component Registry

The registry is a small map-backed abstraction. It lets host adapters register framework-native components under protocol type names and then resolve them during recursive tree rendering.

**Section sources**

- [packages/host-sdk/src/registry.ts](file://packages/host-sdk/src/registry.ts#L1-L32)
- [packages/host-sdk/src/types.ts](file://packages/host-sdk/src/types.ts#L54-L65)

## MutableTree

`MutableTree` maintains a local `UINode` tree, a `nodeIndex` (id → node), and a `parentIndex` (id → parentId) for O(depth) mutation application instead of O(N²) for keyed reorders. Each mutation produces new object references along the root path to trigger Svelte `$state` reactivity. `appendChild` and `insertBefore` act as moves (detaching then re-inserting) for keyed list reorders. If an `insertBefore` anchor is missing, the node is appended as recovery with a console error. `setText` (protocol v3) is addressed by the text node's stable id rather than `parentId` + `childIndex`.

**Section sources**

- [packages/host-sdk/src/mutable-tree.ts](file://packages/host-sdk/src/mutable-tree.ts#L1-L64)
- [packages/host-sdk/src/mutable-tree.ts](file://packages/host-sdk/src/mutable-tree.ts#L101-L268)
- [packages/host-sdk/tests/mutable-tree.test.ts](file://packages/host-sdk/tests/mutable-tree.test.ts#L44-L182)
