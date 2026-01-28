# WebSocket Architecture Redesign - Work Plan

## TL;DR

> **Quick Summary**: 将 N 个 Plugin WS 服务器合并为 1 个 Elysia 服务器，Plugin 从"服务器"变为"客户端"，通过 Bridge 模式透明转发消息。
>
> **Deliverables**:
>
> - 新的 Elysia Bridge 服务器 (`examples/host-svelte-demo/server/`)
> - 新的 Plugin 客户端入口 (`@uniview/runtime/ws-client`)
> - 修改 Host SDK 的 WebSocket Controller
> - 合并静态文件服务
> - 简单集成测试
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7

---

## Context

### Original Request

用户希望将当前"每个 Plugin 一个 WS Server"的架构改为"一个 Elysia Server + 多个 Plugin Client"，这样无论多少 Plugin 都只需要一个服务器。

### Interview Summary

**Key Discussions**:

- WS Server Strategy: Standalone Elysia Server（不嵌入 SvelteKit）
- Plugin Identity: URL Path Parameter `/plugins/:pluginId`
- Browser-Plugin Flow: Bridge 透明转发（不解析 RPC 消息）
- Server Location: `examples/host-svelte-demo` 目录
- Plugin ID 来源: 文件名即 ID（simple-demo.server.ts → pluginId = 'simple-demo'）
- 连接顺序: Host 先连 Plugin 未就绪时返回错误，Host 自己重试
- 多 Host 场景: 不支持，1 Plugin : 1 Host（1对1）

**Research Findings**:

- kkrpc 已有 `ElysiaWebSocketServerIO` 和 `ElysiaWebSocketClientIO`
- `feedMessage()` 静态方法用于路由消息
- SvelteKit 不原生支持 WS，standalone Elysia 更简单

### Metis Review

**Identified Gaps** (addressed):

- Plugin Identity: 确认为文件名约定
- Connection Ordering: 确认为返回错误让 Host 重试
- Multi-Host: 确认不支持，1对1

---

## Work Objectives

### Core Objective

将 WebSocket 架构从 N 服务器改为 1 服务器 + N 客户端，使用 Bridge 模式透明转发。

### Concrete Deliverables

- `examples/host-svelte-demo/server/index.ts` - Elysia Bridge 服务器
- `packages/runtime/src/ws-client.ts` - Plugin 客户端运行时
- `packages/runtime/src/ws-client-entry.ts` - Plugin 客户端入口
- 修改 `packages/host-sdk/src/controllers/websocket.ts`
- 修改 `examples/plugin-example/src/*.server.ts` 使用新客户端
- 简单集成测试

### Definition of Done

- [x] Host 连接 Elysia → Plugin 连接 Elysia → Host 发 initialize → Plugin 回 updateTree → Host 收到
- [x] 静态文件 `/simple-demo.worker.js` 可访问，MIME 正确
- [x] Worker 模式仍然正常工作（回归测试）

### Must Have

- Bridge 透明转发（不解析 RPC 消息）
- 静态文件服务（替代 build.ts 的 serve）
- Plugin 客户端模式
- 1 Plugin : 1 Host 限制

### Must NOT Have (Guardrails)

- ❌ 不在 Bridge 中解析或检查 RPC 消息内容
- ❌ 不修改 Worker 模式相关代码
- ❌ 不添加认证/授权（v1 不需要）
- ❌ 不添加重连逻辑（v1 不需要）
- ❌ 不添加 Plugin 发现服务
- ❌ 不过度抽象（Bridge 就一个文件，不要 BridgeManager、ConnectionPool 等）

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (vitest in packages)
- **User wants tests**: 简单集成测试
- **Framework**: vitest / bun:test

### Manual Execution Verification

**For Elysia Server:**

- [ ] `bun examples/host-svelte-demo/server/index.ts`
- [ ] `curl http://localhost:3000/simple-demo.worker.js` → 返回 JS
- [ ] wscat 连接 `ws://localhost:3000/plugins/test` → 成功
- [ ] wscat 连接 `ws://localhost:3000/host/test` (Plugin 未连) → 收到错误

**For Plugin Client:**

- [ ] `bun examples/plugin-example/src/simple-demo.client.ts`
- [ ] 控制台显示 "Connected to host server"

**For End-to-End:**

- [ ] 启动 Elysia Server
- [ ] 启动 Plugin Client (simple-demo)
- [ ] 启动 SvelteKit Host
- [ ] 选择 Node.js 模式 → Plugin 正常渲染

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Create Elysia Bridge Server
└── Task 2: Create Plugin Client Runtime

