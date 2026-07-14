# uniview - PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-28T02:00:00Z
**Commit:** 45adfe3e0d0c1993b182d3d707bbffaced01b1b1
**Branch:** main

## OVERVIEW

Universal plugin system for React and Solid plugins that render in host framework demos (Svelte, Vue, React). Plugins run in isolated environments (Web Workers, Node.js, Deno, Bun) via kkrpc RPC.

## THE PRIME DIRECTIVE: FRAMEWORK-, APP-, AND BRAND-AGNOSTIC

**Uniview is a renderer. It renders what the tree says. It has no opinions of its
own — not about which UI framework you author in, not about which app is being
built, and above all not about what that app looks like.**

Each word forbids something specific:

- **Framework-agnostic.** `@uniview/protocol`, `@uniview/host-sdk` and every
  native host speak `UINode` + `Mutation` + Style IR. They must not know that
  React or Solid or Svelte exists. A new plugin-side framework is a new renderer
  package and *zero* changes anywhere else.
- **App-agnostic.** The renderer must not know what a "sidebar", a "launcher" or a
  "command palette" is. Those are components, and components are written in the
  plugin, in TypeScript. `packages/UniviewAppKit` is a library; `UniviewDemoApp`
  is a demo *that uses it*. Framework logic must never leak into the demo, nor
  demo logic into the framework.
- **Brand-agnostic.** The renderer must not contain a color, a gradient, a corner
  radius or a shadow that it invented. It draws the Style IR, and the Style IR
  comes from the plugin. Semantic tokens (`accent`, `foreground`, `card`) resolve
  to the *system's* colors — the ones the user chose — never to ours.

### Why this is a hard rule, not a preference

The renderer is what gets **reimplemented on every platform** (macOS AppKit today;
Windows and HarmonyOS next). An app's UI is unbounded and grows forever; a
renderer's primitive set is bounded and converges. That asymmetry is the entire
bet — and it is the bet Raycast lost when they had to take an app's UI to a second
platform and retreated to a WebView.

Every product decision that leaks into the renderer breaks the bet twice: it is
ported into every new platform (three copies of one opinion, in three languages),
and it makes the renderer usable by exactly one product.

This is not hypothetical. `ButtonComponent` used to accept `variant: "primary"`
and paint a hardcoded blue→violet brand gradient with a matching colored shadow.
The plugin could not override it — the gradient was not even *reachable* from the
Style IR. It was Uniview's brand, compiled into a renderer that was about to be
ported to two more platforms. It is gone now: gradients travel in the IR
(`bg-linear-to-br from-… to-…`), an unstyled button is a **real native bezel
button**, and the demo declares its own `demoBrandColor` inside `UniviewDemoApp`.

### The two constraints this implies

1. **The primitive set has a ceiling, and the core stays rewritable.**
   `UniviewNativeCore` (shadow tree, mutations, the layout seam) is deliberately
   small enough to reimplement per platform in about a week — which is why we can
   afford *not* to fight C++ interop across three platforms. Adding a primitive
   carries a per-platform cost forever; adding a *component* in TypeScript costs
   nothing. Prefer the component.
2. **High-frequency interaction is local, never RPC.** Scrolling, typing, hover
   and focus are handled natively and must never stream per-event across the
   transport. This is why style variants (`dark:`, `hover:`, `focus:`) travel
   *with* the node and are resolved by the host, instead of being pushed to the
   plugin for a re-render: a round trip per mouse-enter is wasteful locally and
   fatal when the plugin runs on another machine.

## STRUCTURE

