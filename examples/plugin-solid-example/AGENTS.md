# plugin-solid-example - PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-11T19:12:00Z
**Commit:** N/A (not committed yet)
**Branch:** main

## OVERVIEW

Example SolidJS plugin for Uniview demonstrating three levels of complexity: simple demo (basic reactivity), advanced demo (form components), and stress benchmarks (high-load performance testing). Uses Bun build system with custom Babel transformation for SolidJS.

## STRUCTURE

```
plugin-solid-example/
├── src/                     # All source code
│   ├── simple-demo.tsx       # Basic SolidJS demo (signals, Show)
│   ├── simple-demo.worker.ts  # Worker mode entry point
│   ├── simple-demo.client.ts   # WebSocket client entry point
│   ├── advanced-demo.tsx      # Form with Input, Switch, Toggle components
│   ├── advanced-demo.worker.ts # Worker mode entry point
│   ├── advanced-demo.client.ts # WebSocket client entry point
│   ├── benchmark.tsx          # High-stress benchmark (5000-10000 items)
│   ├── benchmark-full.worker.ts     # Full diff mode entry
│   ├── benchmark-full.client.ts     # Full diff mode client
│   ├── benchmark-incremental.worker.ts # Incremental diff mode entry
│   └── benchmark-incremental.client.ts # Incremental diff mode client
├── dist/                    # Build output (client.js + worker.js pairs)
├── build.ts                 # Main build script (Bun + Babel + esbuild)
├── _build.ts               # Legacy esbuild config (unused)
├── package.json             # Package definition and scripts
└── tsconfig.json           # TypeScript config (ESNext, preserve module)
```

## WHERE TO LOOK

| Task                        | Location                               | Notes                                            |
| --------------------------- | -------------------------------------- | ------------------------------------------------ |
| Run simple demo             | `bun run client:simple`                | Opens WebSocket client for simple demo           |
| Run advanced demo           | `bun run client:advanced`              | Opens WebSocket client for advanced demo         |
| Run benchmark (full)        | `bun run client:benchmark-full`        | Full diff benchmark mode                         |
| Run benchmark (incremental) | `bun run client:benchmark-incremental` | Incremental diff benchmark mode                  |
| Build all                   | `bun run build`                        | Builds worker + client for all 4 demos           |
| Dev mode                    | `bun run dev`                          | Watch mode with auto-rebuild                     |
| Benchmark config            | `src/benchmark.tsx:70-78`              | CONFIG constant with stress parameters           |
| Worker entry pattern        | `*.worker.ts`                          | All workers use `startSolidWorkerPlugin()`       |
| Client entry pattern        | `*.client.ts`                          | All clients use `connectSolidToHostServer()`     |
| SolidJS components          | `*.tsx` files                          | Imports from `@uniview/example-solid-plugin-api` |

## CONVENTIONS

### Build System

**Custom Bun Build with Babel Transformation**

- Main script: `build.ts` uses Bun.build() with custom plugin
- Transformation: Babel @babel/core with babel-preset-solid
- Solid config: `moduleName: "@uniview/solid-renderer", generate: "universal"`
- TypeScript preset: @babel/preset-typescript
- Output: ESM with sourcemaps (external)

### Entry Point Naming

**Worker Mode** (runs in Web Worker browser environment)

- Pattern: `{demo}.worker.ts`
- Purpose: Isolated plugin execution
- Import: `startSolidWorkerPlugin` from `@uniview/solid-runtime`
- Usage: Pass `{ App }` object

**Client Mode** (runs in Node.js, connects to bridge server)

