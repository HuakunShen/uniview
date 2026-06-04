# React Renderer

<cite>
**Referenced Files in This Document**
- [packages/react-renderer/package.json](file://packages/react-renderer/package.json#L1-L45)
- [packages/react-renderer/src/index.ts](file://packages/react-renderer/src/index.ts#L1-L11)
- [packages/react-renderer/src/reconciler/renderer.ts](file://packages/react-renderer/src/reconciler/renderer.ts#L1-L38)
- [packages/react-renderer/src/reconciler/bridge.ts](file://packages/react-renderer/src/reconciler/bridge.ts#L1-L42)
- [packages/react-renderer/src/reconciler/host-config.ts](file://packages/react-renderer/src/reconciler/host-config.ts#L23-L195)
- [packages/react-renderer/src/serialization/serialize.ts](file://packages/react-renderer/src/serialization/serialize.ts#L1-L44)
- [packages/react-renderer/src/serialization/serialize-props.ts](file://packages/react-renderer/src/serialization/serialize-props.ts#L1-L45)
- [packages/react-renderer/src/serialization/handler-registry.ts](file://packages/react-renderer/src/serialization/handler-registry.ts#L1-L42)
- [packages/react-renderer/src/mutation/mutation-collector.ts](file://packages/react-renderer/src/mutation/mutation-collector.ts#L24-L241)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Public API](#public-api)
3. [RenderBridge](#renderbridge)
4. [Serialization](#serialization)
5. [Handler Registry](#handler-registry)
6. [Mutation Collection](#mutation-collection)

## Overview

`@uniview/react-renderer` is a custom React reconciler that creates in-memory nodes instead of DOM elements. It lets React components run in Workers and server-side runtimes, then serializes the resulting tree into protocol `UINode` objects.

**Section sources**

- [packages/react-renderer/package.json](file://packages/react-renderer/package.json#L1-L45)
- [packages/react-renderer/src/reconciler/renderer.ts](file://packages/react-renderer/src/reconciler/renderer.ts#L1-L38)

## Public API

The package exports renderer creation and rendering functions, `RenderBridge`, internal node types, serialization helpers, `HandlerRegistry`, and `MutationCollector`.

**Section sources**

- [packages/react-renderer/src/index.ts](file://packages/react-renderer/src/index.ts#L1-L11)

## RenderBridge

`RenderBridge` stores the current root instance and exposes two subscription channels: full-tree updates through `subscribe(callback: () => void)` and mutation batches through `subscribeMutations(callback)`. Subscribers read `bridge.rootInstance` when notified; the callback does not receive the root as an argument.

**Section sources**

- [packages/react-renderer/src/reconciler/bridge.ts](file://packages/react-renderer/src/reconciler/bridge.ts#L5-L42)
- [packages/react-renderer/src/reconciler/renderer.ts](file://packages/react-renderer/src/reconciler/renderer.ts#L13-L38)

## Serialization

`serializeTree()` recursively converts internal element and text nodes to `UINode` or strings. `serializeProps()` skips React-internal props, converts function props named like `on[A-Z]` into handler ID props, and includes JSON-serializable values.

**Section sources**

- [packages/react-renderer/src/serialization/serialize.ts](file://packages/react-renderer/src/serialization/serialize.ts#L1-L44)
- [packages/react-renderer/src/serialization/serialize-props.ts](file://packages/react-renderer/src/serialization/serialize-props.ts#L1-L45)

## Handler Registry

`HandlerRegistry` maps functions to `handler_<counter>` string IDs, executes handlers asynchronously when needed, supports removal and clearing, and resets its counter on clear.

**Section sources**

- [packages/react-renderer/src/serialization/handler-registry.ts](file://packages/react-renderer/src/serialization/handler-registry.ts#L1-L42)

## Mutation Collection

`MutationCollector` is instantiated per plugin instance for incremental mode. It begins and flushes commit batches, serializes subtrees for append/insert/root mutations, records prop and text mutations, and cleans up removed subtrees conservatively.

**Section sources**

- [packages/react-renderer/src/mutation/mutation-collector.ts](file://packages/react-renderer/src/mutation/mutation-collector.ts#L24-L241)
- [packages/react-renderer/src/reconciler/host-config.ts](file://packages/react-renderer/src/reconciler/host-config.ts#L23-L195)