Wave 2 (After Wave 1):
├── Task 3: Modify Host SDK WebSocket Controller
├── Task 4: Update Plugin Example to use Client mode
└── Task 5: Add Static File Serving to Elysia

Wave 3 (After Wave 2):
├── Task 6: Integration Test
└── Task 7: Update Demo and Cleanup

Critical Path: Task 1 → Task 3 → Task 6 → Task 7
```

### Dependency Matrix

| Task | Depends On    | Blocks  | Can Parallelize With |
| ---- | ------------- | ------- | -------------------- |
| 1    | None          | 3, 5, 6 | 2                    |
| 2    | None          | 4, 6    | 1                    |
| 3    | 1             | 6, 7    | 4, 5                 |
| 4    | 2             | 6       | 3, 5                 |
| 5    | 1             | 6       | 3, 4                 |
| 6    | 1, 2, 3, 4, 5 | 7       | None                 |
| 7    | 6             | None    | None                 |

---

## TODOs

- [x] 1. Create Elysia Bridge Server

  **What to do**:
  - 创建 `examples/host-svelte-demo/server/index.ts`
  - 实现 `/plugins/:pluginId` WebSocket 端点（Plugin 连接）
  - 实现 `/host/:pluginId` WebSocket 端点（Host/Browser 连接）
  - 实现 Bridge 逻辑：透明转发字节，不解析内容
  - 实现连接配对 Map：`pluginId → { pluginWs, hostWs }`
  - Host 连接时 Plugin 不在则返回错误关闭连接
  - 1对1 限制：第二个 Host 连同一 Plugin 时拒绝

  **Must NOT do**:
  - 不解析 RPC 消息
  - 不添加认证
  - 不实现重连逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单文件实现，逻辑清晰
  - **Skills**: [`elysia-fullstack-setup`]
    - `elysia-fullstack-setup`: Elysia WebSocket 配置

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3, 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `vendors/kkrpc/packages/kkrpc/__tests__/elysia-websocket.test.ts:72-107` - Elysia WS 服务器设置模式
  - `vendors/kkrpc/packages/kkrpc/__tests__/elysia-simple.test.ts:17-31` - 简单 Elysia WS 示例

  **API/Type References**:
  - `vendors/kkrpc/packages/kkrpc/src/adapters/elysia-websocket.ts:34-302` - ElysiaWebSocketServerIO 类
  - `vendors/kkrpc/packages/kkrpc/src/adapters/elysia-websocket.ts:193-200` - feedMessage 静态方法

  **External References**:
  - Elysia WS docs: 参考 Context7 `/llmstxt/elysiajs_llms-full_txt`

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] `bun examples/host-svelte-demo/server/index.ts` → Server starts on :3000
  - [ ] Using wscat: `wscat -c ws://localhost:3000/plugins/test-plugin`
    - Expected: Connection established, stays open
  - [ ] Using wscat (second terminal): `wscat -c ws://localhost:3000/host/test-plugin`
    - Before plugin connects: Connection closed with error message
    - After plugin connects: Connection established
  - [ ] Send message from host wscat → Appears in plugin wscat (透明转发)
  - [ ] Send message from plugin wscat → Appears in host wscat (透明转发)

  **Commit**: YES
  - Message: `feat(demo): add Elysia Bridge server for WebSocket consolidation`
  - Files: `examples/host-svelte-demo/server/index.ts`, `examples/host-svelte-demo/package.json`

---

