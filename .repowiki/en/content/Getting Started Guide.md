# Getting Started Guide

<cite>
**Referenced Files in This Document**
- [package.json](file://package.json#L4-L40)
- [pnpm-workspace.yaml](file://pnpm-workspace.yaml#L1-L9)
- [README.md](file://README.md#L41-L215)
- [AGENTS.md](file://AGENTS.md#L293-L370)
- [examples/host-svelte-demo/package.json](file://examples/host-svelte-demo/package.json#L6-L53)
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L15-L138)
- [packages/react-runtime/src/worker-entry.ts](file://packages/react-runtime/src/worker-entry.ts#L1-L24)
- [packages/solid-runtime/src/worker-entry.ts](file://packages/solid-runtime/src/worker-entry.ts#L1-L24)
- [packages/host-svelte/src/PluginHost.svelte](file://packages/host-svelte/src/PluginHost.svelte#L8-L51)
</cite>

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Install and Build](#install-and-build)
3. [Run the Main Demo](#run-the-main-demo)
4. [Create a Plugin](#create-a-plugin)
5. [Create a Host](#create-a-host)
6. [Development Commands](#development-commands)

## Prerequisites

Use Node.js 18 or newer and pnpm 10.28.2 as the package manager. Bun is used by example bridge/plugin scripts and E2E fixtures, so installing Bun is recommended for running full demos.

**Section sources**

- [package.json](file://package.json#L27-L40)
- [README.md](file://README.md#L49-L59)

## Install and Build

```bash
pnpm install
pnpm build
```

The workspace includes `packages/*`, `examples/*`, and `docs`, so a root install prepares both reusable packages and demos.

**Section sources**

- [README.md](file://README.md#L49-L59)
- [pnpm-workspace.yaml](file://pnpm-workspace.yaml#L1-L9)
- [package.json](file://package.json#L4-L16)

## Run the Main Demo

The Svelte host demo is the fastest full-system path. Its `dev` script starts the bridge, builds/runs plugin clients, and starts the Svelte/Vite host.

```bash
cd examples/host-svelte-demo
pnpm dev
```

Open `http://localhost:5173`, then switch between React/Solid plugins, Worker/Node/Main runtime modes, simple/advanced/benchmark demos, and full/incremental update modes.

**Section sources**

- [README.md](file://README.md#L41-L90)
- [examples/host-svelte-demo/package.json](file://examples/host-svelte-demo/package.json#L6-L20)
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L15-L138)

## Create a Plugin

React worker plugins call `startWorkerPlugin({ App, mode? })`; Solid worker plugins call `startSolidWorkerPlugin({ App, mode? })`. For server-side bridge mode, use the runtime `./ws-client` entry points instead.

**Section sources**

- [README.md](file://README.md#L135-L194)
- [packages/react-runtime/src/worker-entry.ts](file://packages/react-runtime/src/worker-entry.ts#L1-L24)
- [packages/solid-runtime/src/worker-entry.ts](file://packages/solid-runtime/src/worker-entry.ts#L1-L24)

## Create a Host

Hosts create a `ComponentRegistry`, register product primitives, choose a controller (`createWorkerController`, `createWebSocketController`, or `createMainController`), and render the controller's tree through a framework adapter such as `PluginHost` for Svelte.

**Section sources**

- [README.md](file://README.md#L195-L215)
- [examples/host-svelte-demo/src/routes/+page.svelte](file://examples/host-svelte-demo/src/routes/+page.svelte#L87-L138)
- [packages/host-svelte/src/PluginHost.svelte](file://packages/host-svelte/src/PluginHost.svelte#L8-L51)

## Development Commands

Common root commands are `pnpm build`, `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm format`, and `pnpm check-types`. Package creation should use tsdown templates and then update exports/workspace/turbo wiring as needed.

**Section sources**

- [package.json](file://package.json#L4-L16)
- [AGENTS.md](file://AGENTS.md#L293-L370)
