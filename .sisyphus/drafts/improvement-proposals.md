# Uniview 改进方案

> 本文档详细阐述对 Uniview 项目的改进建议，重点解决 Host 开发者的接入成本问题。

---

## 背景分析

### 当前架构的正确决策

1. **Plugin 开发者体验已经很好** - 写 React 组件 + 5行入口代码即可
2. **三种运行模式统一接口** - Worker/WebSocket/Main 通过 `PluginController` 抽象
3. **Bridge 架构正确** - 插件作为客户端连接，避免端口/NAT 问题
4. **协议层干净** - `@uniview/protocol` 不包含业务组件，保持中立

### 当前的痛点（Host 开发者视角）

| 问题          | 现状                                                          | 工作量               |
| ------------- | ------------------------------------------------------------- | -------------------- |
| 组件注册繁琐  | Plugin API 有 N 个组件，Host 要写 N 个适配器 + N 次 register  | O(N)                 |
| Bridge Server | 需要复制 ~100 行代码或理解其实现                              | 一次性但有门槛       |
| Props 适配    | React props → Svelte props 需要手动映射（className→class 等） | 每个组件都要处理     |
| 事件代理      | onChange 提取 `e.target.value` 等逻辑重复                     | 每个输入组件都要处理 |

---

## 方案一：自动 Registry 生成（你问的问题）

### 问题复述

你提到不太理解「自动 registry 生成」。让我详细解释：

### 现状（繁琐的手动注册）

```typescript
// Host 开发者目前需要这样做：
import PluginButton from "./PluginButton.svelte";
import PluginInput from "./PluginInput.svelte";
import PluginSwitch from "./PluginSwitch.svelte";
import PluginToggle from "./PluginToggle.svelte";
// ... 每加一个组件就要 import

const registry = createComponentRegistry();
registry.register("Button", PluginButton);
registry.register("Input", PluginInput);
registry.register("Switch", PluginSwitch);
registry.register("Toggle", PluginToggle);
// ... 每加一个组件就要 register
```

### 改进目标

```typescript
// 理想状态：一行搞定
import { autoRegister } from "@uniview/host-svelte";
import * as PluginComponents from "./plugin-components";

autoRegister(registry, PluginComponents);
// 自动注册所有导出的组件，名字从 export 名推断
```

### 实现方式

**方案 A：约定命名 + 批量导出（零成本）**

```typescript
// Host 侧：plugin-components/index.ts
export { default as Button } from "./PluginButton.svelte";
export { default as Input } from "./PluginInput.svelte";
export { default as Switch } from "./PluginSwitch.svelte";

// 使用时
import * as PluginComponents from "./plugin-components";

const registry = createComponentRegistry();
for (const [name, component] of Object.entries(PluginComponents)) {
  registry.register(name, component);
}
```

**这个方案不需要框架改动，只是代码组织的约定。**

**方案 B：元数据驱动（更自动化）**

Plugin API 包导出组件元数据：

```typescript
// @uniview/example-plugin-api/src/meta.ts
export const componentMeta = {
  Button: {
    props: ["title", "variant", "disabled", "onClick", "className"],
    events: ["onClick"],
  },
  Input: {
    props: ["value", "placeholder", "label", "onChange", "className"],
    events: ["onChange"],
  },
};
```

Host 侧可以用这个元数据生成适配器骨架或做校验。

**建议：先用方案 A（零成本），未来考虑方案 B。**

---

## 方案二：Headless 模式（你问的问题）

### 问题复述

你问「headless 是不是不管什么前端框架」以及「自定义组件应该让 host 开发者操心」。

### 你的理解是正确的

**Headless = 只提供逻辑/状态，不提供样式**

当前的问题：

```
Plugin API (React)          Host (Svelte)
-----------------          --------------
Button.tsx                 PluginButton.svelte
  - 定义 props              - 重新定义相同 props
  - 创建 React 元素          - 用 Svelte 组件渲染
                            - 还要用自己的 UI 库（bits-ui）
```

双重工作：Plugin API 定义一次，Host 还要再实现一次。

### Headless 模式的含义

**你说的「自定义组件应该让 host 开发者操心」就是 Headless 的核心思想。**

具体来说：

1. **Uniview 协议层不关心组件长什么样** - 只传递语义化的 `type` 和 `props`
2. **Host 开发者全权负责渲染** - 用他们自己的设计系统
3. **Plugin 开发者写的是「意图」** - `<Button onClick={...}>` 表达「这里需要一个可点击的按钮」

### 为什么这已经是正确设计

**你现在的设计已经是 Headless 了！**

看 `ComponentRenderer.svelte` 的逻辑：

