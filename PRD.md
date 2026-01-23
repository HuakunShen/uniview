# Uniview - Universal React Plugin System (PRD)

Org: `@uniview/*`

This document defines an implementation-ready design for a clean-slate repo: a pnpm workspace monorepo that enables authors to build React-based plugins which can run in multiple runtimes (Web Worker / Node.js over WebSocket / Main Thread) and render into host UIs implemented in Svelte, Vue, React, or other frameworks.

The design is based on lessons learned from the previous prototype (custom React reconciler -> serializable tree -> host renderers + handler-id event proxying), but reorganized so that:

- The protocol is explicit and versioned.
- Host integration logic is framework-agnostic (no duplicated Worker/WS code per host).
- Framework adapters are thin (render UINode + map events).
- Plugin authoring is ergonomic (authors write React components; runtime bootstrap is provided by SDK/CLI).

---

## 1. Background / Story (故事背景)

目标是做一个“universal 插件系统”（基础设施层），并且明确拆分：

- `@uniview/*` 提供通用基础设施（协议 + 运行时 + Host SDK），可被任何产品复用
- 具体产品（例如 kunkun）会单独提供自己的“插件 API 包”（例如 `@kunkun/api`），类似 Raycast 的做法
  - 这个产品包会定义插件作者能用的 API + React Components（Switch/Toggle 等）
  - 这些 Components 并不是 DOM 组件，而是产出 Uniview 协议里的“primitive node”
  - Host 侧只要实现这些 primitives 的映射，就能渲染该产品的插件

- 插件作者写 React（因为生态成熟，状态管理/组件模型强）。
- 宿主应用可以是任意 UI 框架（Svelte/Vue/React/Angular/原生 AppKit/…），只要实现“渲染协议”。
- 插件在生产环境默认要可隔离（Worker / Node），不能要求 DOM。
- 插件 UI 不直接渲染 DOM，而是渲染到一套跨平台“UI Primitives”（Button/Input/Form 等），由 Host 在本地 UI 框架里实现。

灵感来源：Raycast 的插件系统（React 写 UI，底层自定义 renderer 输出到原生 UI）。

---

## 2. Goals / Non-Goals

### 2.1 Goals

G1. 插件一次编写，多宿主渲染：任何 host 只要对接协议即可渲染插件。

G2. 多运行时模式：

- Worker mode: 浏览器 Worker 执行插件，Host 渲染 UI。
- Node mode: Node 服务器执行插件（可用 Node API），浏览器 Host 渲染 UI。
- Main-thread mode: 开发/可信环境直接运行插件组件（最快、最好 debug）。

G3. 严格事件跨边界：函数不跨边界，事件通过 handlerId + RPC 回调。

G4. 协议版本化：Host 与 Plugin 运行时握手，协议不匹配能明确报错。

G5. 工程化：

- Host SDK 提供统一 controller（worker/ws lifecycle + state + reconnection）。
- 插件 SDK/CLI 提供标准入口，不需要复制模板文件。

### 2.2 Non-Goals

N1. 不支持任意 React DOM/HTML。插件不能用任意第三方 UI 组件库直接输出 DOM。

N2. v1 不做完整权限系统（filesystem/network capability），但要设计扩展点。

N3. v1 不做“真正安全的 untrusted JS sandbox” beyond Worker/Node isolation（例如 SES/Realm），但要为未来留接口。

---

## 3. Personas / Use Cases

### 3.1 Plugin Author

- 想写一个 UI + stateful plugin（表单、切换、列表），不关心宿主用 Svelte 还是 Vue。
- 希望本地快速调试（main-thread）并能在 Worker/Node 上行为一致。

### 3.2 Host App Developer

- 有一个 Svelte/Vue/React App，希望加载插件并渲染。
- 希望控制插件运行模式（Worker/Node），并能在 UI 层显示连接状态/错误。

### 3.3 Platform Owner

- 维护一个插件生态，希望协议稳定、可升级。
- 希望插件打包/发布流程统一。

