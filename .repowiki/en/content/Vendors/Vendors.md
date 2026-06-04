# Vendors

<cite>
**Referenced Files in This Document**
- [AGENTS.md](file://AGENTS.md#L179-L185)
- [pnpm-workspace.yaml](file://pnpm-workspace.yaml#L6-L9)
- [packages/react-runtime/package.json](file://packages/react-runtime/package.json#L29-L43)
- [packages/host-sdk/package.json](file://packages/host-sdk/package.json#L28-L48)
- [packages/tui-renderer/src/terminal/renderer.ts](file://packages/tui-renderer/src/terminal/renderer.ts#L1-L135)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Vendored and Reference Code](#vendored-and-reference-code)
3. [Catalog Dependencies](#catalog-dependencies)

## Overview

The repository tracks closely related upstream or reference projects under `vendors/` and `references/`. These directories provide context for RPC transport, Svelte reconciler patterns, and terminal UI ideas; production package dependencies are still declared through package manifests and the pnpm catalog.

**Section sources**

- [AGENTS.md](file://AGENTS.md#L179-L185)
- [pnpm-workspace.yaml](file://pnpm-workspace.yaml#L6-L9)

## Vendored and Reference Code

`vendors/kkrpc` is the core RPC transport reference used by runtimes and host controllers. `vendors/svelte-react-render` is a reference for Svelte/React rendering techniques. `references/opentui` informs terminal UI experiments such as `@uniview/tui-renderer`, whose terminal renderer manages ANSI output, layout, focus, and keyboard state.

**Section sources**

- [AGENTS.md](file://AGENTS.md#L179-L185)
- [packages/tui-renderer/src/terminal/renderer.ts](file://packages/tui-renderer/src/terminal/renderer.ts#L1-L135)

## Catalog Dependencies

The workspace catalog pins `kkrpc`, `react`, and `react-reconciler` versions. Runtime and host packages consume `kkrpc: "catalog:"`; renderer packages consume React-related catalog entries to avoid dependency drift.

**Section sources**

- [pnpm-workspace.yaml](file://pnpm-workspace.yaml#L6-L9)
- [packages/react-runtime/package.json](file://packages/react-runtime/package.json#L29-L43)
- [packages/host-sdk/package.json](file://packages/host-sdk/package.json#L28-L48)