- [x] 2. Create Plugin Client Runtime

  **What to do**:
  - 创建 `packages/runtime/src/ws-client.ts` - 核心客户端运行时
  - 创建 `packages/runtime/src/ws-client-entry.ts` - 便捷入口函数
  - 使用 `ElysiaWebSocketClientIO` 连接到 Elysia 服务器
  - 复用现有 `createPluginRuntime` 逻辑
  - 导出为 `@uniview/runtime/ws-client`
  - Plugin ID 从环境变量或参数获取

  **Must NOT do**:
  - 不修改现有 `ws-server-entry.ts`（保持向后兼容）
  - 不修改 Worker 相关代码

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 复用现有代码，改造连接方式
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 4, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/runtime/src/ws-server-entry.ts:1-70` - 现有 WS 服务器入口，参考结构
  - `packages/runtime/src/runtime.ts` - createPluginRuntime 核心逻辑

  **API/Type References**:
  - `vendors/kkrpc/packages/kkrpc/src/adapters/elysia-websocket.ts:328-407` - ElysiaWebSocketClientIO 类
  - `packages/protocol/src/rpc.ts` - HostToPluginAPI, PluginToHostAPI 类型

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] TypeScript 编译无错误: `pnpm check-types` in packages/runtime
  - [ ] 新入口可导入:
    ```typescript
    import { connectToHostServer } from "@uniview/runtime/ws-client";
    ```
  - [ ] 导出在 package.json exports 中配置正确

  **Commit**: YES
  - Message: `feat(runtime): add WebSocket client mode for plugin-as-client architecture`
  - Files: `packages/runtime/src/ws-client.ts`, `packages/runtime/src/ws-client-entry.ts`, `packages/runtime/package.json`, `packages/runtime/tsdown.config.ts`

---

- [x] 3. Modify Host SDK WebSocket Controller

  **What to do**:
  - 修改 `packages/host-sdk/src/controllers/websocket.ts`
  - 改用 `ElysiaWebSocketClientIO` 替代 `WebSocketClientIO`
  - 连接 URL 变为 `ws://server/host/:pluginId` 格式
  - 添加 `pluginId` 参数到 `WebSocketControllerOptions`
  - 处理 "plugin not ready" 错误，支持重试

  **Must NOT do**:
  - 不改变 `PluginController` 接口
  - 不影响其他 Controller（Worker, Main）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 修改单文件，接口不变
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4, 5)
  - **Blocks**: Task 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/host-sdk/src/controllers/websocket.ts:1-131` - 现有实现，修改连接逻辑

  **API/Type References**:
  - `packages/host-sdk/src/types.ts` - PluginController 接口（不修改）
  - `vendors/kkrpc/packages/kkrpc/src/adapters/elysia-websocket.ts:328-407` - ElysiaWebSocketClientIO

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] TypeScript 编译无错误: `pnpm check-types` in packages/host-sdk
  - [ ] 接口兼容：`createWebSocketController({ serverUrl, pluginId })`
  - [ ] 原有 Worker/Main controller 不受影响

  **Commit**: YES
  - Message: `feat(host-sdk): update WebSocket controller for Bridge architecture`
  - Files: `packages/host-sdk/src/controllers/websocket.ts`

---

- [x] 4. Update Plugin Example to use Client mode

  **What to do**:
  - 修改 `examples/plugin-example/src/simple-demo.server.ts` → `simple-demo.client.ts`
  - 修改 `examples/plugin-example/src/advanced-demo.server.ts` → `advanced-demo.client.ts`
  - 使用新的 `connectToHostServer` 替代 `startWebSocketPluginServer`
  - Plugin ID 从文件名推断或 hardcode
  - 更新 `package.json` scripts

  **Must NOT do**:
  - 不删除 Worker 相关文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单文件重命名和 API 调用修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `examples/plugin-example/src/simple-demo.server.ts` - 现有服务器模式，改为客户端

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] `bun examples/plugin-example/src/simple-demo.client.ts`
    - Expected: "Connecting to host server at ws://localhost:3000/plugins/simple-demo"
    - Expected: "Connected successfully"
  - [ ] 同时运行 advanced-demo.client.ts 也能连接

  **Commit**: YES
  - Message: `refactor(example): convert plugins from server to client mode`
  - Files: `examples/plugin-example/src/simple-demo.client.ts`, `examples/plugin-example/src/advanced-demo.client.ts`, `examples/plugin-example/package.json`

---

- [x] 5. Add Static File Serving to Elysia

  **What to do**:
  - 在 Elysia 服务器中添加静态文件服务
  - 服务 `examples/plugin-example/dist/` 目录
  - 正确的 MIME type 和 CORS headers
  - 替代 `build.ts --serve` 的静态服务功能

  **Must NOT do**:
  - 不删除 build.ts（构建功能保留）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Elysia 静态文件插件配置
  - **Skills**: [`elysia-fullstack-setup`]
    - `elysia-fullstack-setup`: Elysia 静态文件插件

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3, 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `examples/plugin-example/build.ts:45-73` - 现有静态服务逻辑，参考 CORS 和 MIME

  **External References**:
  - Elysia Static Plugin: `@elysiajs/static`

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] 先构建: `cd examples/plugin-example && bun build.ts`
  - [ ] 启动 Elysia: `bun examples/host-svelte-demo/server/index.ts`
  - [ ] `curl -I http://localhost:3000/simple-demo.worker.js`
    - Expected: `Content-Type: application/javascript`
    - Expected: `Access-Control-Allow-Origin: *`
  - [ ] 浏览器打开 `http://localhost:3000/simple-demo.worker.js` → 显示 JS 代码

  **Commit**: Groups with Task 1
  - Message: `feat(demo): add static file serving to Elysia Bridge server`
  - Files: `examples/host-svelte-demo/server/index.ts`