---

## 4. Functional Requirements (FR)

FR1. 插件作者 API

- 插件以 React 组件（默认导出）形式存在。
- 使用 `@uniview/react` 提供的 primitives。

FR2. Host 渲染

- Host 能渲染 `UINode` 树。
- Host 能将用户交互映射为 RPC `executeHandler(handlerId, args)`。

FR3. 生命周期

- Host 能 initialize / updateProps / destroy。
- Plugin runtime 能持续推送 tree updates。

FR4. 日志与错误

- 插件可日志输出到 Host。
- 插件 runtime 错误上报到 Host。

FR5. 热更新（v1 minimal）

- Worker mode: 支持重新加载 plugin URL。
- Node mode: 支持断线重连。

---

## 5. Non-Functional Requirements (NFR)

NFR1. Protocol stability

- 协议必须显式声明版本；Host 和 Plugin runtime 需握手验证。

NFR2. Deterministic behavior across modes

- 同一个插件在 Worker/Node/Main-thread 模式下 UI 和 state 行为一致（除了环境能力差异）。

NFR3. No DOM in sandboxed modes

- Worker/Node 插件运行时不得依赖 `window/document`。

NFR4. Performance

- UI tree 更新要可扩展（v1 可以全量 tree 更新，但协议要预留 diff/patch）。

NFR5. Testability

- unit + integration + e2e。

---

## 6. Core Architecture

### 6.1 Producer / Receiver split

Producer (Plugin Runtime):

- React reconciler renders plugin React tree into an in-memory host tree.
- The tree is serialized into `UINode` (protocol schema).
- Event handlers are stored in a handler registry and replaced with handler IDs in the serialized tree.

Receiver (Host):

- Loads and connects to plugin runtime (Worker / WebSocket / direct).
- Receives `updateTree(UINode)` messages.
- Renders UINode into host UI primitives.
- On user interaction, calls back `executeHandler(handlerId, args)`.

### 6.2 Why custom reconciler

This allows us to:

- Treat UI as “protocol output”, not DOM.
- Run React logic in Worker/Node.
- Render UI via any host toolkit.

---

## 7. Protocol Design (`@uniview/protocol`)

This package must be the single source of truth. Nothing else defines message shapes.

### 7.1 Versioning

- `PROTOCOL_VERSION = 1` (number)
- Handshake: Host calls `initialize({ protocolVersion, props })`.
- Plugin runtime rejects if protocolVersion unsupported.

### 7.2 JSON-safe payloads

All cross-boundary payloads MUST be structured-clone/JSON safe.

```ts
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue };
```

### 7.3 UI tree schema

The protocol must be product-agnostic. Uniview must NOT hardcode primitives like `Switch/Toggle`.

Instead:

- `type` is a `string`.
- The host adapter treats a small subset of `type` values as “layout tags” (`div`, `span`, ...).
- Everything else is treated as a “primitive/component node” whose meaning is defined by a _product API package_ (e.g. `@kunkun/api`) and rendered by the host via a registry.

```ts
export type UILayoutTag =
  | "div"
  | "span"
  | "p"
  | "section"
  | "header"
  | "footer"
  | "ul"
  | "ol"
  | "li"
  | "br"
  | "hr";

export interface UINode {
  id: string;
  type: string; // layout tag OR product-defined primitive type
  props: Record<string, JSONValue>;
  children: (UINode | string)[];
}

export const LAYOUT_TAGS: readonly UILayoutTag[] = [
  "div",
  "span",
  "p",
  "section",
  "header",
  "footer",
  "ul",
  "ol",
  "li",
  "br",
  "hr",
];
```

Notes:

- `id` is required for stable reconciliation on the host side.
- v1 pushes full trees. We reserve a future extension for patch/diff.

### 7.4 Event handler IDs

We never send functions across boundaries.