```
uniview/
├── packages/
│   ├── protocol/         # RPC types, UINode schemas, event definitions
│   ├── react-renderer/   # Custom React reconciler → UINode tree
│   ├── react-runtime/    # React plugin bootstrap (worker + bridge client entry points)
│   ├── solid-renderer/   # Solid renderer → UINode tree
│   ├── solid-runtime/    # Solid plugin bootstrap
│   ├── tui-renderer/     # Terminal primitive renderer experiment
│   ├── host-sdk/         # Framework-agnostic host controller
│   └── host-svelte/      # Svelte 5 adapter (runes)
├── examples/             # Demo apps (full-stack implementations)
│   ├── host-svelte-demo/ # Svelte host demo
│   ├── host-react-demo/  # React host demo
│   ├── host-vue-demo/    # Vue host demo
│   ├── bridge-server/    # Shared WebSocket bridge (Elysia)
│   ├── plugin-api/       # React API components (Button, Input, etc.)
│   └── plugin-example/   # Demo plugins (Worker/Node modes)
├── vendors/
│   ├── kkrpc/          # RPC protocol (submodule)
│   └── svelte-react-render/  # Svelte 5 reconciler (submodule)
├── references/
│   └── opentui/        # Terminal UI reference (submodule)
├── pnpm-workspace.yaml   # Workspace + catalog for kkrpc
├── turbo.json           # Build orchestration
└── AGENTS.md           # This file
```

## WHERE TO LOOK

| Task                  | Location                                         | Notes                                  |
| --------------------- | ------------------------------------------------ | -------------------------------------- |
| Plugin React code     | `packages/react-renderer/src/`                   | Custom reconciler, UINode conversion   |
| Plugin runtime init   | `packages/react-runtime/src/`                    | Worker bootstrap, environment adapters |
| RPC protocol          | `packages/protocol/src/`                         | Type definitions, Zod schemas          |
| Host controller logic | `packages/host-sdk/src/`                         | Lifecycle, state management            |
| Svelte adapter        | `packages/host-svelte/src/`                      | Svelte 5 renderer, components          |
| Bridge server         | `examples/bridge-server/src/`                    | Elysia WebSocket multiplexer           |
| Examples              | `examples/*/`                                    | Plugin/host demo implementations       |
| Core RPC library      | `vendors/kkrpc/` # See vendors/kkrpc/AGENTS.md   |
| Svelte reconciler     | `vendors/svelte-react-render/` # See vendor docs |

## CODE MAP

| Symbol                 | Type      | Location                                  | Role                               |
| ---------------------- | --------- | ----------------------------------------- | ---------------------------------- |
| startWorkerPlugin      | Function  | react-runtime/src/worker-entry.ts         | Plugin bootstrap in Web Worker     |
| createWorkerController | Function  | host-sdk/src/index.ts                     | Host controller for worker plugins |
| PluginHost             | Component | host-svelte/src/PluginHost.svelte         | Svelte 5 plugin renderer           |
| UINode                 | Type      | protocol/src/types.ts                     | Serializable UI tree node          |
| reconcile              | Function  | react-renderer/src/reconciler/renderer.ts | React → UINode conversion          |
| serializeTree          | Function  | react-renderer/src/serializer/index.ts    | InternalNode → UINode conversion   |

## CONVENTIONS

### Build System

- **Package creation**: ALWAYS use `pnpm create tsdown@latest` - never manual config
- **Templates**: `default`, `react`, `svelte` for tsdown
- **Workspace**: `pnpm workspaces` + `turbo` orchestration
- **kkrpc source**: workspace-linked from `vendors/kkrpc/packages/kkrpc`; catalog tracks the external release line
- **Standard scripts**: `pnpm build`, `pnpm dev`, `pnpm lint`, `pnpm format`

### TypeScript Configuration

- **Target**: `esnext`, `module: preserve`, `moduleResolution: bundler`
- **Strictness**: `strict: true`, `noUnusedLocals: true`
- **Module syntax**: `verbatimModuleSyntax: true`, `isolatedModules: true`
- **Declarations**: `emitDeclarationOnly: true` (tsdown handles JS)
- **No type suppression**: `@ts-ignore`, `@ts-expect-error`, `as any` forbidden (from kkrpc)