---

- [x] 6. Integration Test

  **What to do**:
  - 创建 `examples/host-svelte-demo/server/bridge.test.ts`
  - 测试场景：
    1. Plugin 连接 → Host 连接 → 双向消息转发
    2. Host 先连（Plugin 未就绪）→ 收到错误
    3. 第二个 Host 连同一 Plugin → 拒绝
  - 使用 bun:test 或 vitest

  **Must NOT do**:
  - 不测试 RPC 协议细节（Bridge 不解析消息）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单文件测试
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1, 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `vendors/kkrpc/packages/kkrpc/__tests__/elysia-websocket.test.ts` - Elysia WS 测试模式

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] `bun test examples/host-svelte-demo/server/bridge.test.ts`
    - Expected: All tests pass
  - [ ] 测试覆盖：
    - 正常双向转发
    - Plugin 未就绪时 Host 收到错误
    - 1对1 限制

  **Commit**: YES
  - Message: `test(demo): add integration tests for Bridge server`
  - Files: `examples/host-svelte-demo/server/bridge.test.ts`

---

- [x] 7. Update Demo and Cleanup

  **What to do**:
  - 修改 `examples/host-svelte-demo/src/routes/+page.svelte`
    - 更新 `serverUrl` 为新的 Elysia URL 格式
    - 传入 `pluginId` 参数
  - 更新 `examples/plugin-example/package.json` scripts
    - `server` → `client` (运行客户端模式)
    - 移除单独的 port 配置
  - 添加 deprecation 注释到 `startWebSocketPluginServer`
  - 更新 README（可选）

  **Must NOT do**:
  - 不删除 `startWebSocketPluginServer`（保持向后兼容）
  - 不修改 Worker 模式

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 配置更新和清理
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `examples/host-svelte-demo/src/routes/+page.svelte:27-31` - 现有 serverUrl 配置

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] 完整 E2E 验证:
    1. `cd examples/plugin-example && bun build.ts` (构建 worker bundles)
    2. `bun examples/host-svelte-demo/server/index.ts` (启动 Elysia)
    3. `bun examples/plugin-example/src/simple-demo.client.ts` (启动 Plugin)
    4. `cd examples/host-svelte-demo && pnpm dev` (启动 SvelteKit)
    5. 浏览器打开 http://localhost:5173
    6. 选择 "Node.js" 模式 → Plugin 正常渲染
    7. 选择 "Worker" 模式 → Plugin 仍然正常（回归测试）

  **Commit**: YES
  - Message: `chore(demo): update demo for new Bridge architecture`
  - Files: `examples/host-svelte-demo/src/routes/+page.svelte`, `examples/plugin-example/package.json`

---

## Commit Strategy

| After Task | Message                                             | Files                                          | Verification |
| ---------- | --------------------------------------------------- | ---------------------------------------------- | ------------ |
| 1 + 5      | `feat(demo): add Elysia Bridge server`              | server/index.ts, package.json                  | wscat test   |
| 2          | `feat(runtime): add WebSocket client mode`          | ws-client.ts, ws-client-entry.ts, package.json | tsc          |
| 3          | `feat(host-sdk): update WebSocket controller`       | websocket.ts                                   | tsc          |
| 4          | `refactor(example): convert plugins to client mode` | \*.client.ts, package.json                     | bun run      |
| 6          | `test(demo): add Bridge integration tests`          | bridge.test.ts                                 | bun test     |
| 7          | `chore(demo): update demo for Bridge architecture`  | +page.svelte, package.json                     | E2E          |

---

## Success Criteria

### Verification Commands

```bash
# Build plugin bundles
cd examples/plugin-example && bun build.ts

# Start Elysia server (should serve static + WS)
bun examples/host-svelte-demo/server/index.ts

# Start plugin client (in another terminal)
bun examples/plugin-example/src/simple-demo.client.ts

# Start SvelteKit (in another terminal)
cd examples/host-svelte-demo && pnpm dev

# Run tests
bun test examples/host-svelte-demo/server/bridge.test.ts
```

### Final Checklist

- [x] Host 选择 Node.js 模式能正常渲染 Plugin
- [x] Host 选择 Worker 模式仍然正常（回归）
- [x] 静态文件能通过 Elysia 访问
- [x] 只有一个服务器进程（Elysia on :3000）
- [x] 集成测试通过