```svelte
{:else if registry?.has(node.type)}
  <!-- Host 注册的组件完全接管渲染 -->
  <RegisteredComponent {...componentProps} />
{/if}
```

Plugin 说「我要一个 Button」，Host 决定「我用 bits-ui 的 Button 渲染」。

**唯一的问题是：这个「正确设计」没有被充分利用。**

### 建议：不需要改架构，只需要更好的文档

文档应该强调：

```markdown
## Host 开发者指南

Uniview 采用 Headless 设计：

- Plugin 定义组件语义（Button、Input、Modal...）
- Host 决定如何渲染（用你自己的 UI 库）

你需要：

1. 为每个 Plugin 使用的组件类型创建对应的 Svelte 组件
2. 用 `registry.register()` 注册映射
3. 组件 props 会原样传递，事件会自动代理

Uniview 不强制任何样式 - 你的 PluginButton 可以用 Tailwind、
Bootstrap、shadcn/ui 或任何设计系统。
```

---

## 方案三：Schema-Driven Components（你问的问题）

### 问题复述

你说不太理解「Schema-Driven Components」和「UINode」。

### 背景知识

**UINode** 是 Uniview 的核心数据结构，表示一个 UI 节点：

```typescript
interface UINode {
  id: string; // 唯一标识
  type: string; // 组件类型：'Button' | 'Input' | 'div' | ...
  props: Record<string, JSONValue>; // 属性
  children: (UINode | string)[]; // 子节点
}
```

**当前流程：**

```
Plugin React 组件
    ↓ (react-renderer 转换)
UINode { type: 'Button', props: { title: 'Click' } }
    ↓ (RPC 传输)
Host 接收 UINode
    ↓ (registry 查找)
registry.get('Button') → PluginButton.svelte
    ↓ (渲染)
<PluginButton title="Click" />
```

### Schema-Driven 的含义

**当前问题**：Host 必须预先知道所有组件类型并注册适配器。

**Schema-Driven 想法**：让 UINode 携带自描述信息，Host 可以「动态」渲染未知组件。

```typescript
// 假设的 Schema-Driven UINode
interface UINode {
  id: string;
  type: string;
  props: Record<string, JSONValue>;
  children: (UINode | string)[];
  // 新增：组件 schema
  schema?: {
    // 描述这个组件应该如何渲染
    render: "button" | "input" | "container" | "text";
    // 描述 props 的类型和用途
    propTypes: {
      title: { type: "string"; role: "label" };
      onClick: { type: "handler"; event: "click" };
    };
  };
}
```

Host 可以根据 schema 自动生成渲染逻辑：

```svelte
{#if node.schema?.render === 'button'}
  <button onclick={handlers.click}>{node.props.title}</button>
{:else if node.schema?.render === 'input'}
  <input value={node.props.value} oninput={handlers.change} />
{/if}
```

### 我的建议：暂不实施

**理由：**

1. **复杂度高** - 需要设计完整的 schema 规范
2. **灵活性降低** - 预定义的 render 类型限制了 Host 的自由度
3. **你当前的设计更灵活** - Host 完全控制渲染

**Schema-Driven 适合的场景**：

- 低代码平台（Retool、Appsmith）
- 需要动态表单的场景
- Plugin 和 Host 是同一团队维护

**你的场景**：Plugin 是第三方开发者，Host 希望保持设计系统一致性 → **Headless 更合适**

---

## 方案四：Bridge Server 包（强烈推荐）

### 问题

当前 Host 开发者需要复制 `server/index.ts` 的 ~100 行代码。

### 改进

提供 `@uniview/bridge-server` 包：

```typescript
// 新包：packages/bridge-server/src/index.ts
import { Elysia } from "elysia";

export interface BridgeOptions {
  port?: number;
  servePlugins?: {
    path: string; // 插件文件目录
    urlPrefix?: string; // URL 前缀，默认 '/'
  };
  onPluginConnect?: (pluginId: string) => void;
  onHostConnect?: (pluginId: string) => void;
}

export function createBridge(options: BridgeOptions = {}) {
  const { port = 3000 } = options;

  // ... 封装现有的 bridge 逻辑 ...

  return new Elysia()
    .get("/:filename" /* ... */)
    .ws("/plugins/:pluginId" /* ... */)
    .ws("/host/:pluginId" /* ... */)
    .listen(port);
}

// 使用示例
// server.ts
import { createBridge } from "@uniview/bridge-server";

createBridge({
  port: 3000,
  servePlugins: {
    path: "../plugin-example/dist",
  },
});
```

### 实现成本

- 提取现有代码到新包
- 添加配置选项
- 写文档