### Code Style

- **Framework version**: Svelte 5 runes ONLY - Svelte 4 deprecated
- **Imports**: Sorted via `@ianvs/prettier-plugin-sort-imports`
- **Formatting**: Prettier with Tailwind plugin, no semicolons, tabs
- **ESM consistency**: Use `.mjs` for all ESM outputs (inconsistent: .js vs .mjs)

### Testing

- **Framework**: Vitest for unit tests
- **Browser testing**: Vitest Browser Mode + Playwright for UI tests
- **Playground pattern**: UI packages use `playground/` as Vite root for browser tests
- **Test location**: `tests/*.test.ts` or `tests/*.test.tsx` in package root

## ANTI-PATTERNS (THIS PROJECT)

- ❌ **NEVER** create packages manually - use `pnpm create tsdown@latest`
- ❌ **NEVER** access `window` or `document` in plugins (Workers/Node/Deno)
- ❌ **NEVER** pass functions directly over RPC - use handler-registry pattern
- ❌ **NEVER** call your own exposed RPC methods from plugin logic
- ❌ **NEVER** use Svelte 4 syntax - ALWAYS use Svelte 5 runes
- ❌ **NEVER** drop text children - host adapters must render string nodes
- ❌ **MUST NOT** define product-specific primitives in `@uniview/protocol`
- ❌ **NEVER** put a brand in a renderer — no invented color, gradient, radius or
  shadow in `UniviewAppKit` / `host-*`. The Style IR carries them and the plugin
  owns them. `accent` means the **user's** accent color, not yours.
- ❌ **NEVER** give a primitive a `variant` (`"primary"`, `"danger"`…). A variant is
  a design decision, so it is a TypeScript component that compiles to classes —
  never a branch inside the renderer.
- ❌ **NEVER** teach the renderer an app concept (sidebar, launcher, palette) —
  those are components in the plugin
- ❌ **NEVER** put a brand in a renderer — no invented colors, gradients, radii or
  shadows in `UniviewAppKit`/`host-*`. The Style IR carries them; the plugin owns
  them. `accent` means the *user's* accent color, not yours.
- ❌ **NEVER** give a primitive a `variant` (`"primary"`, `"danger"`…). A variant
  is a design decision, so it is a TypeScript component, not a renderer branch.
- ❌ **NEVER** let the renderer learn app concepts (sidebar, launcher, palette) —
  those are components in the plugin
- ❌ **NEVER** use `@ts-ignore`, `@ts-expect-error`, `as any`
- ❌ **DO NOT GUESS** during debugging - use logs and reproducible tests
- ❌ **NEVER** import `react-dom` in plugins - breaks Worker compatibility
- ❌ **NEVER** assume synchronous execution - handlers may be async
- ❌ **NEVER** mutate `InternalNode` after creation - treat as immutable
- ❌ **NEVER** couple host-sdk to specific framework - must remain framework-agnostic
- ❌ **NEVER** add plugin-as-server runtime entry points back - use bridge client mode

## UNIQUE STYLES

### Multi-Entry Runtime Package

`@uniview/react-runtime` exports worker/main-thread runtime APIs from the package root and the server-side bridge client from `./ws-client`:

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./ws-client": "./dist/ws-client.mjs"
  }
}
```

### Protocol-First Architecture

All plugin/host communication flows through `@uniview/protocol`:

- RPC methods defined in `protocol/src/rpc.ts`
- UINode tree schemas via Zod in `protocol/src/ui-node.ts`
- Event types in `protocol/src/events.ts`
- Version constant in `protocol/src/version.ts`

Changes to protocol must sync across ALL packages and bump `PROTOCOL_VERSION`.

### Handler Registry Pattern

Functions passed over RPC use handler IDs instead of direct function references:

```typescript
// Plugin side
const handlerId = registry.register(() => console.log("clicked"));
rpc.call("registerCallback", { handlerId });

