# API Reference

<cite>
**Referenced Files in This Document**
- [packages/protocol/src/rpc.ts](file://packages/protocol/src/rpc.ts#L9-L81)
- [packages/protocol/src/tree.ts](file://packages/protocol/src/tree.ts#L4-L129)
- [packages/protocol/src/events.ts](file://packages/protocol/src/events.ts#L1-L72)
- [packages/protocol/src/mutations.ts](file://packages/protocol/src/mutations.ts#L3-L81)
- [packages/host-sdk/src/types.ts](file://packages/host-sdk/src/types.ts#L3-L65)
- [packages/host-sdk/src/controllers/worker.ts](file://packages/host-sdk/src/controllers/worker.ts#L19-L148)
- [packages/host-sdk/src/controllers/websocket.ts](file://packages/host-sdk/src/controllers/websocket.ts#L20-L133)
- [packages/host-sdk/src/controllers/main.ts](file://packages/host-sdk/src/controllers/main.ts#L20-L128)
- [packages/react-runtime/src/worker-entry.ts](file://packages/react-runtime/src/worker-entry.ts#L6-L24)
- [packages/react-runtime/src/ws-client-entry.ts](file://packages/react-runtime/src/ws-client-entry.ts#L1-L15)
- [packages/react-runtime/tests/protocol-contract.test.ts](file://packages/react-runtime/tests/protocol-contract.test.ts#L4-L28)
- [packages/solid-runtime/src/runtime.ts](file://packages/solid-runtime/src/runtime.ts#L46-L219)
</cite>

## Table of Contents

1. [Protocol Types](#protocol-types)
2. [RPC Interfaces](#rpc-interfaces)
3. [Host SDK API](#host-sdk-api)
4. [Runtime Entry Points](#runtime-entry-points)

## Protocol Types

The central API type is `UINode`: a stable-id, string-type, JSON-props tree node whose children may be nested nodes or text strings. `JSONValue` deliberately limits cross-boundary data to JSON-safe primitives, arrays, and objects. Layout tags are HTML-like primitives that every host should understand.

**Section sources**

- [packages/protocol/src/tree.ts](file://packages/protocol/src/tree.ts#L4-L129)
- [packages/protocol/src/events.ts](file://packages/protocol/src/events.ts#L1-L72)
- [packages/protocol/src/mutations.ts](file://packages/protocol/src/mutations.ts#L3-L81)

## RPC Interfaces

`HostToPluginAPI` contains lifecycle, prop update, event execution, destruction, and full-tree resync methods. `PluginToHostAPI` contains full-tree updates, incremental mutation updates, plugin logging, and plugin error reporting. There are no benchmark-specific methods in the public protocol.

```typescript
interface HostToPluginAPI {
  initialize(req: { protocolVersion: number; props?: JSONValue }): Promise<void>;
  updateProps(props: JSONValue): Promise<void>;
  executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>;
  destroy(): Promise<void>;
  syncTree(): Promise<void>;
}
```

**Section sources**

- [packages/protocol/src/rpc.ts](file://packages/protocol/src/rpc.ts#L9-L81)
- [packages/react-runtime/tests/protocol-contract.test.ts](file://packages/react-runtime/tests/protocol-contract.test.ts#L4-L28)

## Host SDK API

The `PluginController` interface is the host's stable integration surface. Runtime-specific factories return this interface for Worker, WebSocket, and main-thread modes. Custom host renderers use `subscribe()` for tree updates and `executeHandler()` for event callbacks.

**Section sources**

- [packages/host-sdk/src/types.ts](file://packages/host-sdk/src/types.ts#L3-L65)
- [packages/host-sdk/src/controllers/worker.ts](file://packages/host-sdk/src/controllers/worker.ts#L19-L148)
- [packages/host-sdk/src/controllers/websocket.ts](file://packages/host-sdk/src/controllers/websocket.ts#L20-L133)
- [packages/host-sdk/src/controllers/main.ts](file://packages/host-sdk/src/controllers/main.ts#L20-L128)

## Runtime Entry Points

React plugins use `startWorkerPlugin()` in Worker bundles and `connectToHostServer()` from `@uniview/react-runtime/ws-client` for bridge clients. Solid plugins use equivalent Solid runtime APIs built around `createSolidPluginRuntime()` and the Solid renderer. Both runtimes accept update mode controls through protocol `UpdateMode`.

**Section sources**

- [packages/react-runtime/src/worker-entry.ts](file://packages/react-runtime/src/worker-entry.ts#L6-L24)
- [packages/react-runtime/src/ws-client-entry.ts](file://packages/react-runtime/src/ws-client-entry.ts#L1-L15)
- [packages/solid-runtime/src/runtime.ts](file://packages/solid-runtime/src/runtime.ts#L46-L219)