```ts
export type HandlerId = string; // format: h_<counter> or uuid

export type EventPropName =
  | "onClick"
  | "onChange"
  | "onInput"
  | "onSubmit"
  | "onFocus"
  | "onBlur"
  | "onKeyDown"
  | "onKeyUp"
  | "onMouseEnter"
  | "onMouseLeave";

export const EVENT_PROPS: readonly EventPropName[] = [
  "onClick",
  "onChange",
  "onInput",
  "onSubmit",
  "onFocus",
  "onBlur",
  "onKeyDown",
  "onKeyUp",
  "onMouseEnter",
  "onMouseLeave",
];

export function handlerIdProp(eventProp: EventPropName): string {
  return `_${eventProp}HandlerId`;
}
```

Example serialized props:

```json
{
  "checked": true,
  "_onChangeHandlerId": "h_12"
}
```

### 7.5 RPC contract

One contract across all modes.

```ts
export interface HostToPluginAPI {
  initialize(req: { protocolVersion: 1; props?: JSONValue }): Promise<void>;
  updateProps(props: JSONValue): Promise<void>;
  executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>;
  destroy(): Promise<void>;
}

export interface PluginToHostAPI {
  updateTree(tree: UINode | null): void;
  log(level: "log" | "info" | "warn" | "error", args: JSONValue[]): void;
  reportError(err: { message: string; stack?: string }): void;
}
```

---

## 8. Packages and Responsibilities

We will use multiple packages (recommended) instead of “one big package with subpath exports” to avoid:

- mixed TSX/JSX toolchains leaking into host packages (a known pain in Vue hosts)
- ambiguous dependency graphs
- bundler configuration coupling

However, we will still provide subpath exports within each package where it helps (e.g. `@uniview/runtime/worker`).

### 8.1 `@uniview/protocol`

Purpose:

- Define stable protocol: types, zod schemas, versioning.
- Zero dependency on React/Svelte/Vue.

Deliverables:

- `src/version.ts`, `src/tree.ts`, `src/rpc.ts`, `src/events.ts`
- Zod validators for:
  - `UINode`
  - RPC request/response payload shapes

### 8.2 `@uniview/react-renderer`

Purpose:

- The core custom React reconciler that produces an internal tree suitable for serialization into `UINode`.
- This package is _infrastructure_, not a product API. It must not define product primitives (Switch/Toggle/etc).

Exports:

- `createRenderer()` / `render()`
- Internal tree type used by serialization

Important constraints:

- No DOM.
- Must work in Node/Deno/Bun/Worker (subject to React availability).

What this package does NOT provide:

- It does not export any UI components for plugin authors. Those come from product API packages like `@kunkun/api`.

### 8.3 `@uniview/runtime`

Purpose:

- Plugin-side runtime bootstrap that implements `HostToPluginAPI`.
- Own handler registry + serialization.
- Supports multiple JS runtimes: Node.js / Deno / Bun / Web Worker.

Key APIs:

```ts
export interface PluginRuntime {
  initialize(props?: JSONValue): Promise<void>;
  updateProps(props: JSONValue): Promise<void>;
  executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>;
  destroy(): Promise<void>;
}

export interface PluginRuntimeOptions {
  App: () => JSX.Element; // React component
  onUpdateTree: (tree: UINode | null) => void;
  onLog: (level: "log" | "info" | "warn" | "error", args: JSONValue[]) => void;
  onError: (err: { message: string; stack?: string }) => void;
}

export function createPluginRuntime(opts: PluginRuntimeOptions): PluginRuntime;
```

Transport abstraction:

`@uniview/runtime` should not be locked to a single RPC lib. It should define a minimal transport interface, and provide official adapters.

```ts
export interface RpcTransport {
  send(payload: unknown): void;
  onMessage(cb: (payload: unknown) => void): () => void;
  close(): void;
}
```

Official adapters (subpath exports):

- `@uniview/runtime/worker`:
  - uses `postMessage` in Worker
- `@uniview/runtime/ws-node`:
  - Node WebSocket server transport
- `@uniview/runtime/ws-browser`:
  - browser WebSocket client transport (used by host-sdk)