// Host side
rpc.expose({ onCallback: (id: string) => registry.invoke(id) });
```

### Bridge Architecture

Server-side plugins use **Bridge Server** pattern (not plugin-as-server):

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Browser Host  │◄─────►│  Bridge Server  │◄─────►│  Plugin Client  │
│  (Svelte)      │  WS    │  (Elysia)       │  WS    │  (Node.js)      │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

**Why Bridge?**

- Plugins connect TO bridge (no port/NAT issues)
- Single port multiplexes all plugin connections
- Transparent forwarding preserves kkrpc protocol
- Simplified deployment (only bridge needs stable address)

### kkrpc Integration

- **Protocol**: kkrpc for all RPC communication
- **Transports**: Worker, WebSocket, HTTP, stdio (via kkrpc 1.0 transport factories)
- **Version**: Source linked from `vendors/kkrpc/packages/kkrpc`; external release line tracked in `pnpm-workspace.yaml`
- **Import**: `import { RPCChannel } from "kkrpc"` for core APIs; import runtime transports from explicit subpaths such as `kkrpc/worker` and `kkrpc/ws`

### Vendor Submodules

Core dependencies developed in parallel:

- `vendors/kkrpc/` - RPC protocol (see `vendors/kkrpc/AGENTS.md`)
- `vendors/svelte-react-render/` - Svelte 5 reconciler
- `references/opentui/` - Terminal UI reference implementation

### Triple Runtime Modes

Plugins support three execution environments:

| Mode            | Environment      | Isolation        | Use Case                         |
| --------------- | ---------------- | ---------------- | -------------------------------- |
| **Worker**      | Browser          | Full sandbox     | Production, untrusted plugins    |
| **WebSocket**   | Node.js/Deno/Bun | Process boundary | Server-side, full runtime access |
| **Main Thread** | Browser          | None             | Development, debugging           |

## packages/protocol

**Complexity Score:** 22 - RPC protocol core with Zod validation

### OVERVIEW

Core types, Zod schemas, and version contracts for plugin/host communication via kkrpc.

### WHERE TO LOOK

| Task               | Location            | Notes                                                  |
| ------------------ | ------------------- | ------------------------------------------------------ |
| UINode type        | `src/tree.ts`       | Serializable component tree definition                 |
| Protocol version   | `src/version.ts`    | Single constant, bump on breaking changes              |
| RPC contracts      | `src/rpc.ts`        | HostToPluginAPI, PluginToHostAPI interfaces            |
| Event prop helpers | `src/events.ts`     | handlerIdProp(), isHandlerIdProp(), extractEventName() |
| Zod schemas        | `src/validators.ts` | Runtime validation for all protocol types              |

### CONVENTIONS

**Zod Schema Pattern**
All protocol types have matching Zod schemas with `safeParse()` validation:

- `UINodeSchema` validates full tree structure
- `JSONValueSchema` recursively validates serializable values
- Request schemas for each RPC method (`InitializeRequestSchema`, etc.)

**Event Prop Mapping**
Functions become handler IDs before crossing RPC:

- `onClick` → props contain `_onClickHandlerId` (string ID)
- Use `handlerIdProp("onClick")` to generate prop name
- Use `isHandlerIdProp()` to detect handler props
- Use `extractEventName()` to reverse the mapping

**Protocol Versioning**
`PROTOCOL_VERSION` constant checked during `initialize()` handshake. Breaking changes = increment version. Additive changes = same version.

### ANTI-PATTERNS (protocol)

- ❌ **MUST NOT** define product-specific components (Button, Card, etc.) - keep protocol agnostic
- ❌ **NEVER** add dependencies beyond Zod - protocol must be lightweight and portable
- ❌ **NEVER** change types without bumping PROTOCOL_VERSION - breaks all existing hosts/plugins
- ❌ **NEVER** pass non-JSONValue over RPC - validation will fail at runtime
- ❌ **NEVER** remove LAYOUT_TAGS - hosts may rely on existing tags

## packages/host-sdk

**Complexity Score:** 16 - Framework-agnostic host controller

### OVERVIEW

Framework-agnostic host controller with unified transport abstraction for Worker/WebSocket/Main modes.

### STRUCTURE

```
src/
├── types.ts              # PluginController interface
├── registry.ts           # ComponentRegistry implementation
└── controllers/
    ├── worker.ts         # Web Worker controller
    ├── websocket.ts      # WebSocket controller (bridge mode)
    └── main.ts           # Main thread controller (dev only)