- Pattern: `{demo}.client.ts`
- Purpose: WebSocket client connecting to bridge server
- Import: `connectSolidToHostServer` from `@uniview/solid-runtime/ws-client`
- Usage: Pass `{ App, serverUrl, pluginId, mode }`
- Environment: `SERVER_URL` env var (default: ws://localhost:3000)
- Environment: `PLUGIN_ID` env var (default: based on demo name)

**Benchmark Modes**

- `mode: "full"` — Full diff tree serialization
- `mode: "incremental"` — Incremental diff updates (better for large updates)

### SolidJS Patterns

**Component Structure**

- Use `createSignal<T>(initial)` for reactive state
- Use `Show when={condition()}>` for conditional rendering
- Use `For each={items()}>` for lists (benchmark only)
- Use `onCleanup(() => ...)` for cleanup (benchmark intervals)

**Event Handlers**

- All handlers defined as arrow functions inside component
- Passed directly to UI components (e.g., `onClick={handleSubmit}`)
- No special wrapper needed (Solid passes functions directly)

**TypeScript**

- Explicit `type Component = () => JSX.Element` for component return types
- Interface definitions for complex state objects (FormData, BenchmarkItem, Stats)
- Strong typing throughout (strict mode enabled)

### Benchmark Configuration

**High-Stress Parameters** (CONFIG object)

- `INITIAL_ITEMS: 5000` — Starting item count
- `MAX_ITEMS: 10000` — Maximum item count
- `WORDS_PER_ITEM: 100` — Long lorem ipsum per item
- `BATCH_SIZE: 50` — Insert/remove 50 items at a time
- `AUTO_BENCHMARK_INTERVAL: 50` — 50ms between auto operations
- `AUTO_BENCHMARK_CYCLES: 200` — Run 200 cycles in auto mode
- `ITEMS_PER_AUTO_OP: 25` — 25 items per auto operation

**Deterministic Randomness**

- `SeededRandom` class with LCG algorithm
- Ensures same sequence every run for reproducible benchmarks
- `rng = new SeededRandom(12345)` — Fixed seed

**Metrics Tracking**

- Reads from `globalThis.__uniview_stats` (set by runtime)
- Tracks: `bytesSent`, `messagesSent`
- Measures: operation time, total bytes, messages, average per operation

## ANTI-PATTERNS (THIS PROJECT)

- ❌ **NEVER modify `benchmark.tsx` CONFIG without understanding** — changes affect stress test results
- ❌ **NEVER use `solid-js` imports directly** — use `@uniview/solid-renderer` for uniview compatibility
- ❌ **NEVER run worker and client simultaneously without bridge server** — client needs ws://localhost:3000 running
- ❌ **NEVER remove `_build.ts`** — legacy config kept for reference (esbuild-only alternative)
- ❌ **DO NOT assume synchronous RPC** — all plugin-host communication is async
- ❌ **NEVER access browser APIs (window, document) in worker files** — workers can't access DOM
- ❌ **DO NOT mix full and incremental modes** — use one mode per benchmark run for consistent results
- ❌ **NEVER ignore benchmark stats** — globalThis.\_\_uniview_stats must be tracked for accurate metrics

## UNIQUE STYLES

### Dual-Mode Entry Points

Each demo has 2 entry points (worker + client) with identical App component:

- `simple-demo.worker.ts` + `simple-demo.client.ts`
- `advanced-demo.worker.ts` + `advanced-demo.client.ts`
- `benchmark.tsx` + 2 client entry points (full vs incremental)

**Why?** Demonstrates both execution modes:

1. **Worker mode**: Direct Web Worker plugin (browser only)
2. **Client mode**: Node.js WebSocket client connecting to bridge server (server-side plugins)

### Build Output Organization

Each demo produces 2 build artifacts:

- `{demo}.worker.js` — For worker mode (browser-compatible)
- `{demo}.client.js` — For client mode (Node.js/Bun-compatible)

With sourcemaps: `{demo}.worker.js.map` and `{demo}.client.js.map`

### Benchmark Stress Testing

Benchmark is designed to find performance limits:

- Starts with 5000 items (large list)
- Grows to 10000 items (stress limit)
- 100 words per item (large text payload)
- 50 items per operation (batch updates)
- 200 auto cycles (sustained load)
- Random position insertions/removals (worst-case re-rendering)

**Operations Tested:**

1. `Add Items` — Insert 50 items at random positions
2. `Remove Items` — Remove 50 items from random positions
3. `Mixed Operation` — Remove 50, then insert 50 (high stress)
4. `Update All Texts` — Update all item text (full tree diff)
5. `Update Single Item` — Update one random item (incremental diff)
6. `Auto-Benchmark` — Cycle through operations every 50ms for 200 cycles

### Component API Usage

**From `@uniview/example-solid-plugin-api`:**

- `Button` — Interactive button with variants (primary, secondary, outline)
- `Input` — Text input field with label and placeholder
- `Switch` — Toggle switch (boolean state, on/off)
- `Toggle` — Pressed/unpressed state (exclusive selection: email/SMS/push)

**Demo Progression:**

1. **Simple** — Button + Input (basic reactivity)
2. **Advanced** — Button + Input + Switch + Toggle (form handling)
3. **Benchmark** — Button only (stress testing, large list rendering)

## COMMANDS

```bash
# Install dependencies
pnpm install

# Build all demos (worker + client)
bun run build

# Development with watch mode
bun run dev

# Run all client demos (requires bridge server at ws://localhost:3000)
bun run client

# Run specific demos
bun run client:simple
bun run client:advanced
bun run client:benchmark-full
bun run client:benchmark-incremental
```

## NOTES

### Bridge Server Requirement

Client mode (`*.client.ts`) requires **bridge server** running at `ws://localhost:3000`:

- Use `@uniview/examples/bridge-server` (Elysia WebSocket multiplexer)
- Or any compatible WebSocket server implementing uniview protocol
- Without bridge, client will fail to connect

### Environment Variables

**Client mode configuration:**

```bash
export SERVER_URL="ws://localhost:3000"
export PLUGIN_ID="solid-simple-demo"
bun dist/simple-demo.client.js
```

### Benchmark Metrics Interpretation

**Operation Metrics** (Per button click):

- `Operations performed` — Total manual operations executed
- `Last operation` — Time for most recent operation (ms)
- `Avg time/operation` — Mean operation time across all clicks
- `Messages in last op` — RPC messages sent in last operation
- `Avg messages/op` — Mean RPC messages per operation
- `Avg bytes/op` — Mean bytes transferred per operation

**Message Metrics** (Per message):

- `Total messages` — Cumulative RPC messages since start
- `Total bytes` — Cumulative bytes transferred
- `Bytes/message` — Mean bytes per RPC message
- `Time/message` — Mean time per RPC message (μs)

### Deterministic Benchmark Results

All benchmarks use `SeededRandom` with fixed seed (12345):

- Same operations every run
- Same insert/remove positions
- Same lorem ipsum text generation
- Enables accurate performance comparisons across runs

### No Test Files

This is an example/demo package — no unit tests included.

- Test by running demos and verifying UI behavior
- Benchmark results are the primary validation method

### Legacy Build Config

`_build.ts` exists as reference for esbuild-only builds (without Babel):

- Not used by current `build.ts`
- Shows alternative SolidJS transformation approach
- Kept for educational purposes

## CODE MAP

| Symbol                        | Type      | Location                                                  | Role                                  |
| ----------------------------- | --------- | --------------------------------------------------------- | ------------------------------------- |
| App                           | Component | simple-demo.tsx:5, advanced-demo.tsx:13, benchmark.tsx:80 | Root component for each demo          |
| startSolidWorkerPlugin        | Function  | \*.worker.ts:1                                            | Worker mode initialization            |
| connectSolidToHostServer      | Function  | \*.client.ts:1                                            | Client mode initialization            |
| CONFIG                        | Constant  | benchmark.tsx:70                                          | Benchmark stress parameters           |
| SeededRandom                  | Class     | benchmark.tsx:34                                          | Deterministic RNG for reproducibility |
| createSignal                  | Import    | \*.tsx files                                              | SolidJS reactive state                |
| Show, For                     | Import    | \*.tsx files                                              | SolidJS conditional/list rendering    |
| Button, Input, Switch, Toggle | Import    | \*.tsx files                                              | UI component library                  |
| globalThis.\_\_uniview_stats  | Property  | benchmark.tsx:108                                         | Runtime stats tracking                |