**工作量：1-2 小时**

---

## 方案五：Props 适配层优化

### 问题

每个 Host 组件都要处理：

- `className` → `class`
- `htmlFor` → `for`
- `onChange` 提取 `e.target.value`

### 当前情况

这部分已经在 `ComponentRenderer.svelte` 的 `transformProps` 中处理了：

```typescript
if (key === "className") {
  attrs.class = value;
} else if (key === "htmlFor") {
  attrs.for = value;
}
```

但 `onChange` 的 value 提取仍需要在每个 Host 组件中处理：

```svelte
<!-- PluginInput.svelte -->
<Input
  oninput={(e) => {
    const target = e.target as HTMLInputElement;
    onchange?.(target.value);  // 手动提取 value
  }}
/>
```

### 改进建议

**方案 A：事件归一化（在 ComponentRenderer 层处理）**

修改 `createHandler` 以支持事件值提取：

```typescript
function createHandler(
  handlerId: string,
  options?: { extractValue?: boolean },
) {
  return async (eventOrValue: Event | unknown) => {
    let args: unknown[];

    if (options?.extractValue && eventOrValue instanceof Event) {
      const target = eventOrValue.target as HTMLInputElement;
      args = [target.value];
    } else {
      args = [eventOrValue];
    }

    await controller.execute(handlerId, args);
  };
}
```

然后在 `transformProps` 中根据事件类型决定是否提取 value。

**方案 B：在 Host 组件中用 utility 函数**

```typescript
// @uniview/host-svelte/src/utils.ts
export function inputHandler(handler?: (value: string) => void) {
  return (e: Event) => {
    const target = e.target as HTMLInputElement;
    handler?.(target.value);
  };
}

// 使用
<Input oninput={inputHandler(onchange)} />
```

**建议：方案 A 更干净，但需要修改核心逻辑。方案 B 是低成本的渐进改进。**

---

## 方案六：Svelte/React Host SDK 混用？

### 问题复述

你问「svelte，react 的 host sdk 难道可以做到 headless 混用吗？」

### 回答：不能，也不需要

**Host SDK 是框架相关的：**

- `@uniview/host-svelte` - 专门给 Svelte Host 用
- 未来的 `@uniview/host-react` - 专门给 React Host 用
- 未来的 `@uniview/host-vue` - 专门给 Vue Host 用

**它们不能混用，因为：**

1. 渲染机制不同（Svelte 编译期 vs React 运行时 vs Vue Composition API）
2. 组件类型不兼容（Svelte Component vs React.ComponentType vs Vue DefineComponent）
3. 事件绑定语法不同

**但 `@uniview/host-sdk` 是框架无关的！**

```
@uniview/host-sdk (框架无关)
├── PluginController 接口
├── createWorkerController
├── createWebSocketController
├── createComponentRegistry<T>  ← 泛型！
└── 不包含任何渲染逻辑

@uniview/host-svelte (Svelte 专用)
├── PluginHost.svelte
├── ComponentRenderer.svelte
└── 使用 host-sdk 的 controller

@uniview/host-react (未来)
├── PluginHost.tsx
├── ComponentRenderer.tsx
└── 使用同一个 host-sdk 的 controller
```

**所以：**

- Host SDK 的核心逻辑（RPC、树订阅、事件代理）是共享的
- 只有渲染层是框架相关的
- 这正是你设计的分层方式！

---

## 优先级建议

| 优先级 | 方案                      | 工作量 | 收益                 |
| ------ | ------------------------- | ------ | -------------------- |
| **P0** | Bridge Server 包          | 2h     | 降低最大门槛         |
| **P1** | 文档改进（强调 Headless） | 1h     | 澄清设计意图         |
| **P1** | 组件批量注册约定          | 0h     | 只需要文档说明       |
| **P2** | Props 适配 utility        | 2h     | 减少重复代码         |
| **P3** | 组件元数据导出            | 4h     | 更好的 DX            |
| **低** | Schema-Driven             | 20h+   | 复杂度高，收益不明确 |

---

## 总结

**你的核心设计是正确的。** Uniview 已经是 Headless 架构，Plugin 开发体验已经很好。

需要改进的不是架构，而是：

1. **降低 Host 接入门槛** - Bridge Server 包
2. **更好的文档** - 解释 Headless 理念
3. **减少样板代码** - 批量注册约定 + utility 函数

Plugin 开发者写 React，Host 开发者用自己喜欢的框架和设计系统，这就是 Uniview 的核心价值。

---

_文档版本：2026-01-28_
_基于 commit: 45adfe3e0d0c1993b182d3d707bbffaced01b1b1_
