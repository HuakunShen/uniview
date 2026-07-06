# Protocol

<cite>
**Referenced Files in This Document**
- [packages/protocol/package.json](file://packages/protocol/package.json#L1-L37)
- [packages/protocol/src/index.ts](file://packages/protocol/src/index.ts#L1-L6)
- [packages/protocol/src/tree.ts](file://packages/protocol/src/tree.ts#L4-L129)
- [packages/protocol/src/rpc.ts](file://packages/protocol/src/rpc.ts#L9-L81)
- [packages/protocol/src/events.ts](file://packages/protocol/src/events.ts#L1-L72)
- [packages/protocol/src/mutations.ts](file://packages/protocol/src/mutations.ts#L3-L81)
- [packages/protocol/src/validators.ts](file://packages/protocol/src/validators.ts#L1-L76)
- [packages/protocol/src/version.ts](file://packages/protocol/src/version.ts#L1-L5)
- [packages/react-runtime/src/runtime.ts](file://packages/react-runtime/src/runtime.ts#L48-L54)
- [packages/react-runtime/tests/protocol-contract.test.ts](file://packages/react-runtime/tests/protocol-contract.test.ts#L4-L28)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Protocol Version](#protocol-version)
3. [Tree Types](#tree-types)
4. [RPC Interfaces](#rpc-interfaces)
5. [Events and Handler IDs](#events-and-handler-ids)
6. [Mutations and Update Modes](#mutations-and-update-modes)
7. [Validation](#validation)

## Overview

`@uniview/protocol` is the foundation package for all cross-boundary communication. It defines JSON-safe values, serializable UI trees, event handler ID conventions, bidirectional RPC interfaces, incremental mutation types, Zod validators, and the protocol version constant. The package publishes a single ESM entry point and depends only on Zod at runtime.

**Section sources**

- [packages/protocol/package.json](file://packages/protocol/package.json#L1-L37)
- [packages/protocol/src/index.ts](file://packages/protocol/src/index.ts#L1-L6)

## Protocol Version

The current `PROTOCOL_VERSION` is `3` (v3: text children are explicit `{type: "#text", text}` nodes with stable ids; `setText` is addressed by `nodeId` instead of `parentId` + `childIndex`). Hosts send this value during `initialize()`, and plugin runtimes reject mismatches so incompatible hosts and plugins fail with an explicit error before rendering.

**Section sources**

- [packages/protocol/src/version.ts](file://packages/protocol/src/version.ts#L1-L5)
- [packages/protocol/src/rpc.ts](file://packages/protocol/src/rpc.ts#L14-L17)
- [packages/react-runtime/src/runtime.ts](file://packages/react-runtime/src/runtime.ts#L48-L54)

## Tree Types

`JSONValue` restricts props and RPC arguments to serializable values. `UINode` carries a stable `id`, string `type`, JSON-safe `props`, and mixed text/node children. Since protocol v3, text nodes can be explicit `{type: "#text", text}` nodes (`TEXT_NODE_TYPE`) with stable ids for mutation addressing. Helper functions `isTextUINode()` and `textContent()` bridge the v2 (bare-string) and v3 (explicit node) representations. `UILayoutTag` and `LAYOUT_TAGS` define HTML-like primitives that host adapters can render natively.

**Section sources**

- [packages/protocol/src/tree.ts](file://packages/protocol/src/tree.ts#L4-L129)

## RPC Interfaces

`HostToPluginAPI` is the API a host calls on a plugin: `initialize`, `updateProps`, `executeHandler`, `destroy`, and `syncTree`. `PluginToHostAPI` is the API a plugin calls on a host: `updateTree`, `applyMutations`, `log`, and `reportError`. Benchmark-specific methods are intentionally not part of the protocol.

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

## Events and Handler IDs

Function props cannot cross RPC boundaries. Event props become handler ID props such as `_onClickHandlerId`, and hosts call `executeHandler(handlerId, args)` when the user interacts with rendered UI. The protocol exposes helpers to construct, detect, and reverse handler ID prop names.

**Section sources**

- [packages/protocol/src/events.ts](file://packages/protocol/src/events.ts#L1-L72)

## Mutations and Update Modes

`UpdateMode` is either `full` or `incremental`. Full mode sends the entire current tree via `updateTree`. Incremental mode sends mutation batches via `applyMutations`; supported mutations include `appendChild`, `insertBefore`, `removeChild`, `setText`, `setProps`, and `setRoot`. In protocol v3, `setText` is addressed by the text node's stable `nodeId` (previously by `parentId` + `childIndex`, which corrupted the wrong child when host and plugin trees diverged). All `appendChild`/`insertBefore` mutations include the full serialized subtree with explicit `#text` children since v3.

**Section sources**

- [packages/protocol/src/mutations.ts](file://packages/protocol/src/mutations.ts#L3-L81)
- [packages/protocol/src/rpc.ts](file://packages/protocol/src/rpc.ts#L47-L61)

## Validation

The protocol package defines Zod schemas for JSON values, UI nodes, layout tags, initialization requests, prop updates, handler execution requests, tree updates, logs, errors, and event prop names. Runtime helpers parse or type-guard `UINode` and `JSONValue` inputs.

**Section sources**

- [packages/protocol/src/validators.ts](file://packages/protocol/src/validators.ts#L1-L76)