- `@uniview/runtime/stdio` (optional):
  - for Electron/native shells that prefer stdio RPC

Note:

- Deno/Bun can use WebSocket transports with their respective APIs.

Design note:

- Runtime uses `@uniview/react` reconciler.
- Serialization uses `@uniview/protocol` and produces `UINode`.

### 8.4 `@uniview/host-sdk`

Purpose:

- Framework-agnostic host controller layer.
- No Svelte/Vue/React UI code.

Key API:

```ts
export type HostMode = "worker" | "websocket" | "main";

export interface PluginController {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  updateProps(props: JSONValue): Promise<void>;
  reload(): Promise<void>; // reload plugin (worker/ws)

  getTree(): UINode | null;
  subscribe(cb: (tree: UINode | null) => void): () => void;

  execute(handlerId: HandlerId, args?: JSONValue[]): Promise<void>;

  getStatus(): {
    mode: HostMode;
    connected: boolean;
    lastError?: string;
  };
}
```

Controllers:

- `createWorkerController({ pluginUrl, props })`
- `createWebSocketController({ serverUrl, props })`
- `createMainController({ App, props })`

Internals:

- Manages RPC wiring (`kkrpc` recommended) and reconnection strategy.
- Emits logs/errors.

### 8.5 `@uniview/host-svelte`

Purpose:

- Svelte 5 adapter: render UINode into Svelte components.
- Provide a Svelte-friendly wrapper around `PluginController`.

Deliverables:

- `ComponentRenderer.svelte` (recursive)
- `createPluginStore(controller)` returns `$state`-based store.

Key design points:

- Must handle void elements (`br`, `hr`).
- Must preserve text children.
- Must map handler ID props into actual event handlers that call `controller.execute`.

### 8.6 `@uniview/host-vue`

Purpose:

- Vue 3 adapter: render UINode into Vue components.

Deliverables:

- `ComponentRenderer.vue` (recursive)
- `usePluginController(controller)` composable

Important design rule (lesson learned):

- Vue package should not need to compile React TSX from plugin source. In examples, Vue host should load built plugin bundles (worker/ws) or use main-mode by importing prebuilt JS from a dedicated “plugin-dev” package.

### 8.7 `@uniview/host-react` (optional)

Purpose:

- React adapter useful for debugging host behavior.
- Not required for universal concept, but good as reference.

### 8.8 `@uniview/cli`

Purpose:

- Remove boilerplate. Plugin authors should not write worker/server entry manually.
- Provide standardized build/dev workflows.

Commands (v1):

- `uniview init`:
  - scaffold a plugin package or host package
- `uniview plugin dev`:
  - watch plugin source, serve worker bundle over HTTP with CORS
- `uniview plugin build`:
  - produce production bundles
- `uniview plugin server`:
  - start node websocket servers

Build tool choice:

- Keep it simple in v1: use esbuild/rollup via Node (avoid requiring Bun).
- Bun support can be optional if desired.

---

## 9. Repo Structure (new clean monorepo)

Suggested layout:

```
.
├── package.json
├── pnpm-workspace.yaml
├── turbo.json                   # optional
├── PRD.md
├── packages/
│   ├── protocol/
│   ├── react/
│   ├── runtime/
│   ├── host-sdk/
│   ├── host-svelte/
│   ├── host-vue/
│   ├── cli/
│   └── examples/
│       ├── plugin-hello/
│       ├── host-svelte-demo/
│       └── host-vue-demo/
└── docs/
    ├── architecture.md
    ├── security.md
    └── protocol.md
```

---

## 10. Detailed Runtime Flows

### 10.1 Worker mode sequence

1. Host loads plugin bundle:
   - `fetch(pluginUrl)` -> JS text
   - create Blob URL -> `new Worker(blobUrl, { type: 'module' })`
2. Host creates RPC channel and exposes `PluginToHostAPI`.
3. Worker starts `startWorkerPlugin({ App })`:
   - creates plugin runtime
   - reconciler renders
   - serializes to UINode
   - calls `updateTree(tree)`