```

### WHERE TO LOOK

| Task                 | Location                       | Notes                     |
| -------------------- | ------------------------------ | ------------------------- |
| Controller interface | `src/types.ts`                 | PluginController contract |
| Worker mode          | `src/controllers/worker.ts`    | createWorkerController    |
| WebSocket mode       | `src/controllers/websocket.ts` | createWebSocketController |
| Main thread mode     | `src/controllers/main.ts`      | createMainController      |
| Component registry   | `src/registry.ts`              | createComponentRegistry   |

### CONVENTIONS

**Unified Interface**
All controllers implement `PluginController` - host code unchanged when switching modes.

**Tree Subscription**
Set-based subscriber pattern; multiple subscribers supported, cleanup via returned unsubscribe function.

**Transport Abstraction**
Worker uses `workerTransport()` from `kkrpc/worker`, WebSocket uses `webSocketClientTransport()` from `kkrpc/ws`, and Main bypasses RPC entirely with direct renderer bridge.

**Status Reporting**
`getStatus()` returns `{ mode, connected, lastError }` for UI state display.

### ANTI-PATTERNS (host-sdk)

- ❌ **NEVER** couple to specific framework - must remain framework-agnostic
- ❌ **NEVER** assume Worker availability - provide fallback or error handling
- ❌ **NEVER** expose raw RPC channel - encapsulate entirely in controller

## COMMANDS

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Development (turbo watch)
pnpm dev

# Test all
pnpm test

# Lint all
pnpm lint

# Format all
pnpm format

# Check types
pnpm check-types

# Run example (full demo: bridge + plugins + host)
cd examples/host-svelte-demo
pnpm dev:all
```

## NOTES

### Environment Support

Plugins run in:

- **Web Workers** (browser) - use `startWorkerPlugin()`
- **Node.js** (server) - use WebSocket bridge via `connectToHostServer()`
- **Deno** (server) - use WebSocket bridge
- **Bun** (server) - use WebSocket bridge

Hosts support:

- **Svelte 5** (via `@uniview/host-svelte`)
- **React** (example host via `@uniview/host-sdk`)
- **Vue** (example host via `@uniview/host-sdk`)

### Data Flow

```
Plugin (React) → react-renderer → InternalNode tree → serializeTree() → UINode tree → kkrpc RPC → Host SDK → Svelte adapter → UI
```

Events flow in reverse: User interaction → Host → kkrpc → HandlerRegistry.execute() → Plugin state update.

### CI/CD Gaps

- **Missing**: GitHub workflows for build/test/lint validation
- **Inconsistent linting**: `docs/` uses Biome, rest uses Prettier

### Extension Inconsistencies

- Mixed ESM extensions: `.mjs` (protocol, runtime, host-sdk) vs `.js` (react-renderer, host-svelte)
- **Runtime server mode**: use bridge-client entry points (`./ws-client`), not plugin-as-server exports

### Package Creation Workflow

```bash
# 1. Create with tsdown template
pnpm create tsdown@latest packages/my-new-package -t react

# 2. Update package.json exports (use .mjs for ESM)

# 3. Add to pnpm-workspace.yaml if needed

# 4. Add build scripts to turbo.json

# 5. Import in other packages via catalog
```
