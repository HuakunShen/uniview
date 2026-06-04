# Packages

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md#L28-L40)
- [AGENTS.md](file://AGENTS.md#L12-L36)
- [packages/protocol/package.json](file://packages/protocol/package.json#L1-L37)
- [packages/react-runtime/package.json](file://packages/react-runtime/package.json#L1-L45)
- [packages/host-svelte/package.json](file://packages/host-svelte/package.json#L1-L54)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Package Groups](#package-groups)
3. [Dependency Direction](#dependency-direction)

## Overview

The `packages/` workspace contains the reusable Uniview runtime, renderer, protocol, and host packages. These packages are the library surface consumed by examples and by future applications embedding Uniview.

**Section sources**

- [README.md](file://README.md#L28-L40)
- [AGENTS.md](file://AGENTS.md#L12-L36)

## Package Groups

| Group | Packages | Role |
| --- | --- | --- |
| Protocol | `@uniview/protocol` | Types, event helpers, mutations, validators, version contract |
| Renderers | `@uniview/react-renderer`, `@uniview/solid-renderer` | Framework-specific reconciler/universal renderer to `UINode` |
| Runtimes | `@uniview/react-runtime`, `@uniview/solid-runtime` | Worker and bridge-client plugin bootstrap |
| Host | `@uniview/host-sdk`, `@uniview/host-svelte` | Framework-agnostic controller plus Svelte adapter |
| Experiments | `@uniview/tui-renderer` | React-to-terminal renderer independent of RPC hosts |

**Section sources**

- [README.md](file://README.md#L28-L40)
- [packages/protocol/package.json](file://packages/protocol/package.json#L1-L37)
- [packages/react-runtime/package.json](file://packages/react-runtime/package.json#L1-L45)
- [packages/host-svelte/package.json](file://packages/host-svelte/package.json#L1-L54)

## Dependency Direction

Protocol types sit at the bottom of the dependency graph. Renderers depend on protocol; runtimes depend on renderers, protocol, and kkrpc; the host SDK depends on protocol and kkrpc; host adapters depend on the host SDK and protocol. This ordering keeps host frameworks out of plugin runtimes and product primitives out of the protocol package.

```mermaid
graph TD
    Protocol[@uniview/protocol]
    Protocol --> ReactRenderer[react-renderer]
    Protocol --> SolidRenderer[solid-renderer]
    ReactRenderer --> ReactRuntime[react-runtime]
    SolidRenderer --> SolidRuntime[solid-runtime]
    Protocol --> HostSDK[host-sdk]
    HostSDK --> HostSvelte[host-svelte]
```

**Diagram sources**

- [README.md](file://README.md#L28-L40)
- [AGENTS.md](file://AGENTS.md#L41-L64)

**Section sources**

- [AGENTS.md](file://AGENTS.md#L41-L64)
- [README.md](file://README.md#L28-L40)