4. Host receives tree and renders.
5. User triggers event:
   - Host adapter maps UI event -> JSON args
   - Host calls `executeHandler(handlerId, args)`.

### 10.2 WebSocket (Node) mode sequence

1. Node server runs `startWebSocketPluginServer({ App, port })`.
2. Browser host connects using controller.
3. Same RPC contract.
4. Server pushes tree updates.
5. Host sends `executeHandler` to server.

Reconnection:

- host-sdk implements exponential backoff with max attempts.

### 10.3 Main-thread mode sequence

1. Host imports React plugin component (dev-only)
2. host-sdk main controller creates `@uniview/react` renderer in-process
3. Host receives tree from the same serialization path
4. No RPC needed; controller.execute can call handler registry directly
   - Still keep same interface for adapters.

---

## 11. Serialization & Handler Registry (Implementation Rules)

### 11.1 Serialization

Algorithm:

- Walk internal reconciler tree.
- For each node:
  - copy serializable props
  - for event props listed in protocol:
    - register function in registry -> handlerId
    - set prop `_onXHandlerId` to that id
  - drop non-serializable values

### 11.2 Registry

- `Map<HandlerId, (...args) => unknown>`
- handlerId generation: `h_${counter}` (ok for v1)
- reset on plugin reload.

### 11.3 Event payload standardization (important)

To avoid the bug class we saw in prototype (Switch/Toggle not syncing), standardize what args are passed.

v1 event arg conventions:

- Button/Toggle: `executeHandler(id, [])`
- Input onChange: `executeHandler(id, [value: string])`
- Switch onChange: `executeHandler(id, [checked: boolean])`

Adapters must ensure they do not pass native DOM events.

---

## 12. Host Adapter Rendering Rules

### 12.1 Mapping (registry)

Because Uniview protocol is product-agnostic, hosts must render primitives via a registry.

Host adapter must allow:

- a mapping from `type: string` to a host component
- a fallback renderer for unknown types

Example:

```ts
export type HostComponent = unknown; // framework-specific

export interface ComponentRegistry {
  get(type: string): HostComponent | undefined;
}
```

For a product like kunkun:

- `@kunkun/api` defines primitives like `Switch`, `Toggle` etc (as React components for plugin authors)
- `kunkun host` provides a registry mapping:
  - `type === 'Switch'` -> Vue/Svelte switch component
  - `type === 'Toggle'` -> Vue/Svelte toggle component

### 12.2 Prop normalization

Protocol will include React-ish props (e.g. `className`, `htmlFor`) only if plugin authors need them.
Recommendation:

- In `@uniview/react` primitives, normalize to protocol-friendly names early:
  - use `class` not `className` in protocol
  - use `for` not `htmlFor`

This reduces work for host adapters.

### 12.3 Void elements

`br`, `hr` must be rendered without children.

### 12.4 Text children

Text children must not be dropped. Host adapter should render string nodes.

---

## 13. Build / Packaging Strategy

### 13.1 Dependencies

- `@uniview/protocol`: no react
- `@uniview/host-*`: no react-reconciler
- `@uniview/react` and `@uniview/runtime`: depend on react

### 13.2 Plugin bundle strategies

Support both strategies:

Strategy A (externals):

- plugin bundle externalizes `react`, `@uniview/react`, `@uniview/runtime`
- host build tool resolves these imports

Strategy B (self-contained):

- plugin bundle includes react + runtime
- easiest distribution; larger bundles; careful about multiple React instances

v1 decision:

- CLI defaults to Strategy A for “platform host” example apps.
- Provide `--self-contained` option.

---

## 14. Security / Isolation (v1)

Worker mode:

- isolates plugin code from main thread DOM
- still shares CPU and memory of origin; it is not a full sandbox

Node mode:

- plugin code runs on server; can be sandboxed by OS/container

v1 guardrails:

- Document “no DOM access” rule.
- Validate protocol messages (zod) to prevent malformed trees from crashing host.

Future:

- capability model for node mode (filesystem/network)
- signed plugin manifests

---

## 15. Testing Plan

Unit:

- `protocol`: schema validation, message parsing
- `runtime`: handler registry, serialization

Integration:

- worker controller connects to a test worker, receives tree, triggers events
- websocket controller connects to a test node server

E2E:

- Svelte host demo:
  - run a plugin with Input + Switch + Toggle and verify state sync

---

## 16. Example “Hello Plugin” Walkthrough

### 16.1 Plugin code (product API package)

```tsx
import { useState } from "react";
import { Button, Input, Switch, Toggle } from "@kunkun/api";

export default function HelloPlugin() {
  const [name, setName] = useState("");
  const [notify, setNotify] = useState(false);
  const [pref, setPref] = useState<"email" | "sms">("email");

  return (
    <div class="p-4 space-y-3">
      <Input value={name} placeholder="Your name" onChange={setName} />
      <Switch checked={notify} onChange={setNotify} />
      <div class="flex gap-2">
        <Toggle pressed={pref === "email"} onClick={() => setPref("email")}>
          Email
        </Toggle>
        <Toggle pressed={pref === "sms"} onClick={() => setPref("sms")}>
          SMS
        </Toggle>
      </div>
      <Button
        title="Submit"
        onClick={() => console.log({ name, notify, pref })}
      />
    </div>
  );
}
```

### 16.2 Worker mode host usage (host-sdk)

```ts
import { createWorkerController } from "@uniview/host-sdk";

const controller = createWorkerController({
  pluginUrl: "http://localhost:3000/hello.worker.js",
  initialProps: {},
});

await controller.connect();
controller.subscribe((tree) => {
  // render tree using host adapter
});
```

### 16.3 Adapter event mapping

- Switch UI change -> `controller.execute(handlerId, [checked])`
- Input change -> `controller.execute(handlerId, [value])`
- Toggle click -> `controller.execute(handlerId, [])`

---

## 17. Implementation Roadmap (how to start building)

Phase 0: Repo bootstrap

- pnpm workspace
- TS configs, lint, formatting

Phase 1: protocol

- define types + zod
- define RPC interfaces

Phase 2: react reconciler

- implement `@uniview/react` (renderer + primitives)
- create internal tree type -> serialize into protocol tree

Phase 3: runtime

- implement handler registry + createPluginRuntime
- implement worker entry helper
- implement node websocket server helper

Phase 4: host-sdk

- implement controllers:
  - worker (fetch+blob+rpc)
  - websocket (connect+reconnect)
  - main (in-process)

Phase 5: adapters + demos

- implement host-svelte renderer
- implement host-vue renderer
- create examples demonstrating all modes

Phase 6: cli

- scaffold plugin + host
- build/dev/server commands

---

## 18. Naming

Org is fixed: `@uniview`.

Repo name recommendation:

- `uniview` (simple)

Package naming convention:

- `@uniview/protocol`
- `@uniview/react`
- `@uniview/runtime`
- `@uniview/host-sdk`
- `@uniview/host-svelte`
- `@uniview/host-vue`
- `@uniview/cli`

---

## 19. Alternative: single-package + subpath exports (not recommended)

Alternative design:

- one package `@uniview/core` with exports:
  - `@uniview/core/protocol`
  - `@uniview/core/runtime`
  - `@uniview/core/host`

Why not recommended:

- mixed dependencies (react-reconciler) leak into host installs
- harder to keep Vue/Svelte packages clean
- slower installs / larger bundles

---

## 20. Open Questions (can be decided during implementation)

1. Should protocol allow arbitrary HTML tags or restrict to primitives only?
   - Recommendation: allow small safe subset for layout hints.

2. Should `id` be deterministic across renders?
   - Recommendation: reconciler assigns stable IDs per fiber/key.

3. Tree update strategy:
   - v1: full tree updates
   - v2: patch/diff protocol
