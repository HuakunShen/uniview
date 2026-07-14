# Uniview Modern TUI Framework

## 架构、跨 Surface Runtime、AI Automation 与 TDD 实施路线图

**评审对象：** `HuakunShen/uniview` public `main` branch  
**重点代码：** `packages/tui-renderer`、`examples/tui-demo/src/index.tsx`  
**文档日期：** 2026-07-13  
**修订版本：** v2 — Web/TUI/SwiftUI、wterm、shell-use 与自动化测试增补  
**状态：** Revised Proposed Architecture / Implementation Plan  

> **一句话结论**：Uniview 不应只做“另一个 Ink”或“OpenTUI wrapper”。它应成为一个 **跨 Web、TUI、SwiftUI/AppKit 的隔离式插件 UI runtime**：共享 model、commands、permissions、semantic roles 与测试契约；允许 portable universal view，也允许每个 surface 提供最合适的专用 view。TUI 采用框架无关 scene/CellBuffer，并可同时输出到真实 ANSI terminal、浏览器 DOM cell mirror、SVG 和 Memory surface；AI 自动化优先操作 semantic tree，`shell-use` 作为真实 PTY 黑盒验证。第一阶段仍是 TypeScript-first，OpenTUI adapter 与自研 native code 都必须在 conformance 和 benchmark gate 后再决定。

---

## 文档导航

1. 执行摘要与最终建议
2. 当前仓库与 TUI POC 审计
3. 产品定位、跨 Surface View 模型与设计原则
4. 目标架构、包拆分与 Surface Contract
5. 协议、scene tree 与事件模型
6. 布局、文本、绘制和帧差分
7. 键盘、焦点、鼠标与终端生命周期
8. 组件体系与视觉设计语言
9. TDD、自动测试执行与 CI
10. Web Terminal、wterm 与 AI Automation
11. 性能工程、OpenTUI adapter 与 native 决策门槛
12. 分阶段 implementation plan
13. 迁移策略与旗舰 multi-surface demo
14. 首批 PR、风险与发布门槛
15. 最终建议
16. 参考资料

<!-- PAGEBREAK -->

# 1. 执行摘要与最终建议

## 1.1 Uniview 真正的差异化

Uniview 已经拥有多数 JavaScript TUI 项目没有的基础：React/Solid authoring、框架无关 `UINode` 协议、handler ID 序列化、Worker/进程隔离、kkrpc transport、full-tree 与 incremental update，以及 Web、SwiftUI、AppKit 和 TUI 等多 host 方向。[R1] 因此项目最有价值的不是“也能画 `<Box>`”，而是：

> **One plugin, shared logic, optional universal view, optional per-surface views, one automation contract.**

中文可以表述为：

> **一个插件，共享业务逻辑；可以共享 UI，也可以为 Web、TUI、SwiftUI 分别实现最合适的 UI；所有 surface 使用统一语义、命令和自动化测试。**

这比强制一棵 JSX tree 更实际，也比 Ink/OpenTUI 的 terminal-only 应用模型更难复制。Uniview 的 moat 应由以下能力叠加形成：

- protocol-first multi-host rendering
- plugin runtime isolation 与 capability-based permissions
- universal semantic components + surface-specific overrides
- remote rendering 与可恢复的 incremental mutations
- semantic automation、record/replay 与跨 surface contract tests
- TUI 的 ANSI、DOM cell、SVG、Memory 多 surface 输出

## 1.2 建议采用的总体方案

| 决策 | 建议 |
|---|---|
| Plugin model | 共享 state、commands、services、permissions、lifecycle 与 semantic roles |
| View model | `surface-specific -> universal -> unsupported fallback` 的解析优先级 |
| Web | 同时支持 browser-native semantic DOM view，以及 exact TUI DOM-cell mirror |
| TUI host | 新建 `@uniview/host-tui`，正式消费 `UINode + MutationBatch` |
| TUI core | framework-neutral scene/layout/text/paint/focus/CellBuffer |
| TUI output | `CellSurface`：ANSI、DOM cell、SVG、Memory；OpenTUI adapter 可选 |
| SwiftUI/AppKit | 保留 native control rendering，复用同一 model/commands/semantics |
| Testing | TDD；Memory surface、semantic queries、cross-surface contracts、PTY E2E |
| AI automation | versioned JSON schema、stable error taxonomy、query/act/wait/expect/record |
| shell-use | 真实 PTY 黑盒 oracle 与 CI artifact 生成，不作为 Uniview 内核 |
| Native | TypeScript-first；先验证 OpenTUI adapter，再按 profiler 决定自研 Zig/Rust/WASM |

## 1.3 最重要的架构纠偏

当前 `@uniview/tui-renderer` 是独立 React reconciler：

```text
React -> private TuiNode tree -> handwritten layout -> Cell[][] -> ANSI
```

建议演进为一个跨 framework、跨 transport、跨 output surface 的单语义路径：

```text
React / Solid plugin
    -> universal view or resolved surface-specific view
    -> UINode snapshots / MutationBatch
    -> @uniview/host-tui
    -> TuiScene / layout / text / paint / focus
    -> CellBuffer + semantic tree
    -> ANSI | DOM-cell | SVG | Memory | optional OpenTUI backend
```

“direct mode”只是在进程内传递对象，不做 JSON round-trip；它不是另一套 renderer。这样 React、Solid、Worker、WebSocket、测试环境、browser TUI preview 和未来 native backend 才能共享同一行为规范。

![目标架构](/mnt/data/uniview_doc_assets/target-architecture-vertical.png)

## 1.4 wterm 与 shell-use 带来的新启发

wterm 是一个 Web terminal emulator，而不是 TUI component framework。它把 Zig 编译为 WASM 维护 terminal grid，再用 DOM row `<div>` 和按 style 合并的 `<span>` 渲染；只更新 dirty rows，并通过 `requestAnimationFrame` 调度。实时渲染不是 SVG；SVG 更适合作为静态测试或分享 artifact。[R13][R14]

这启发 Uniview 将“计算一帧”与“把一帧呈现到某种 surface”彻底分开：同一个 TUI `CellBuffer` 可以输出到真实 terminal，也可以输出到浏览器 DOM，获得原生 selection、copy、find 和 accessibility，而不必先编码 ANSI 再在浏览器中重新解析。

shell-use 则展示了一套 AI-friendly terminal automation 设计：daemon + named sessions、机器可读 JSON、稳定 exit codes、`wait idle`、text/cell inspection、mouse/resize、SVG screenshot、asciinema recording，以及从 CLI 自动生成的 `agent-context` 和 skill 文档。[R15] Uniview 可以借鉴这些模式，但由于自身已有 semantic tree，自动化应优先使用 `role/name/id/command`，而不是坐标和屏幕文字。

## 1.5 对 Rust/Zig/WASM/JavaScript 的结论

JavaScript/TypeScript 可以完成 raw input、resize、ANSI、mouse protocol、layout、cell buffer、frame diff 和 component reconciliation。Node 的稳定 TTY API 已提供 raw mode、resize、cursor 和 screen 操作。[R12]

推荐决策顺序：

1. **TypeScript reference implementation**：建立正确性、TDD、React/Solid parity 和稳定 public contracts。
2. **OpenTUI adapter experiment**：只接 `@opentui/core` imperative layer，运行相同 conformance suite；不暴露其 class 到 public API。
3. **WASM/native hot-path option**：wterm 证明“可插拔 core + WASM”适合 portable cell/state kernel；但是否采用取决于 profiler 和 packaging。
4. **自研 Zig/Rust 最后决定**：只下沉稳定的 grapheme、cell composition、diff、ANSI encoder 或 hit-grid，并使用粗粒度 batch ABI。

## 1.6 推荐时间线

单个全职工程师达到“可公开 beta”的现实周期约为 **18-22 周**；加入 browser TUI mirror、semantic automation 和 shell-use E2E 后，稳定 1.0 约为 **28-34 周**。两名工程师可以并行：

- Engineer A：TUI core、terminal、CellSurface、OpenTUI adapter
- Engineer B：components、multi-surface contract、automation、Web preview、CI

最小 beta 的必要条件：

- Unicode 正确的 CellBuffer 与 Flexbox-compatible layout
- changed-run frame diff、terminal lifecycle、mouse、paste、resize
- Memory/ANSI/DOM-cell/SVG surfaces
- Button、TextInput、ScrollView、List、Tabs、Dialog、Select
- React/Solid/direct/Worker conformance
- semantic automation API 与 deterministic `waitForIdle`
- Linux PTY smoke，shell-use 可选黑盒 smoke

# 2. 当前仓库与 TUI POC 审计

## 2.1 Uniview 现有总体设计

公开 README 将 Uniview 定义为 universal plugin system：React/Solid plugin 在隔离 runtime 中产生 JSON-safe `UINode`，经 kkrpc 传给 host；host SDK 管理 full-tree 或 incremental updates；不同 host 将相同 tree 渲染成 Svelte、React、Vue、SwiftUI、AppKit 或 terminal。[R1]

这套设计有三个非常强的基础：

1. **稳定 ID 与 mutation 协议**：适合增量 host reconciliation。
2. **handler registry**：函数不会穿过 transport，而是变成可调用 ID。
3. **runtime/host 解耦**：TUI 可以同时支持同进程 CLI、Worker 和远程 plugin。

当前 TUI 包却没有利用这三个优势，而是另建 React host config 并直接保存 callback reference。它适合 POC，但不适合作为长期唯一实现。

## 2.2 当前 demo 的实际能力

`examples/tui-demo/src/index.tsx` 使用 `Box`、`Text`、`Button`、`Input` 和 `createTuiRoot`，演示 counter 与 controlled input。[R6]

等价的结构如下：

```tsx
import {
  Box,
  Button,
  Input,
  Text,
  createTuiRoot,
} from "@uniview/tui-renderer";
import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);
  const [value, setValue] = useState("");

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text color="cyan" bold>Standalone TUI Demo</Text>
      <Text>Count: {count}</Text>
      <Button onPress={() => setCount((n) => n + 1)}>
        Increment
      </Button>
      <Input
        value={value}
        onChange={setValue}
        placeholder="Type something"
        width={30}
      />
      <Text>Input value: {value || "(empty)"}</Text>
    </Box>
  );
}

const root = createTuiRoot();
root.render(<App />);
```

这是一个有价值的 vertical slice，但当前 public API 只有：

- `Box`: row/column、padding、gap、固定 width/height、少量前景色与 bold/dim/inverse
- `Text`: 少量前景色与文字属性
- `Button`: `onPress`、`disabled`
- `Input`: `value`、`placeholder`、`width`、`onChange`
- `Newline`

没有 background、border、margin、alignment、flex grow/shrink、wrap、overflow、scroll、layers、cursor、selection、mouse、theme 或 responsive behavior。[R4]

## 2.3 当前数据流

![当前架构](/mnt/data/uniview_doc_assets/current-architecture.png)

当前实现的优点：

- React mutation host config 简单清晰。
- keyed reorder 前显式 `detachFromParent`，避免 array host 重复 child；这是正确的 reconciler 细节。[R3]
- commit 后统一 `container.update()`，POC 容易理解。
- 使用 `string-width` 进行测量，比简单 `text.length` 更接近 terminal cell width。[R2]
- controlled/uncontrolled Input 都有初步支持。
- destroy 时尝试恢复 raw mode 和 cursor。

## 2.4 需要立即处理的正确性问题

| 问题 | 当前行为 | 影响 | 优先级 |
|---|---|---|---|
| 架构分叉 | TUI 直接 React reconciler，不消费 UINode | Solid/remote/plugin 能力无法复用 | P0 |
| 全屏重绘 | 每次 `clearScreen` 后输出全部 cells | flicker、scrollback 破坏、I/O 放大 | P0 |
| Unicode 宽度不一致 | measure 用 `stringWidth`，draw 每个 JS code point 只加 1 | CJK、emoji、ZWJ、combining mark 错位 | P0 |
| 输入 parser 不完整 | 每个 stdin chunk 被视为一个 key | 分片 escape sequence、UTF-8、paste 会失败 | P0 |
| `disabled` 未真正禁用 | focus collector 和 activation 未过滤 disabled | disabled button 仍可 focus/press | P0 |
| 无 resize event | render 时读 columns/rows，但 resize 不触发 render | 终端缩放后 UI 不更新 | P0 |
| 无 clip/overflow | draw 只靠 buffer 边界丢弃 | child 会逻辑越界，scroll 无法实现 | P1 |
| 生命周期为进程全局副作用 | 每个 root 都监听 stdin/exit | 多 root 冲突、listener 泄漏 | P1 |
| 输入状态清理不足 | `inputValues` 以 node ID 长期保存 | remove/recreate 后可能残留 | P1 |
| style 不继承 | raw text node 直接用空 style | Box/Text style 组合行为不一致 | P1 |
| 直接 callback | host 直接调用函数 | 无法跨 worker/WS，语义与其他 host 不一致 | P0 |

### Unicode bug 的具体原因

当前 measure 可能得到一个 CJK 字符宽度 2，但 draw 逻辑类似：

```ts
for (const char of text) {
  setCell(buffer, cursorX, y, char, style);
  cursorX += 1;
}
```

结果是 layout 认为后续元素应向右移动 2 格，实际 buffer 只占 1 格；emoji ZWJ sequence 还可能被拆成多个 code point。正确实现必须以 grapheme cluster 为单位，并显式写入 width=2 的 lead/continuation cells。

## 2.5 当前测试覆盖

`packages/tui-renderer/tests/index.test.ts` 只验证 component wrapper 产生预期 React element、`Newline` 展开和 `createTuiRoot` 存在。[R5]

它没有验证：

- 最终 CellBuffer 或 ANSI output
- layout
- style 与 background
- Unicode
- input、focus、disabled
- mouse hit-testing
- resize
- incremental update
- cleanup
- real PTY behavior

因此第一项工程任务不应是“再加几个 widget”，而应是先建立可以驱动整个架构的 test backend。

<!-- PAGEBREAK -->

# 3. 产品定位、跨 Surface View 模型与设计原则

## 3.1 产品 north star

**Uniview = browser-grade authoring ergonomics + terminal-native correctness + native host quality + isolated plugin runtime + AI-readable semantics。**

它需要同时服务四类用户：

1. **CLI/TUI app author**：使用 React/Solid 写漂亮、可交互、可发布的 full-screen app。
2. **plugin author**：共享业务逻辑，并按需要提供 universal 或 per-surface view。
3. **host author**：需要 slots、permissions、commands、themes、diagnostics 和 isolation。
4. **automation/AI client**：以结构化语义读取和操作 UI，而不是依赖 OCR 或脆弱坐标。

## 3.2 复用分为两条轴

Uniview 不应将“共享逻辑”和“共享 presentation tree”混为一谈。

| 轴 | 必须共享 | 可按 surface 分开 |
|---|---|---|
| Business/runtime | model、commands、services、permissions、handler semantics、lifecycle | host-local widget controller、viewport/focus/scroll |
| Presentation | semantic roles、names、theme tokens、portable primitives | page layout、navigation、keyboard hints、hover、toolbar、context menu |

复杂应用强制共享一棵 tree，通常会导致最低公分母 UI；完全分离又会失去协议和测试优势。推荐 hybrid model：

```tsx
export default defineReactPlugin({
  id: "com.example.git",
  model: createGitModel(),

  // 可选：portable default
  view(ctx) {
    return <UniversalGitView model={ctx.model} />;
  },

  // 可选：针对 surface 的高质量体验
  surfaces: {
    tui(ctx) {
      return <GitTuiView model={ctx.model} />;
    },
    web(ctx) {
      return <GitWebView model={ctx.model} />;
    },
    native(ctx) {
      return <GitNativeView model={ctx.model} />;
    },
  },
});
```

解析规则必须固定并测试：

```ts
export function resolvePluginView(
  plugin: PluginDefinition,
  surface: SurfaceKind,
): PluginView {
  return (
    plugin.surfaces?.[surface] ??
    plugin.view ??
    createUnsupportedSurfaceView(surface)
  );
}
```

每个 host session 拥有独立 resolved tree、focus、selection、scroll 和 local editing state；只有真正的业务状态通过 model/commands 同步。

## 3.3 1.0 目标

- React 与 Solid 一等公民，组件行为一致。
- direct、Worker、`worker_threads`、WebSocket 模式使用相同 host semantics。
- universal semantic components 与 per-surface overrides 都是一等 API。
- Web semantic host、TUI host、SwiftUI/AppKit host 可执行同一 semantic interaction contract。
- TUI 支持 main-screen、inline、alternate-screen；keyboard、mouse、drag/wheel、paste、resize。
- TUI 可输出 ANSI、DOM cell mirror、SVG 和 Memory frame。
- CJK、emoji、combining marks、wide cells 正确。
- Flexbox-compatible layout、border/background、clip、scroll、portal/modal。
- 默认组件开箱即用就好看，同时允许 headless customization。
- AI/automation 可 query semantic tree、act、wait、expect、record/replay。
- 异常退出时恢复 cursor、mouse、paste 和 raw mode。

## 3.4 明确的非目标

首个稳定版本不必包含：

- 完整 Web CSS 兼容
- 任意 DOM component 自动无损映射到 TUI
- 将 structured Uniview UI 先编码成 ANSI、再交给 Web terminal emulator 解析
- 所有 host 的 pixel/layout 完全一致
- 复杂 BiDi 排版和全部 Unicode line-break 规则
- IDE 级文本编辑器内核
- 在没有 benchmark 前重写整个 renderer 为 Zig/Rust
- 在 production 默认开放无鉴权 automation control socket

## 3.5 设计原则

1. **Protocol is the moat**：wire contract 独立于 React、Solid、terminal backend 和具体 surface。
2. **Shared semantics, tailored presentation**：跨平台保证角色、命令和状态语义，不保证布局像素一致。
3. **One semantic path**：direct 与 remote 模式不产生不同 widget 行为。
4. **Host owns terminal/native state**：plugin 不直接操作 stdin/stdout、DOM、NSView 或 system process。
5. **Local default actions**：TextInput、scroll、focus 等高频交互由 host-local state machine 完成。
6. **Serializable UI API**：不依赖只在同进程有效的 callback style 或同步 `preventDefault()`。
7. **TDD is architecture**：Memory surface、semantic queries、deterministic scheduler 是 core API。
8. **AI observes structure first**：语义树、commands、events、cells 优先于 screenshot/OCR。
9. **Surface is not backend**：ANSI/DOM/SVG 是 presentation surface；TypeScript/OpenTUI/native 是计算 backend。
10. **Native is an implementation detail**：public component、automation 和 protocol API 不暴露 Zig/Rust/OpenTUI 类型。

<!-- PAGEBREAK -->

# 4. 目标架构、包拆分与 Surface Contract

## 4.1 推荐 package map

![包结构](/mnt/data/uniview_doc_assets/package-map-v2.png)

不要在第一天发布十几个 npm package；先按逻辑边界拆目录，API 稳定后再决定哪些成为独立 package。建议目标结构：

```text
packages/
  ui/                       # portable semantic components + view resolution
  tui-core/
    src/
      scene/
      style/
      layout/
      text/
      paint/
      buffer/
      diff/
      scheduler/
      events/
      focus/
      surfaces/
  tui-terminal/             # Node/Bun ANSI terminal driver
  host-tui/                 # UINode/mutations -> TuiScene
  tui-components/           # headless machines + theme + widgets
  tui-react/
  tui-solid/
  tui-testing/
  automation/               # cross-surface semantic automation
  tui-surface-dom/          # later public package, browser TUI mirror
  tui-backend-opentui/      # optional experiment
  testing-shell-use/        # optional black-box E2E adapter
  tui/                      # convenience meta-package
```

### 各 package 的职责边界

| Package | 必须负责 | 不应负责 |
|---|---|---|
| `ui` | portable semantics、surface override resolution、capability requirements | terminal cells、native view implementation |
| `tui-core` | scene、layout、text、paint、focus、CellBuffer、surface contract | React、Solid、`process.stdin` |
| `tui-terminal` | terminal lifecycle、input bytes、ANSI presentation | component semantics、plugin RPC |
| `host-tui` | UINode/mutation、registry、handler dispatch、local widget state | raw terminal protocol |
| `tui-components` | state machines、theme、semantic widget contracts | framework reconciler |
| `tui-react` / `tui-solid` | authoring adapter、hooks、direct convenience API | 独立 paint engine |
| `tui-testing` | Memory surface、user-event、queries、snapshots、contracts | production globals |
| `automation` | session/query/action/wait/expect/record schema | unrestricted production shell access |
| `tui-surface-dom` | CellBuffer -> DOM rows/spans、rAF、dirty rows | VT escape parser |
| `tui-backend-opentui` | UINode/TuiScene -> `@opentui/core` adapter | public component model |
| `testing-shell-use` | real PTY external validation and artifacts | unit-test truth source |

## 4.2 Direct mode 与 plugin mode

建议 public API：

```ts
export interface RenderTuiOptions {
  screen?: "alternate" | "main" | "inline";
  width?: number;
  height?: number;
  mouse?: "off" | "click" | "drag" | "motion";
  colorDepth?: 1 | 4 | 8 | 24 | "auto";
  maxFps?: number;
  theme?: TuiTheme;
  backend?: "typescript" | "opentui" | "auto";
  surface?: "ansi" | "memory" | "dom" | "svg";
  debug?: boolean;
}

export async function render(
  element: React.ReactNode,
  options?: RenderTuiOptions,
): Promise<TuiAppHandle>;
```

内部仍使用 local protocol transport：

```ts
export async function render(element: React.ReactNode, options = {}) {
  const transport = createInProcessTransport();
  const runtime = createReactPluginRuntime({
    transport: transport.plugin,
    mode: "incremental",
    surface: "tui",
  });
  const host = createTuiHost({
    controller: createLocalController(transport.host),
    backend: await resolveTuiBackend(options.backend ?? "auto"),
    surface: await createCellSurface(options),
    registry: createDefaultTuiRegistry(),
  });

  await host.start();
  runtime.render(element);
  return createAppHandle(runtime, host);
}
```

该 transport 可直接传对象以降低开销，但 message shape、revision、handler ID 和 event semantics 必须与 Worker/WS 相同。

## 4.3 Render backend 与 CellSurface 必须分离

`RenderBackend` 负责从 scene 计算一帧；`CellSurface` 负责把一帧呈现到某个环境。OpenTUI adapter 属于 backend 或 terminal engine；DOM/SVG/ANSI 属于 surface。不要把两层混成一个接口。

```ts
export interface RenderBackend {
  readonly kind: "typescript" | "opentui" | "native" | "wasm";

  resize(size: Size): void;
  applyScene(root: SceneNode | null): void;
  applyMutations(batch: SceneMutationBatch): void;
  render(request: RenderRequest): RenderResult;
  getSemantics(): SemanticTree;
  destroy(): void;
}

export interface CellSurface {
  readonly kind: "ansi" | "dom" | "svg" | "memory";

  mount(size: Size): void | Promise<void>;
  resize(size: Size): void | Promise<void>;
  present(
    frame: ReadonlyCellBuffer,
    update: FrameUpdate,
  ): PresentStats | Promise<PresentStats>;
  destroy(): void | Promise<void>;
}

export interface FrameUpdate {
  revision: number;
  dirtyRows: readonly number[];
  changedRuns: readonly CellRun[];
  cursor: CursorState;
  fullRepaint: boolean;
}
```

TypeScript backend + Memory surface 是规范实现和 test oracle。未来 OpenTUI/WASM/native backend 只需保证最终 cells、semantic bounds、focus/hit-test 一致；不要求 raw ANSI bytes 完全一致。

## 4.4 两种 Web surface

Uniview 应同时提供两种互补的 Web 能力：

1. **Semantic Web host**：将 portable/Web view 映射为真实 DOM controls，获得最佳 browser UX、responsive layout 与 accessibility。
2. **TUI fidelity mirror**：将 TUI 生成的同一 `CellBuffer` 直接渲染成 DOM rows/spans，适合 Web preview、远程 monitor、文档、CI 和共享 session。

```text
Plugin model
  ├─ WebView -> DOM semantic host
  └─ TuiView -> TuiScene -> CellBuffer
                         ├─ ANSI terminal
                         ├─ DOM cell mirror
                         ├─ SVG artifact
                         └─ Memory test surface
```

这两种模式不能混淆。Structured TUI preview 不应先生成 ANSI 再交给 terminal emulator；只有真实 shell/PTY stream 才适合用 wterm 一类 VT emulator。

## 4.5 Capability negotiation

Host 在初始化时声明 surface 和能力：

```ts
export interface HostCapabilities {
  surface: "web" | "tui" | "native";
  renderer?: "dom" | "ansi" | "dom-cell" | "swiftui" | "appkit";
  colorDepth?: 1 | 4 | 8 | 24;
  mouse?: boolean;
  clipboard?: boolean;
  images?: readonly ("kitty" | "sixel" | "iterm2")[];
  semanticAutomation: boolean;
  remoteControl: "disabled" | "read-only" | "control";
}
```

Plugin 可以据此选择 view 或 graceful fallback，但 capability branch 必须发生在定义良好的 resolution layer，而不是散落在任意 component 中。

# 5. 协议、scene tree 与事件模型

## 5.1 Wire tree 与 render tree 必须分离

`UINode` 是 transport contract，不应直接承担 layout cache、parent pointer、clip、interaction state 和 native handle。Host 接收后构建内部 `SceneNode`：

```ts
export type NodeId = string;

export interface SceneNode {
  id: NodeId;
  type: string;
  parentId: NodeId | null;
  children: NodeId[];

  props: Readonly<Record<string, unknown>>;
  style: ResolvedStyle;
  semantics: Semantics;
  events: Readonly<Partial<Record<TuiEventType, HandlerId>>>;

  layout: LayoutBox;
  clip: Rect;
  flags: NodeFlags;
  revision: number;
}
```

Wire tree 可以保持 JSON-safe；Scene tree 可以使用 maps、typed arrays、interned style IDs 和 host-local state。

## 5.2 建议的 protocol 增量

不必立刻彻底改写 protocol。建议以兼容方式增加：

```ts
export interface TuiSurfaceInfo {
  kind: "tui";
  width: number;
  height: number;
  colorDepth: 1 | 4 | 8 | 24;
  unicode: "basic" | "wide" | "emoji";
  mouse: boolean;
  bracketedPaste: boolean;
  kittyKeyboard: boolean;
}

export interface MutationBatch {
  protocolVersion: number;
  baseRevision: number;
  revision: number;
  mutations: Mutation[];
}
```

Host 应校验 `baseRevision`。发现 gap 时请求 `setRoot`，而不是在损坏状态上继续 apply。

## 5.3 组件 registry

Wire node type 不应硬编码在 paint engine：

```ts
export interface TuiComponentAdapter<P = Record<string, unknown>> {
  type: string;
  normalizeProps(raw: Record<string, unknown>): P;
  createController?(node: SceneNode, ctx: WidgetContext): WidgetController;
  measure?(node: SceneNode, constraints: MeasureConstraints): Size;
  paint(node: SceneNode, painter: Painter): void;
  semantics(node: SceneNode): Semantics;
}

export class TuiComponentRegistry {
  private adapters = new Map<string, TuiComponentAdapter>();

  register(adapter: TuiComponentAdapter): () => void {
    if (this.adapters.has(adapter.type)) {
      throw new Error(`Duplicate TUI component: ${adapter.type}`);
    }
    this.adapters.set(adapter.type, adapter);
    return () => this.adapters.delete(adapter.type);
  }

  require(type: string): TuiComponentAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error(`Unsupported TUI component: ${type}`);
    return adapter;
  }
}
```

这使 host 可以扩展 custom components，同时 core 仍只理解 primitives。

## 5.4 高频交互必须 host-local

远程 TextInput 若每次按键都经历：terminal -> host -> RPC -> plugin state -> render -> mutation -> host，会产生不必要延迟。建议 widget controller 本地维护“optimistic state”，并向 plugin 发事件：

```ts
export interface LocalTextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  composition: string | null;
  localRevision: number;
  lastPropRevision: number;
}

export interface ValueChangePayload {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  eventRevision: number;
}
```

当新的 controlled `value` 到达时：

- 若 prop revision 新于本地已确认 revision，应用 server value。
- 若它是旧 mutation，不覆盖用户刚输入的 optimistic value。
- blur/submit 时可强制 reconcile。

这类逻辑应放在共享 `tui-components/state-machines` 中，并用 direct/remote 两种 harness 做相同测试。

## 5.5 事件不能依赖同步 preventDefault

跨 Worker/WS 的 callback 无法同步返回。因此不要设计只有 direct mode 才可靠的 DOM-style `preventDefault()`。

推荐：

- default action 在 host local widget controller 中执行。
- plugin callback 是异步 notification。
- 需要改变默认行为时，用 serializable props，如 `submitOnEnter={false}`、`captureTab`、`keymap`。
- shell-level command/keymap 优先级在 host 端确定。

```ts
export interface EventDispatchResult {
  handledLocally: boolean;
  handlerCalls: readonly {
    handlerId: HandlerId;
    payload: JsonValue;
  }[];
  invalidate: "none" | "paint" | "layout";
}
```

# 6. 布局、文本、绘制和帧差分

## 6.1 建议的 render pipeline

![渲染流水线](/mnt/data/uniview_doc_assets/render-pipeline.png)

第一版仍可以“每帧 paint 完整逻辑 framebuffer”，因为典型 terminal 只有几千到几万 cells。性能优化重点应放在：

1. 避免向 stdout 输出完整 frame。
2. 避免每个 cell 创建 JS object。
3. 避免每次 render 重复解析 style/theme。
4. 合并 mutation 和 frame scheduling。
5. 为长列表只 mount/render 可见 items。

## 6.2 CellBuffer 数据模型

建议使用 flat storage 和 style interning：

```ts
export const enum CellFlags {
  None = 0,
  Continuation = 1 << 0,
  Transparent = 1 << 1,
  Dirty = 1 << 2,
}

export interface CellView {
  grapheme: string;
  width: 0 | 1 | 2;
  styleId: number;
  ownerId: number;
  flags: CellFlags;
}

export class CellBuffer {
  readonly graphemes: string[];
  readonly widths: Uint8Array;
  readonly styleIds: Uint32Array;
  readonly ownerIds: Uint32Array;
  readonly flags: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const length = width * height;
    this.graphemes = Array.from({ length }, () => " ");
    this.widths = new Uint8Array(length).fill(1);
    this.styleIds = new Uint32Array(length);
    this.ownerIds = new Uint32Array(length);
    this.flags = new Uint8Array(length);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }
}
```

`graphemes` 首版仍可用 string array；性能有证据后再改为 string table + grapheme ID typed array。

## 6.3 Grapheme 与 wide-cell 写入

```ts
export interface WidthCalculator {
  widthOf(grapheme: string): 0 | 1 | 2;
}

const segmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

export function* graphemes(text: string): Iterable<string> {
  for (const part of segmenter.segment(text)) {
    yield part.segment;
  }
}

export function writeText(
  buffer: CellBuffer,
  x: number,
  y: number,
  text: string,
  styleId: number,
  ownerId: number,
  widths: WidthCalculator,
): number {
  let cursor = x;

  for (const grapheme of graphemes(text)) {
    const width = widths.widthOf(grapheme);

    if (width === 0) {
      // Combining-only cluster: attach to the previous lead cell.
      if (cursor > x) {
        const i = buffer.index(cursor - 1, y);
        buffer.graphemes[i] += grapheme;
      }
      continue;
    }

    if (cursor >= buffer.width) break;
    if (width === 2 && cursor === buffer.width - 1) break;

    const lead = buffer.index(cursor, y);
    buffer.graphemes[lead] = grapheme;
    buffer.widths[lead] = width;
    buffer.styleIds[lead] = styleId;
    buffer.ownerIds[lead] = ownerId;

    if (width === 2) {
      const continuation = buffer.index(cursor + 1, y);
      buffer.graphemes[continuation] = "";
      buffer.widths[continuation] = 0;
      buffer.styleIds[continuation] = styleId;
      buffer.ownerIds[continuation] = ownerId;
      buffer.flags[continuation] |= CellFlags.Continuation;
    }

    cursor += width;
  }

  return cursor;
}
```

必须为以下文本建立 golden corpus：中文、日文、韩文、emoji skin tone、ZWJ family、flag、combining acute、variation selector、零宽字符、wide char 位于最后一列。

## 6.4 Yoga-compatible style contract

Yoga 官方定位是面向 Web 标准的 portable layout engine。[R11] TUI 不需要完整 CSS，但应采用熟悉且可跨 host 的属性：

```ts
export type Dimension = number | `${number}%` | "auto";

export interface TuiStyle {
  display?: "flex" | "none";
  position?: "relative" | "absolute";
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  flexWrap?: "nowrap" | "wrap";
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: Dimension;

  justifyContent?: "start" | "center" | "end" | "space-between" | "space-around";
  alignItems?: "start" | "center" | "end" | "stretch";
  alignSelf?: "auto" | "start" | "center" | "end" | "stretch";

  width?: Dimension;
  height?: Dimension;
  minWidth?: Dimension;
  maxWidth?: Dimension;
  minHeight?: Dimension;
  maxHeight?: Dimension;

  margin?: InsetsValue;
  padding?: InsetsValue;
  gap?: number;
  rowGap?: number;
  columnGap?: number;

  inset?: InsetsValue;
  overflow?: "visible" | "hidden" | "scroll";
  zIndex?: number;
}
```

实现时 layout engine 使用 terminal cell units。浮点结果需要按 **edge** 而不是单独 width 做 deterministic snapping：

```ts
function snapBox(left: number, top: number, width: number, height: number): Rect {
  const x0 = Math.round(left);
  const y0 = Math.round(top);
  const x1 = Math.round(left + width);
  const y1 = Math.round(top + height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
```

Text node 使用 measure function，在给定 width constraint 下运行 wrap/truncate 算法，再把 measured size 返回 layout engine。

## 6.5 Text API

```ts
export interface TextProps {
  children?: TuiTextContent;
  wrap?: "none" | "word" | "character";
  overflow?: "clip" | "ellipsis";
  maxLines?: number;
  selectable?: boolean;
  style?: TextStyle;
}

export interface TextStyle {
  color?: ColorToken | RgbColor;
  backgroundColor?: ColorToken | RgbColor;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  link?: string;
}
```

首版明确支持 LTR。BiDi/Arabic shaping 可作为后续独立 text backend；不要伪装成已完整支持。

## 6.6 Paint、clip、layer 与 HitMap

Painter 应维护 stack：

```ts
export interface Painter {
  pushClip(rect: Rect): void;
  popClip(): void;
  pushLayer(layer: LayerId, zIndex: number): void;
  popLayer(): void;

  fill(rect: Rect, styleId: number, ownerId: number): void;
  text(point: Point, text: string, styleId: number, ownerId: number): void;
  border(rect: Rect, border: BorderStyle, ownerId: number): void;
}
```

每个最终 cell 保存 topmost `ownerId`，或维护独立 `HitBuffer`。鼠标 click 先查 owner，再沿 scene parent path bubble。`Portal` 将 subtree paint 到 overlay/modal/tooltip layer；modal layer 同时创建 focus scope。

## 6.7 Frame diff

初版 frame diff 可按 row 找 changed runs。遇到 wide cell 必须扩展到 lead cell：

```ts
export interface CellRun {
  x: number;
  y: number;
  start: number;
  end: number;
}

export function diffFrames(prev: CellBuffer, next: CellBuffer): CellRun[] {
  if (prev.width !== next.width || prev.height !== next.height) {
    return [{ x: 0, y: 0, start: 0, end: next.width * next.height }];
  }

  const runs: CellRun[] = [];

  for (let y = 0; y < next.height; y += 1) {
    let x = 0;
    while (x < next.width) {
      while (x < next.width && cellsEqual(prev, next, x, y)) x += 1;
      if (x >= next.width) break;

      let start = expandToLeadCell(prev, next, x, y);
      let end = start + 1;

      while (end < next.width && !cellsEqual(prev, next, end, y)) end += 1;
      end = expandPastWideCell(prev, next, end, y);

      runs.push({ x: start, y, start, end });
      x = end;
    }
  }

  return runs;
}
```

ANSI planner 再决定 cursor move、style switch、erase-line 是否更省字节，并把一帧合并成一次或极少数 `stdout.write()`。

# 7. 键盘、焦点、鼠标与终端生命周期

## 7.1 Normalized event model

```ts
export type TuiInputEvent =
  | {
      type: "key";
      key: string;
      code?: string;
      ctrl: boolean;
      alt: boolean;
      shift: boolean;
      meta: boolean;
      repeat: boolean;
    }
  | { type: "text"; text: string }
  | { type: "paste"; text: string }
  | {
      type: "mouse";
      action: "down" | "up" | "move" | "drag" | "wheel";
      button: "left" | "middle" | "right" | "none";
      x: number;
      y: number;
      deltaY?: -1 | 1;
      ctrl: boolean;
      alt: boolean;
      shift: boolean;
    }
  | { type: "resize"; width: number; height: number }
  | { type: "terminal-focus"; focused: boolean };
```

## 7.2 Input parser 必须是增量状态机

stdin chunk 既不保证“一次一个键”，也不保证 escape sequence 或 UTF-8 code point 不被分片。可使用 `StringDecoder` 保证 UTF-8 边界，再保留 pending buffer：

```ts
import { StringDecoder } from "node:string_decoder";

export class InputParser {
  private readonly decoder = new StringDecoder("utf8");
  private pending = "";
  private paste: string | null = null;

  push(chunk: Buffer): TuiInputEvent[] {
    this.pending += this.decoder.write(chunk);
    const events: TuiInputEvent[] = [];

    while (this.pending.length > 0) {
      if (this.paste !== null) {
        const end = this.pending.indexOf("\x1b[201~");
        if (end < 0) {
          this.paste += this.pending;
          this.pending = "";
          break;
        }
        this.paste += this.pending.slice(0, end);
        events.push({ type: "paste", text: this.paste });
        this.paste = null;
        this.pending = this.pending.slice(end + 6);
        continue;
      }

      if (this.pending.startsWith("\x1b[200~")) {
        this.paste = "";
        this.pending = this.pending.slice(6);
        continue;
      }

      const mouse = parseSgrMousePrefix(this.pending);
      if (mouse.kind === "complete") {
        events.push(mouse.event);
        this.pending = this.pending.slice(mouse.length);
        continue;
      }
      if (mouse.kind === "incomplete") break;

      const key = parseKeyPrefix(this.pending);
      if (key.kind === "complete") {
        events.push(key.event);
        this.pending = this.pending.slice(key.length);
        continue;
      }
      if (key.kind === "incomplete") break;

      const first = [...this.pending][0];
      if (!first) break;
      events.push({ type: "text", text: first });
      this.pending = this.pending.slice(first.length);
    }

    return events;
  }
}
```

需要测试 sequence 被切成 1-byte chunks、多个 keys 合并在同一 chunk、paste 内含 escape-like text，以及 emoji UTF-8 分片。

## 7.3 TerminalSession 独占终端

不应让每个 root 直接注册 process listeners。建议一个 process/TTY 只存在一个 `TerminalSession`：

```ts
export interface TerminalSessionOptions {
  screen: "alternate" | "main" | "inline";
  mouse: "off" | "click" | "drag" | "motion";
  bracketedPaste: boolean;
  focusReporting: boolean;
  hideCursor: boolean;
}

export class TerminalSession {
  private entered = false;
  private cleanup: Array<() => void> = [];

  async enter(options: TerminalSessionOptions): Promise<void> {
    if (this.entered) throw new Error("TerminalSession already entered");
    assertTtyOwnership(this.stdout);
    this.entered = true;

    if (this.stdin.isTTY) this.stdin.setRawMode(true);
    this.stdout.on("resize", this.onResize);
    this.stdin.on("data", this.onData);

    this.write(buildEnterSequence(options));
    this.installSignalCleanup();
  }

  async leave(): Promise<void> {
    if (!this.entered) return;
    this.entered = false;

    try {
      this.write(buildLeaveSequence());
    } finally {
      this.stdin.off("data", this.onData);
      this.stdout.off("resize", this.onResize);
      if (this.stdin.isTTY && this.stdin.isRaw) this.stdin.setRawMode(false);
      for (const fn of this.cleanup.splice(0)) fn();
      releaseTtyOwnership(this.stdout);
    }
  }
}
```

Node raw mode 下 Ctrl-C 不再自动生成 SIGINT，因此 parser/command layer 必须显式决定 Ctrl-C 是 app command 还是退出。[R12]

## 7.4 Mouse support

推荐默认策略：

- alternate-screen 默认 `mouse="click"`
- inline/main-screen 默认 off，避免破坏用户 terminal selection
- 支持 SGR mouse coordinates
- `drag`/`motion` 只在组件需要时升级，降低事件量
- wheel 先路由到 pointer 下的 nearest scroll container
- click 顺序：hit-test -> focus target -> local default action -> async handler notification

```ts
function dispatchMouse(event: MouseEvent, ctx: DispatchContext) {
  const targetId = ctx.hitMap.get(event.x, event.y);
  if (!targetId) return;

  if (event.action === "down") {
    ctx.focus.focus(targetId, { reason: "pointer" });
    ctx.pointer.captureMaybe(targetId, event);
  }

  const path = ctx.scene.pathToRoot(targetId);
  ctx.widgets.dispatchAlongPath(path, event);
}
```

## 7.5 Focus manager

Focus 不能只是“树遍历得到数组”。需要：

- `tabIndex`
- disabled/hidden 自动排除
- nested focus scopes
- modal trap
- roving focus（menu/list/tabs）
- focus restore
- optional spatial navigation
- focus-visible 原因（keyboard vs pointer）

```ts
export class FocusManager {
  private focused: NodeId | null = null;
  private scopeStack: FocusScope[] = [];

  move(direction: "next" | "previous"): NodeId | null {
    const scope = this.activeScope();
    const candidates = scope.tabOrder().filter((item) => item.enabled);
    if (candidates.length === 0) return this.focus(null);

    const index = candidates.findIndex((item) => item.id === this.focused);
    const next = direction === "next"
      ? candidates[(index + 1 + candidates.length) % candidates.length]
      : candidates[(index - 1 + candidates.length) % candidates.length];

    return this.focus(next?.id ?? null, { reason: "keyboard" });
  }
}
```

# 8. 组件体系与视觉设计语言

## 8.1 分层组件体系

### Level 0: render primitives

- `Box`
- `Text`
- `Pressable`
- `TextFieldPrimitive`
- `ScrollAreaPrimitive`
- `Portal`
- `FocusScope`

### Level 1: layout conveniences

- `Stack`
- `Inline`
- `Center`
- `Grid`（后续可独立实现）
- `Spacer`
- `Divider`
- `Panel`
- `SplitPane`

### Level 2: form/navigation widgets

- `Button`
- `TextInput`
- `TextArea`
- `Checkbox`
- `RadioGroup`
- `Switch`
- `Select`
- `Tabs`
- `Menu`
- `CommandPalette`
- `Dialog`
- `Popover`
- `Toast`

### Level 3: data/content widgets

- `List`
- `VirtualList`
- `Table`
- `Tree`
- `LogView`
- `ProgressBar`
- `Spinner`
- `Code`
- `Markdown`
- `Diff`

## 8.2 Serializable interaction styles

不要使用 `style={(state) => ...}` 作为 wire API，因为函数无法跨 transport。建议：

```ts
export interface InteractiveStyleProps {
  style?: TuiStyle;
  hoverStyle?: TuiStyle;
  focusStyle?: TuiStyle;
  activeStyle?: TuiStyle;
  disabledStyle?: TuiStyle;
}
```

更推荐 widget 通过 `variant`、`size` 和 theme tokens 获得默认视觉：

```tsx
<Button variant="primary" size="md">Run</Button>
<Button variant="ghost" intent="danger">Delete</Button>
```

## 8.3 Theme contract

```ts
export interface TuiTheme {
  name: string;
  colors: {
    background: RgbColor;
    surface: RgbColor;
    surfaceRaised: RgbColor;
    text: RgbColor;
    textMuted: RgbColor;
    border: RgbColor;
    primary: RgbColor;
    primaryText: RgbColor;
    danger: RgbColor;
    warning: RgbColor;
    success: RgbColor;
    focusRing: RgbColor;
  };
  spacing: readonly number[];
  borders: Record<"none" | "single" | "rounded" | "double", BorderGlyphs>;
  components: ComponentThemeMap;
}
```

Color resolver 在 24/8/4-bit capability 下做确定性降级。Snapshot 测试固定 color depth，避免 CI 环境改变预期。

## 8.4 Button 设计

Button 不应自行写 `[ label ]`，而应组合 primitives 和 host-local Pressable state：

```tsx
export function Button({
  children,
  variant = "primary",
  disabled = false,
  onPress,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      {...props}
      role="button"
      disabled={disabled}
      onPress={onPress}
      variant={`button.${variant}`}
    >
      <Box paddingX={1} minWidth={4} justifyContent="center">
        <Text>{children}</Text>
      </Box>
    </Pressable>
  );
}
```

Pressable adapter 决定 hover/focus/active/disabled style、hit rectangle、Enter/Space activation 和 semantics。

## 8.5 TextInput UX

1.0 TextInput 应至少支持：

- cursor 和 selection
- Left/Right、Home/End、Delete/Backspace
- Ctrl/Alt word movement
- multiline 可选
- bracketed paste
- password mask
- placeholder
- validation/error message
- horizontal scrolling
- submit
- controlled/uncontrolled/optimistic remote state
- mouse click 定位 cursor（Phase 6 后半）

状态机与 React/Solid wrapper 分离：

```ts
export class TextInputMachine {
  constructor(private state: LocalTextState) {}

  handle(event: TuiInputEvent): TextInputEffect[] {
    if (event.type === "text") return this.insert(event.text);
    if (event.type === "paste") return this.insert(event.text);
    if (event.type !== "key") return [];

    switch (event.key) {
      case "ArrowLeft": return this.moveCursor(-1, event);
      case "ArrowRight": return this.moveCursor(1, event);
      case "Backspace": return this.deleteBackward(event);
      case "Delete": return this.deleteForward(event);
      case "Home": return this.moveToLineStart(event);
      case "End": return this.moveToLineEnd(event);
      case "Enter": return [{ type: "submit", value: this.state.value }];
      default: return [];
    }
  }
}
```

## 8.6 “漂亮”的默认标准

“漂亮”不能只等于 truecolor。建议默认设计语言：

- 统一 surface/background 层级
- rounded/single border presets
- 清晰的 keyboard focus ring，而不是只做整块 inverse
- hover 与 active 状态克制且可在低色深下降级
- spacing scale（0,1,2,3,4）而不是任意散落数字
- status bar、key hint、empty state、loading、error 的统一模式
- terminal 较窄时自动 stack；宽时 split pane
- animation 默认非常轻，并尊重 `reducedMotion`
- 组件文档同时展示 16-color 与 truecolor 截图

<!-- PAGEBREAK -->

# 9. TDD、自动测试执行与 CI

## 9.1 测试体系的参考来源

Uniview 应组合多个成熟项目的最佳实践，而不是只复制一种 snapshot：

| 项目 | 借鉴点 | Uniview 对应能力 |
|---|---|---|
| OpenTUI | memory renderer、char/span capture、mock key/mouse、resize、idle | Memory surface、styled cells、`user`、`waitForIdle` |
| Ratatui | `TestBackend` 与 CellBuffer 作为正确性真相 | `cells.json` 与 backend conformance |
| Textual | Pilot、semantic selector、mouse/resize、SVG snapshot | role queries、semantic actions、SVG artifact |
| Ink | `lastFrame()`、fake streams、render-to-string、PTY | `screen.text()`、injectable driver、smoke tests |
| Bubble Tea | 固定 terminal env、raw ANSI golden | lifecycle/transport golden tests |
| wterm | core/DOM separation、dirty rows、rAF、Playwright | DOM-cell surface 和 browser E2E |
| shell-use | real PTY、wait/expect、mouse、SVG、recording、agent schema | black-box oracle 与 AI automation design |

这些方向与前期研究和补充建议一致。[R7][R16]

## 9.2 TDD 的硬规则

每个 feature PR 必须遵循：

```text
1. 先写最小失败测试或 regression fixture
2. 实现 framework-neutral state machine / core behavior
3. 通过 CellBuffer 或 semantic tree 断言
4. 再接 React/Solid wrapper
5. 再加 ANSI/DOM/SVG integration
6. 最后更新 demo 和文档
```

禁止以下模式：

- 只比较 terminal screenshot，不验证 semantic state
- 使用固定 `sleep(500)` 等待 UI
- snapshot 变更由 CI 自动接受
- native backend 拥有独立、较弱的 test suite
- 只测试 React direct path，不测试 protocol path

## 9.3 推荐的 testing package API

```ts
export interface UniviewTestApp {
  readonly surface: "web" | "tui" | "native";

  screen: {
    text(options?: { trimRight?: boolean }): string;
    cells(): SerializableCellFrame | null;
    spans(): StyledLine[] | null;
    cursor(): CursorState | null;
    writes(): readonly Uint8Array[];
    svg(): string | null;
  };

  user: {
    press(...keys: string[]): Promise<void>;
    type(text: string): Promise<void>;
    paste(text: string): Promise<void>;
    click(target: QueryTarget | Point): Promise<void>;
    drag(from: QueryTarget | Point, to: QueryTarget | Point): Promise<void>;
    wheel(target: QueryTarget | Point, deltaY: number): Promise<void>;
    resize(width: number, height: number): Promise<void>;
  };

  getByRole(role: string, options?: RoleQuery): QueryTarget;
  getByText(text: string | RegExp): QueryTarget;
  queryById(id: string): QueryTarget | null;
  commands(): readonly EmittedCommand[];
  events(): readonly RecordedEvent[];
  waitForIdle(options?: IdleOptions): Promise<void>;
  destroy(): Promise<void>;
}
```

基础例子：

```tsx
const app = await renderPluginForTest(GitPlugin, {
  surface: "tui",
  width: 80,
  height: 24,
});

await app.user.click(
  app.getByRole("button", { name: "Refresh" }),
);
await app.waitForIdle();

expect(app.commands()).toContainEqual({ id: "git.refresh" });
expect(app.screen.cells()).toMatchCellSnapshot();
```

## 9.4 `waitForIdle` 必须基于内部状态

`waitForIdle` 不应简单等待固定毫秒。Host 应公开只读 diagnostics：mutation revision、rendered revision、pending handlers、transport in-flight、scheduler queue、animation count 和最近变化时间。

```ts
export async function waitForIdle(
  host: HostDiagnostics,
  options: { quietMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const quietMs = options.quietMs ?? 32;
  const timeoutMs = options.timeoutMs ?? 5000;

  await until(() => {
    return (
      host.renderRevision === host.mutationRevision &&
      host.pendingHandlers === 0 &&
      host.transportInFlight === 0 &&
      host.schedulerPending === 0 &&
      host.activeAnimations === 0 &&
      host.msSinceLastChange >= quietMs
    );
  }, { timeoutMs });
}
```

在真实 PTY 黑盒层无法读取这些内部状态时，再使用 shell-use 的 screen quiet/`wait idle` 作为外部近似。[R15]

## 9.5 三种视觉 artifact 与一类 transport golden

每个视觉 fixture 可生成：

```text
counter.frame.txt      # 人类快速 review
counter.cells.json     # CI 真相：grapheme/style/owner/cursor/bounds
counter.frame.svg      # PR artifact，可视化 diff
counter.ansi.bin       # 少量 transport/lifecycle golden
```

- `.cells.json` 是主要判定依据。
- SVG 用于人工 review，不依赖 OCR。
- ANSI golden 只覆盖 screen mode、cursor、mouse、paste、style sequence 和 cleanup。
- PNG 只作为文档展示，不作为核心 snapshot。

## 9.6 Cross-surface semantic contract

同一业务流程应可在 Web、TUI、SwiftUI test adapter 上运行。断言语义和 commands，不断言布局一致：

```ts
export function runGitRefreshContract(
  createApp: () => Promise<UniviewTestApp>,
) {
  it("refreshes the repository", async () => {
    const app = await createApp();
    await app.user.click(
      app.getByRole("button", { name: "Refresh" }),
    );
    await app.waitForIdle();

    expect(app.commands()).toContainEqual({ id: "git.refresh" });
    expect(app.getByRole("status")).toHaveTextContent(/updated/i);
  });
}

runGitRefreshContract(() => createWebFixture(GitPlugin));
runGitRefreshContract(() => createTuiFixture(GitPlugin));
runGitRefreshContract(() => createSwiftUiFixture(GitPlugin));
```

TUI-specific tests可以另外验证 key hints、focus order、cells 和 mouse hit-map；Web-specific tests验证 ARIA、responsive DOM 和 browser input；native tests验证 platform control mapping。

## 9.7 测试金字塔

| 层 | 内容 | 运行频率 |
|---|---|---|
| Core unit | cell、grapheme、wrap、layout、clip、diff、parser、state machines | 每次提交 |
| Scene conformance | UINode/mutations -> semantic tree/CellBuffer | 每次提交 |
| Framework conformance | React/Solid/direct/Worker/WS | 每次提交 |
| Headless interaction | focus、click、type、scroll、dialog、resize | 每次提交 |
| Cross-surface contract | Web/TUI/SwiftUI semantic flow | 每次提交 |
| Browser surface | DOM-cell dirty-row、selection、resize、Playwright | 每次提交 |
| ANSI golden | lifecycle、changed runs、cursor/style | 每次提交 |
| Real PTY | startup/exit/Ctrl-C/mouse/resize/cleanup | Linux PR；全平台 nightly |
| Fuzz/property | parser fragmentation、mutation sequence、Unicode | nightly |
| Performance/leak | frame budget、bytes、retained listeners/nodes | nightly/release |

## 9.8 第一批必须先写的 regression tests

```ts
it("does not focus or activate a disabled button", async () => {
  const onPress = vi.fn();
  const app = await renderTui(<Button disabled onPress={onPress}>Run</Button>);

  await app.user.press("Tab", "Enter");

  expect(onPress).not.toHaveBeenCalled();
  expect(app.queryByRole("button", { focused: true })).toBeNull();
});

it("writes CJK and ZWJ emoji using lead/continuation cells", async () => {
  const app = await renderTui(
    <Text>A中👨‍👩‍👧‍👦B</Text>,
    { width: 20, height: 1 },
  );
  expect(app.screen.cells()).toMatchCellSnapshot();
});

it("parses every split of an escape sequence identically", () => {
  const sequence = bytes("\\x1b[<0;12;4M");
  for (let split = 0; split <= sequence.length; split++) {
    const parser = new InputParser();
    parser.push(sequence.slice(0, split));
    parser.push(sequence.slice(split));
    expect(parser.takeEvents()).toEqual([
      mouseDown({ x: 11, y: 3, button: 0 }),
    ]);
  }
});

it("updates only the affected DOM rows", async () => {
  const surface = createDomCellSurface(container, { rows: 24, cols: 80 });
  await surface.present(frameA, fullUpdate(frameA));
  const before = [...container.querySelectorAll(".uv-term-row")];

  await surface.present(frameB, { ...diff(frameA, frameB), dirtyRows: [7] });

  expect(container.querySelectorAll(".uv-term-row")[7]).toBe(before[7]);
  expect(surface.debug.lastUpdatedRows).toEqual([7]);
});

it("does not clear the whole terminal for one label update", async () => {
  const app = await renderTui(<Counter />);
  app.screen.resetWrites();

  await app.user.click(app.getByRole("button", { name: "Increment" }));
  await app.waitForIdle();

  const output = concat(app.screen.writes());
  expect(output).not.toContainBytes(bytes("\\x1b[2J"));
  expect(output.byteLength).toBeLessThan(256);
});
```

## 9.9 可直接落地的 workspace scripts

```json
{
  "scripts": {
    "test:tui:unit": "vitest run packages/tui-core packages/tui-components",
    "test:tui:scene": "vitest run tests/tui/scene",
    "test:tui:interaction": "vitest run tests/tui/interaction",
    "test:surface-contract": "vitest run tests/surface-contract",
    "test:tui:browser": "playwright test tests/tui-browser",
    "test:tui:ansi": "vitest run tests/tui/ansi",
    "test:tui:pty": "vitest run tests/tui/pty --pool=forks --maxWorkers=1",
    "test:tui:shell-use": "vitest run tests/tui/shell-use --pool=forks --maxWorkers=1",
    "test:tui:fuzz": "vitest run tests/tui/fuzz",
    "test:tui": "pnpm test:tui:unit && pnpm test:tui:scene && pnpm test:tui:interaction && pnpm test:surface-contract && pnpm test:tui:ansi"
  }
}
```

```ts
// vitest.workspace.ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/protocol",
  "packages/react-renderer",
  "packages/solid-renderer",
  "packages/tui-core",
  "packages/tui-components",
  "packages/tui-testing",
  "tests/surface-contract",
  "tests/tui",
]);
```

## 9.10 CI 分层

PR 必跑：

```text
typecheck + lint
core/state-machine unit tests
Unicode corpus + layout/cell fixtures
React/Solid/direct/Worker contracts
headless interaction + cross-surface contracts
DOM-cell Playwright
ANSI goldens
Linux PTY smoke
package build/install smoke
```

Nightly：

```text
parser fuzz + random mutation sequences
full Unicode corpus
Linux/macOS/Windows real PTY matrix
shell-use mouse/resize/recording smoke
TS/OpenTUI backend conformance
performance + leak budgets
```

示例 workflow：

```yaml
name: tui
on:
  pull_request:
  push:
    branches: [main]

jobs:
  deterministic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test:tui
      - run: pnpm test:tui:browser
      - run: pnpm test:tui:pty
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: tui-failure-artifacts
          path: artifacts/tui/**
```

shell-use 当前仍标注为 work in progress，因此初期只在 optional/nightly job 中 pin 明确版本或 commit；不要让所有 PR 的 deterministic suite 依赖它。[R15]

## 9.11 Snapshot 治理

- CI 永不自动执行 `-u`。
- snapshot 变更 PR 必须附带 `.txt` 与 SVG diff artifact。
- cell schema 使用独立版本号，迁移脚本不能静默丢字段。
- fuzz failure 保存 seed 与最小化 input，可本地 replay。
- performance baseline 绑定 runner profile，使用相对回退阈值而非跨机器绝对值。
- terminal-specific goldens 按 capability profile 命名，例如 `xterm-256color/main-screen`。

<!-- PAGEBREAK -->

# 10. Web Terminal、wterm 与 AI Automation

## 10.1 wterm 到底如何渲染

wterm 自己的定位是 “a terminal emulator for the web”。它的内核是 Zig 编译到 WASM 的 VT state machine，默认轻量 core 约 12 KB，也支持实现同一 `TerminalCore` interface 的 libghostty backend。[R13]

它的实时显示**不是 SVG**。DOM renderer 的关键做法是：

1. 为每个 terminal row 创建一个 `<div class="term-row">`。
2. 将连续、style 相同的 cells 合并成一个 `<span>` run。
3. cursor 作为带 `term-cursor` class 的 span。
4. 使用 core 的 `isDirtyRow(row)` 只重建变化行。
5. render 通过 `requestAnimationFrame` 合并到浏览器 frame。
6. scrollback 也是额外 DOM rows。

这带来 browser-native selection、copy/paste、find 和 accessibility。[R13][R14]

SVG 在这里应理解为**静态 artifact**，不是 live renderer。shell-use 的 `screenshot -o file.svg` 才是将 terminal state 导出为 SVG 的典型用法。[R15]

## 10.2 Uniview 不应直接把 wterm 当 structured TUI backend

wterm 输入的是 VT/ANSI byte stream，并把它解析成 terminal grid。Uniview TUI 内部已经有结构化 scene、semantic tree 和 CellBuffer；若走下面路径会造成不必要的信息丢失和重复计算：

```text
TuiScene -> ANSI bytes -> wterm VT parser -> cells -> DOM
```

正确路径是：

```text
TuiScene -> CellBuffer -> DomCellSurface -> DOM rows/spans
```

这样可以保留：

- node ownership 与 semantic role
- hit regions 与 focus path
- exact style IDs 和 dirty rows
- accessibility overlay
- automation selectors
- 不依赖 escape sequence 的 deterministic browser tests

wterm 更适合两类整合：

1. **设计参考**：借鉴 pluggable core、dirty rows、DOM run coalescing、rAF、ResizeObserver 和 browser E2E。
2. **真实 shell component**：在 Web surface 内提供 host-specific `<TerminalSession>`，显示 PTY/SSH/container stream。

```tsx
import { TerminalSession } from "@uniview/web-terminal";

function BuildPanel({ sessionId }: { sessionId: string }) {
  return (
    <TerminalSession
      sessionId={sessionId}
      emulator="wterm"
      core="ghostty"
      ariaLabel="Build terminal"
    />
  );
}
```

该 component 属于 Web-specific extension，不应成为 portable `@uniview/ui` primitive。

## 10.3 DOM Cell Surface 设计

```ts
export class DomCellSurface implements CellSurface {
  readonly kind = "dom" as const;
  private rows: HTMLDivElement[] = [];
  private pending: FramePresentation | null = null;
  private raf: number | null = null;

  constructor(private readonly container: HTMLElement) {}

  mount(size: Size): void {
    this.container.replaceChildren();
    this.rows = Array.from({ length: size.height }, () => {
      const row = document.createElement("div");
      row.className = "uv-term-row";
      this.container.append(row);
      return row;
    });
  }

  present(frame: ReadonlyCellBuffer, update: FrameUpdate): void {
    this.pending = { frame, update };
    if (this.raf !== null) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      const pending = this.pending;
      this.pending = null;
      if (!pending) return;
      for (const row of pending.update.dirtyRows) {
        renderStyledRuns(this.rows[row], pending.frame.row(row));
      }
      updateDomCursor(this.container, pending.update.cursor);
    });
  }

  destroy(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.container.replaceChildren();
  }
}
```

实现细节：

- 一行不是 80 个 DOM node，而是按 style/ownership 合并 runs。
- 文本必须使用 `textContent` 或严格 escape，不能直接插入不可信 HTML。
- background、underline、strike、cursor、block glyph 可以通过 CSS 表达。
- accessibility 不应让每个 cell 成为一个 ARIA node；用 semantic tree 生成隐藏/overlay accessibility structure。
- selection 和 copy 使用可见 text runs；click 则由坐标映射到 cell/hit-map。
- dirty-row 是第一版足够简单的更新单位，后续再考虑 changed-run DOM patch。

## 10.4 Web/TUI/SwiftUI 的独特组合

![跨 Surface 与自动化架构](/mnt/data/uniview_doc_assets/multi-surface-automation.png)

Uniview 可以提供一个其他 TUI framework 很难复制的开发工作台：

```text
左侧：Web semantic view
中间：exact TUI DOM-cell preview
右侧：SwiftUI/AppKit preview or inspector
底部：shared semantic tree、commands、events、mutations、automation trace
```

同一个 plugin package 可同时打开多个 host session；每个 session 有独立 viewport/focus/local controller，但共享 model 或通过同一 service backend 获取状态。开发者可以实时验证：

- portable view 在各 surface 的 mapping
- surface override 是否保留相同 role/name/command
- 同一个 interaction trace 是否跨 host 成功
- TUI 的 exact CellBuffer 和真实 ANSI 是否一致
- capability fallback 是否正确

## 10.5 shell-use 可以直接借鉴什么

shell-use 采用 Rust CLI + daemon + named sessions，内部使用 PTY 和 terminal emulator。它提供 text/cells/state inspection、keyboard/mouse/resize、`wait idle`、assertions、SVG screenshot、自动 asciinema recording、live monitor、Node/Python clients、stable exit codes，以及从 CLI 生成的 versioned `agent-context`。[R15]

建议分两层利用。

### A. 作为外部黑盒 E2E harness

`@uniview/testing-shell-use` 只负责启动真实 built demo 并验证 terminal behavior：

```ts
import { ShellUse } from "@microsoft/shell-use";

it("supports real mouse, resize and terminal cleanup", async () => {
  const su = new ShellUse({ session: `uv-${process.pid}` });
  try {
    await su.run("node", ["dist/examples/tui-workspace.js"]);
    await su.waitIdle({ timeout: 5000 });
    await su.expectText("Uniview Workspace");

    await su.mouseClickOnText("Open dialog");
    await su.expectText("Mouse and keyboard");
    await su.resize(60, 20);

    await su.screenshot("artifacts/tui-workspace.svg");
    await saveText(
      "artifacts/tui-workspace.cast",
      await su.getRecording(),
    );
  } finally {
    await su.close().catch(() => undefined);
  }
});
```

API 名称需要按 pin 的 shell-use 版本校准；该示例表达的是集成方式，不应绕过其正式 Node client 自造 fragile CLI parser。

### B. 建立更强的 Uniview-native automation

对于 Uniview app，不应只用 `mouse click --on-text`。Host 已知 semantic tree，因此可以定义：

```ts
export interface AutomationSession {
  state(): Promise<SurfaceState>;
  tree(): Promise<SerializableSemanticTree>;
  query(selector: SemanticSelector): Promise<NodeRef[]>;
  act(action: AutomationAction): Promise<ActionResult>;
  wait(condition: WaitCondition, options?: WaitOptions): Promise<void>;
  expect(assertion: SurfaceAssertion): Promise<void>;
  snapshot(options?: SnapshotOptions): Promise<SnapshotArtifact>;
  startRecording(options?: RecordingOptions): Promise<RecordingHandle>;
}
```

```ts
await session.act({
  kind: "activate",
  target: { role: "button", name: "Refresh" },
});

await session.wait({
  kind: "command",
  id: "git.refresh",
  status: "completed",
});

await session.expect({
  kind: "node",
  target: { role: "status" },
  text: /updated/i,
});
```

这个 trace 可以在 Web/TUI/SwiftUI 重新执行，而 coordinate-level trace 只能绑定一个 viewport。

## 10.6 AI-native CLI / SDK surface

建议提供一个 stateless CLI，连接 host 内的 automation service：

```text
uniview-agent sessions
uniview-agent tree --session work --json
uniview-agent query --role button --name Refresh
uniview-agent act activate --role button --name Refresh
uniview-agent wait idle
uniview-agent expect text "Updated"
uniview-agent snapshot --format svg -o artifacts/work.svg
uniview-agent record start
uniview-agent record stop -o artifacts/work.trace.json
uniview-agent agent-context
uniview-agent skill
```

关键点：

- `agent-context` 从 command/type schema 自动生成，防止文档与实现漂移。
- 默认 JSON output，human output 只是 view。
- 稳定 error taxonomy，例如 `assertion_failed`、`no_session`、`permission_denied`、`protocol_mismatch`、`internal`。
- named sessions 允许 AI、开发者 monitor 和测试 runner 同时连接。
- protocol recorder 保存 semantic actions、commands、mutations 和 optional frame hashes。
- 未来可以提供 MCP server，但 MCP 只是 transport，不应替代底层稳定 automation schema。

## 10.7 Security 与 production boundary

Automation 是高权限入口，默认策略必须保守：

```ts
export interface AutomationPolicy {
  enabled: boolean;
  transport: "in-process" | "local-socket" | "websocket";
  access: "read-only" | "interact" | "admin";
  authToken?: string;
  allowedOrigins?: readonly string[];
  allowScreenshots: boolean;
  allowClipboard: boolean;
  allowShellControl: boolean;
  maxActionsPerSecond: number;
}
```

- production 默认 disabled。
- dev mode 可自动启用 local socket，但必须限制 filesystem permissions。
- remote WebSocket 需要 auth、origin 和 capability scope。
- plugin 不能借 automation API 越权访问其他 plugin tree。
- screenshot、clipboard、shell session、recording 都应是独立 permissions。
- automation log 应支持敏感文本 redaction。

## 10.8 形成竞争优势的产品形态

将 wterm 风格 browser mirror 与 shell-use 风格 agent control 结合，Uniview 可以成为：

> **Structured-first, terminal-compatible UI automation platform.**

- 对 Uniview app：AI 看到 semantic tree、commands 和 stable IDs。
- 对真实 terminal：AI 仍可看到 cells/text/SVG，并通过 shell-use 兼容层驱动。
- 对 Web/SwiftUI：同一 semantic action trace 可以 replay。
- 对开发者：浏览器同时展示 tailored Web UI 和 exact TUI frame。
- 对 CI：失败时上传 cells、SVG、trace、ANSI 和 PTY cast，不需要 OCR 猜问题。


<!-- PAGEBREAK -->

# 11. 性能工程、OpenTUI adapter 与 native 决策门槛

## 11.1 性能模型

一帧的主要成本：

```text
mutation apply
+ style resolution
+ layout
+ text segmentation/wrap
+ paint/composite
+ previous/current cell comparison
+ ANSI planning
+ stdout write/backpressure
```

当前 POC 最大问题不是 JavaScript 算不动，而是每次清屏并输出完整 frame。先修算法和 I/O 模型，通常比换语言收益更大。

## 11.2 Scheduler

```ts
export class RenderScheduler {
  private invalidation: "none" | "paint" | "layout" = "none";
  private scheduled = false;

  invalidate(kind: "paint" | "layout") {
    if (kind === "layout" || this.invalidation === "none") {
      this.invalidation = kind;
    }
    if (this.scheduled) return;

    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }

  private flush() {
    this.scheduled = false;
    const kind = this.invalidation;
    this.invalidation = "none";
    this.renderer.render(kind);
  }
}
```

后续可加入 max FPS、animation clock 和 backpressure，但 mutation batch 默认应合并成一次 frame。

## 11.3 初始工程目标

以下是 Phase 0 后需要用真实基线校准的目标，不是未经测量的性能承诺：

| 场景 | 初始 gate |
|---|---|
| 单个 label 更新，80x24 | 不发送 clear-screen；ANSI payload < 256 B |
| Button click -> frame | reference machine p95 < 16 ms |
| 240x80 完整 buffer diff | p95 < 4 ms |
| 10k logical items、200 visible | scroll p95 < 16 ms，无全量 mount |
| resize burst | 合并 resize；最终尺寸正确，无 listener leak |
| idle | 无持续 render loop，CPU 接近 0 |
| benchmark regression | main branch 关键指标不回退超过 10% |

## 11.4 Virtualization

`VirtualList` 不应只是 ScrollView 包住全部 children。它需要：

- item key
- estimated/known height
- viewport range
- overscan
- scroll anchor
- focus item 保活
- dynamic height cache

```tsx
<VirtualList
  items={rows}
  itemKey={(row) => row.id}
  estimatedItemHeight={1}
  overscan={5}
  renderItem={(row) => <LogRow row={row} />}
/>
```

## 11.5 OpenTUI adapter、WASM 与自研 native gate

native 决策分三步，而不是直接开始写 Zig。

### Gate A：OpenTUI adapter prototype

先实现 `@uniview/tui-backend-opentui`：

```text
UINode mutations
  -> TuiScene operations
  -> OpenTuiBackend adapter
  -> @opentui/core imperative Renderables
  -> OpenTUI native engine
```

要求：

- 不使用 `@opentui/react`，避免双重 reconciliation。
- public API 不暴露 `BoxRenderable`、`CliRenderer` 等类型。
- 运行与 TypeScript backend 相同的 cell/semantics/focus/hit-test fixtures。
- 单独评估 Bun/Node runtime、native package、API stability 和 license/upgrade cost。
- adapter 能删除而不破坏 plugin/component API。

### Gate B：WASM kernel experiment

wterm 的 `TerminalCore` interface 证明可插拔 WASM state core 能兼顾浏览器与 Node。[R13] Uniview 可以针对以下纯计算模块试验 WASM：

- grapheme segmentation / width table
- flat cell composition
- frame diff
- hit-grid generation

但 terminal lifecycle 和 browser DOM presentation 仍由 host 负责。WASM 不是自动比优化过的 TypeScript 更快，必须测量 boundary/serialization 成本。

### Gate C：自研 Zig/Rust

只有满足以下至少一项才启动：

- profiler 显示 text/cell/diff hot loops 占 frame CPU 30% 以上；
- 优化后的 TS 和 OpenTUI adapter 都无法满足目标负载；
- GC pause 明确造成可见 input jitter；
- OpenTUI 依赖/runtime/ABI 无法满足发布策略；
- 需要完全控制 renderer ABI 或跨语言 embedding。

建议 ABI 只暴露批量入口：

```c
uint64_t uv_renderer_create(const uv_renderer_options* options);
int32_t uv_renderer_resize(uint64_t handle, uint32_t width, uint32_t height);
int32_t uv_renderer_apply_batch(
    uint64_t handle,
    const uint8_t* commands,
    size_t command_len
);
int32_t uv_renderer_render(uint64_t handle, uv_render_output* output);
void uv_renderer_destroy(uint64_t handle);
```

禁止每个 node/cell 一次 FFI。TypeScript backend 始终保留为 fallback、test oracle 和 unsupported-platform implementation。

<!-- PAGEBREAK -->

# 12. 分阶段 Implementation Plan

所有 phase 都采用同一 exit rule：**没有自动测试、failure artifact 和 measurable exit criteria，就不算完成。** 时间为一名全职工程师的保守估算，可并行但不要跳过依赖顺序。

## Phase 0 — RFC、基线、View Resolution 与 Automation Schema（1-2 周）

### 目标

冻结产品 contract，避免后续用实现细节反推 API。

### Test-first 顺序

1. 将当前 TUI demo 保存为 fixture，记录 cells/ANSI/exit behavior。
2. 固定 `surface-specific -> universal -> unsupported` view resolution tests。
3. 定义 `SemanticNode`、role/name/id、command 与 capability schema。
4. 定义 automation action/wait/expect JSON schema 和 error taxonomy。
5. 建立 benchmark CLI 与 reference machine profile。
6. 写 ADR：TUI 是 host、backend/surface 分离、OpenTUI adapter 是 optional。

### 交付物

- `docs/adr/tui-host-and-surfaces.md`
- `docs/adr/multi-surface-view-resolution.md`
- `docs/adr/automation-protocol.md`
- baseline fixtures 与 benchmark report
- versioned schema package

### Exit criteria

- 对所有 resolution combinations 有 deterministic tests。
- 当前 demo failure cases 可重现。
- schema 无 `TBD`，并能生成 JSON Schema。

## Phase 1 — Core Seam、Memory Surface 与 Deterministic Scheduler（2 周）

### 目标

把 `process.stdin/stdout` 与 React reconciler 从 renderer core 中抽离。

### 实施步骤

1. 建立 `TuiScene`、`RenderBackend`、`CellSurface` 和 `TerminalDriver` interfaces。
2. 实现 `MemoryCellSurface`。
3. 实现 fake clock、queued microtask/frame scheduler。
4. 让当前 React POC 通过 compatibility adapter 走新 seam。
5. 实现 diagnostics revisions 和 deterministic `waitForIdle`。
6. 所有 listener/driver 可 inject、可 destroy。

### Tests

- Memory surface 可以渲染当前 demo。
- `destroy()` idempotent，无 listener/timer leak。
- production core 无直接 `process.stdin/stdout` access。
- `waitForIdle` 对 mutation、handler、transport 和 animation 均正确。

### Exit criteria

- unit/integration tests 无真实 TTY 运行。
- direct demo UI 不变，内部依赖方向已正确。

## Phase 2 — Unicode-correct CellBuffer 与 Text Engine（2-3 周）

### 目标

建立所有 surface 和 backend 的正确性真相。

### 实施步骤

- flat typed/struct-of-arrays buffer 或紧凑 flat array
- style interning
- grapheme segmentation
- width 0/1/2 与 continuation cells
- overwrite/clear wide-cell invariants
- wrapping、ellipsis、hard/word break
- line metrics 与 cursor mapping

### Tests

- ASCII、CJK、emoji、ZWJ、combining marks、variation selectors。
- wide character 在右边界的 policy。
- 覆盖 lead/continuation 不留半个字符。
- property tests：任意写入后 buffer invariant 成立。
- serialization round-trip 与 cell schema version。

### Exit criteria

- Unicode corpus deterministic。
- Memory/SVG serialization 共享同一 frame model。

## Phase 3 — Yoga-compatible Layout、Paint、Layer 与 HitMap（3 周）

### 目标

达到现代 TUI 的基础 layout/visual 能力。

### 实施步骤

- `LayoutEngine` adapter；首版可使用 Yoga binding
- flex grow/shrink、min/max、margin/padding/gap、align/justify
- absolute positioning、overflow/clip
- background、border、opacity/style inheritance
- layer/portal/modal order
- paint ownership、semantic bounds、double-buffered HitMap

### Tests

- 固定宽度 fixtures：40/80/120 columns。
- Web-like flex cases 与 expected cell bounds。
- clipping、overlap、z-index、border corners。
- topmost hit-test；hidden/disabled semantics。
- React/Solid 产生同一 TuiScene/CellBuffer。

### Exit criteria

- demo 在窄/宽 viewport responsive。
- layout fixtures 不依赖真实 terminal。

## Phase 4 — ANSI Surface、Frame Diff、Terminal Lifecycle 与 Resize（2-3 周）

### 目标

形成可靠、无闪烁、可恢复的真实 terminal output。

### 实施步骤

1. `AnsiCellSurface` 与 changed-run planner。
2. style/cursor state machine，避免冗余 escape sequence。
3. alternate/main/inline modes。
4. raw mode、cursor、mouse、paste 的 enter/leave transaction。
5. resize coalescing 与 stdout backpressure。
6. normal exit、Ctrl-C、SIGTERM、error cleanup。
7. PTY harness。

### Tests

- 单 cell update 不清屏。
- no-change frame 输出 0 或近 0 bytes。
- ANSI enter/leave goldens。
- resize burst 最终尺寸正确。
- cleanup idempotent。
- Linux PTY startup/exit/Ctrl-C smoke。

### Exit criteria

- 首帧后不再全屏 clear。
- 异常路径尽最大可能恢复 terminal。

## Phase 5 — Incremental Input Parser、Focus、Mouse、Paste（3 周）

### 目标

完成 keyboard-first 且 mouse-friendly 的交互基础。

### 实施步骤

- incremental UTF-8 + CSI/SS3 parser
- normalized Key/Text/Paste/Mouse/Resize/Focus events
- SGR mouse click/move/drag/wheel
- bracketed paste
- focus order、groups、scopes、trap、restore
- capture/target/bubble event dispatch
- host-local default actions 和 command keymap

### Tests

- 每个 escape sequence 对任意 byte split 一致。
- disabled/hidden 不进入 focus order。
- modal focus trap 和 close 后 restore。
- drag/click topmost target。
- wheel 路由到最近 scroll container。
- paste 不被拆成 shortcuts。

### Exit criteria

- keyboard-only 完成所有核心流程。
- mouse 可操作 Button、Tabs、Select、ScrollView。

## Phase 6 — Core Components 与 Default Theme（4 周）

### 目标

从 renderer 变成可用 framework。

### 第一批组件

- `Box`、`Text`、`Stack`、`Inline`、`Spacer`、`Divider`、`Panel`
- `Pressable`、`Button`
- `TextInput`、`TextArea`
- `ScrollView`、`List`
- `Checkbox`、`RadioGroup`、`Switch`
- `Select`、`Tabs`
- `Dialog`、`Toast`
- `ProgressBar`、`Spinner`

### TDD 顺序

1. headless state machine tests
2. semantic adapter tests
3. layout/paint/cell tests
4. React/Solid wrapper conformance
5. mouse/keyboard interaction tests
6. 16-color/truecolor SVG artifacts

### Exit criteria

- 默认 theme 在 16-color 与 truecolor 可读。
- 每个 interactive component 有 disabled/focus/mouse/resize tests。
- 至少 form、dashboard、log viewer fixtures。

## Phase 7 — `host-tui`、Protocol Integration、Slots 与 Surface Overrides（3 周）

### 目标

让 TUI 正式成为 Uniview host，并完成 shared-logic/tailored-view 模型。

### 实施步骤

1. `MutableTree` 消费 `setRoot` 与 mutation batches。
2. revision/gap recovery 与 full-tree fallback。
3. component registry 和 handler ID dispatch。
4. direct/Worker/`worker_threads`/WebSocket controllers。
5. host-local widget state reconciliation。
6. plugin `view` + `surfaces` resolution。
7. shell-owned typed slots：header/sidebar/status/overlay/command providers。
8. capability negotiation。

### Tests

- 同一 demo 从 React direct、Solid direct、Worker 和 WS 运行。
- universal view fallback 与 TUI override priority。
- session-local focus/scroll 不污染另一 host session。
- protocol disconnect/reconnect 和 revision gap recovery。

### Exit criteria

- 四种 runtime 通过同一 interaction contract。
- old `@uniview/tui-renderer` compatibility facade 可运行。

## Phase 8 — DOM Cell Surface、Browser TUI Preview 与 Playwright（2-3 周）

### 目标

利用同一 CellBuffer 在浏览器呈现 exact TUI，同时保留 semantic Web host。

### 实施步骤

- DOM row pool + styled run coalescing
- dirty-row presentation + rAF scheduler
- cursor、selection、copy、resize
- hit-map to DOM pointer mapping
- semantic accessibility overlay
- SVG surface 复用同一 style/text model
- browser preview panel 和 Web/TUI side-by-side dev page

### Tests

- 只更新 dirty rows。
- native text selection/copy。
- XSS-safe text rendering。
- pointer coordinate -> cell -> semantic target。
- ResizeObserver/fixed-size behavior。
- Playwright typing、click、scroll、focus、resize。

### Exit criteria

- browser mirror 与 Memory frame hash 一致。
- semantic Web view 和 TUI mirror 可同时运行。

## Phase 9 — Semantic Automation、Recorder/Replay 与 shell-use E2E（3-4 周）

### 目标

建立 AI-friendly、跨 surface 的结构化操作层，并引入独立 PTY oracle。

### 实施步骤

- `AutomationSession` service
- role/name/id/command selectors
- actions、wait conditions、assertions
- versioned JSON/agent-context/skill generation
- named sessions、local socket/WebSocket clients
- action/mutation/event/frame-hash recording
- cross-surface replay
- optional `@uniview/testing-shell-use`
- failure artifact bundle：cells/SVG/trace/ANSI/cast

### Tests

- CLI schema 与 implementation 自动一致。
- stable error kinds/codes。
- read-only policy 拒绝 interaction。
- one semantic trace 在 Web/TUI/native adapter 重放。
- shell-use real mouse/resize/exit smoke。
- recording redaction。

### Exit criteria

- AI 不需要 OCR 即可完成 flagship demo flow。
- CI failure 可由 trace 确定性 replay。

## Phase 10 — Virtualization、DevTools 与性能门槛（3 周）

### 目标

支持大型实际应用并解释性能原因。

### 实施步骤

- `VirtualList`、virtualized Table/LogView
- render coalescing、layout/paint invalidation flags
- style/layout cache
- frame stats overlay
- semantic tree/layout/focus/hit-grid inspector
- protocol mutation/event/automation timeline
- multi-surface preview workspace
- benchmark CI budgets

### Exit criteria

- 10k items 只 mount 可见范围。
- devtools 显示 frame time、changed cells、ANSI bytes、dirty DOM rows、focused path。
- benchmark regression gate 可操作。

## Phase 11 — OpenTUI Adapter、Optional Native 与 1.0 Hardening（4-7 周，按 gate）

### 目标

验证复用现有 native engine 的收益，并在证据充分时决定长期 backend。

### 实施步骤

1. `@uniview/tui-backend-opentui` prototype。
2. mapping：Box/Text/Input/Scroll/Code 的 imperative Renderables。
3. TS/OpenTUI backend conformance。
4. runtime/package/API stability report。
5. 决定：保持 TS、采用 OpenTUI、WASM kernel、或自研 Zig/Rust。
6. platform install/fallback matrix。
7. release engineering、docs、deprecation policy。

### Exit criteria

- OpenTUI adapter 可选安装，不影响基础 package。
- unsupported platform 自动回退 TS。
- native/default 选择有 benchmark 和 maintenance 依据。
- 安装不要求用户本地 toolchain。

<!-- PAGEBREAK -->

# 13. 迁移策略与旗舰 multi-surface demo

## 13.1 兼容路径

当前用户代码应尽量不被一次性破坏：

```ts
// @uniview/tui-renderer compatibility facade
export {
  Box,
  Text,
  Button,
  Input,
  Newline,
  createTuiRoot,
} from "@uniview/tui-react/compat";
```

迁移阶段：

1. `0.x`：旧包转发到新实现并显示一次 deprecation warning。
2. 新文档使用 `@uniview/ui`、`@uniview/tui-react` 或 `@uniview/tui-solid`。
3. `createTuiRoot()` 保留；推荐 `await render(<App />)`。
4. standalone direct API 内部仍走 in-process protocol path。
5. `Input.onChange` 兼容，同时增加 `onValueChange`。
6. old color strings 映射到 theme/color resolver。
7. per-surface API 是 additive，不强迫现有 plugin 重写。

## 13.2 旗舰 demo：Git Workspace Plugin

不要继续只用 Counter 证明框架。建议一个 plugin package 同时展示三种 tailored view 和一个 exact TUI browser mirror：

```text
examples/git-workspace-plugin/
  model/                    # shared state/services/commands
  views/
    universal.tsx           # portable fallback
    tui.tsx                 # keyboard-first full-screen UI
    web.tsx                 # browser split panes / drag / context menu
    native.tsx              # SwiftUI/AppKit toolbar + sidebar
  tests/
    semantic-contract.ts
    tui-interaction.ts
    web-playwright.ts
    shell-use-e2e.ts
```

```tsx
export default defineReactPlugin({
  id: "dev.uniview.git-workspace",
  model: createGitWorkspaceModel(),

  view(ctx) {
    return <PortableRepositorySummary model={ctx.model} />;
  },

  surfaces: {
    tui(ctx) {
      return <GitWorkspaceTui model={ctx.model} />;
    },
    web(ctx) {
      return <GitWorkspaceWeb model={ctx.model} />;
    },
    native(ctx) {
      return <GitWorkspaceNative model={ctx.model} />;
    },
  },

  commands: [
    refreshCommand,
    openFileCommand,
    stageFileCommand,
    commitCommand,
  ],
});
```

TUI view 应展示：

- file status virtual list
- diff/markdown/code pane
- command palette
- mouse + keyboard
- dialog/toast/status bar
- resize responsive layout
- remote worker updates

Web view 应展示 browser-native split panes、context menu 与 drag；native view 使用 platform toolbar/sidebar。三者共享 command IDs、semantic roles 和 model transitions。

## 13.3 Browser preview workspace

开发模式建议同时打开：

```text
┌ Web semantic view ┐ ┌ Exact TUI DOM mirror ┐ ┌ Inspector ┐
│ tailored browser  │ │ same CellBuffer       │ │ tree      │
│ experience        │ │ as actual terminal    │ │ events    │
└───────────────────┘ └───────────────────────┘ │ commands  │
                                                 │ trace     │
                                                 └───────────┘
```

这会直观展示 Uniview 的独特价值：不是“同一个布局硬塞三端”，而是“共享业务与语义，同时每端保持高质量”。

## 13.4 Flagship automated flow

一条 semantic trace：

```ts
const flow = defineAutomationFlow("review-and-stage", async ({ app }) => {
  await app.act.activate({ role: "button", name: "Refresh" });
  await app.wait.command("git.refresh", "completed");
  await app.act.select({ role: "row", name: /README.md/ });
  await app.expect.node({ role: "region", name: "Diff" }, { visible: true });
  await app.act.activate({ role: "button", name: "Stage file" });
  await app.expect.command("git.stage", { status: "completed" });
});

runOnSurfaces(flow, ["web", "tui", "native"]);
```

额外 TUI 黑盒 test 用 shell-use 驱动真实 binary，验证 mouse、resize、ANSI lifecycle，并在失败时保存 SVG 和 cast。

## 13.5 wterm 的可选产品整合

在 Git/CI workspace Web view 中，可以将真实 build shell 作为 host-specific component：

```tsx
<TerminalSession
  sessionId={buildSession.id}
  emulator="wterm"
  transport="websocket"
/>
```

它解决的是“显示真实 shell/PTY”，不是“渲染 Uniview TUI component tree”。这两个能力放在同一个平台中反而很强：Web app 可同时显示 structured Uniview panels 和真实 terminal session。

<!-- PAGEBREAK -->

# 14. 首批 PR、风险与发布门槛

## 14.1 推荐首批 18 个 PR

1. **ADR：TUI host、view resolution、backend/surface split**
2. **Baseline fixtures + benchmark + current bug regressions**
3. **`tui-core` interfaces + MemoryCellSurface + deterministic scheduler**
4. **flat CellBuffer + style interning**
5. **grapheme/wide-cell text engine + Unicode corpus**
6. **scene tree + current reconciler compatibility adapter**
7. **layout adapter + clip/background/border**
8. **HitMap + semantic bounds + layers**
9. **ANSI CellSurface + frame diff**
10. **TerminalSession lifecycle + resize + PTY smoke**
11. **incremental input parser + bracketed paste**
12. **FocusManager + mouse click/drag/wheel**
13. **Button/TextInput/ScrollView + default theme**
14. **`host-tui` protocol integration + React/Solid conformance**
15. **universal view + surface override resolution + slots**
16. **DOM CellSurface + Playwright + SVG surface**
17. **AutomationSession + cross-surface contract + recorder**
18. **shell-use optional E2E + artifact bundle + OpenTUI adapter spike**

每个 PR 必须包含 test、failure artifact 和可观察的 before/after；不要以“重构”提交无法验证的大块代码。

## 14.2 主要风险

| 风险 | 缓解措施 |
|---|---|
| TUI/Web/native props 分叉 | shared semantic contracts；surface overrides 有明确 resolution |
| 最低公分母 UI | portable view 可选；tailored views 是一等公民 |
| Remote input latency | host-local widget state + optimistic reconciliation |
| Unicode edge cases | corpus + property tests + support boundary |
| Terminal compatibility | capability layer、PTY、release matrix |
| DOM cell surface node/perf | style-run coalescing、dirty rows、rAF、benchmarks |
| DOM cell XSS/accessibility | text nodes/escaping、semantic accessibility overlay |
| Automation 被滥用 | production default off、auth、scopes、redaction、rate limits |
| shell-use API 变化 | optional adapter、pin version、nightly first |
| OpenTUI 绑定造成 lock-in | adapter boundary、public API 无 OpenTUI types、TS fallback |
| Snapshot 过度脆弱 | semantic/cell truth 为主，ANSI/SVG 分层 |
| 多 plugin 抢快捷键/焦点 | shell-owned commands、focus scopes、slot ownership |
| 多 session state 污染 | host-local viewport/focus/controller，不同步 presentation state |

## 14.3 Beta release gate

- 所有 P0 correctness tests 通过。
- React/Solid/direct/Worker parity。
- universal view + TUI override resolution 稳定。
- Button/TextInput/ScrollView/List/Tabs/Dialog/Select 可用。
- mouse click/wheel、paste、resize、focus trap。
- no full-screen clear after initial frame。
- Memory/ANSI/DOM-cell/SVG surfaces。
- browser preview Playwright tests。
- semantic automation query/act/wait/expect。
- startup/exit/Ctrl-C/error PTY tests。
- examples、testing guide、compatibility table。

## 14.4 1.0 release gate

- Worker/WebSocket/native host semantic contract parity。
- stable protocol/component/automation versioning。
- cross-surface trace replay。
- virtual list/table/log performance。
- AI agent-context 与 stable error taxonomy。
- shell-use pinned release smoke on Linux/macOS/Windows，或等价自有 harness。
- API deprecation policy 与 security model。
- CI performance/leak budget。
- OpenTUI/native backend 若存在，不得成为安装可靠性的单点故障。

## 14.5 Release artifact bundle

每个 failed E2E job 至少上传：

```text
semantic-tree.json
frame.cells.json
frame.svg
interaction.trace.json
mutations.jsonl
terminal-output.ansi
session.cast              # real PTY tests
host-diagnostics.json
```

这使开发者和 AI 可以直接定位失败，无需从一张模糊 terminal screenshot 推断内部状态。

# 15. 最终建议

Uniview 不需要复制 Ink、OpenTUI、wterm 或 shell-use；应把它们解决得最好的部分放进 Uniview 独有的 multi-host/plugin 架构：

- 从 Ink 借鉴 React DX、简单 frame testing 和 Node-friendly baseline。
- 从 OpenTUI 借鉴 terminal application engine 的能力目标，并用 adapter 验证复用价值。
- 从 Ratatui 借鉴 CellBuffer 作为 correctness truth。
- 从 Textual 借鉴 Pilot、semantic queries、focus/mouse 和 visual artifacts。
- 从 Bubble Tea 借鉴 deterministic state/event tests 与 raw ANSI goldens。
- 从 wterm 借鉴 pluggable core、DOM rows/spans、dirty rows、rAF 和 browser-native text UX。[R13][R14]
- 从 shell-use 借鉴 named sessions、machine-readable agent surface、wait/expect、recording、SVG 和 external PTY oracle。[R15]
- 保留并强化 Uniview 自己的 UINode、incremental updates、isolation、multi-host、surface overrides 和 type-safe RPC。[R1]

最重要的产品定位是：

> **Uniview 是跨 surface 的隔离式插件 UI runtime，也是 structured-first、terminal-compatible 的 UI automation platform。**

最关键的执行顺序是：

```text
contracts + failing tests
-> Memory/CellBuffer correctness
-> layout/paint/hit-map
-> ANSI lifecycle/diff
-> input/focus/mouse
-> components
-> host/protocol/surface overrides
-> DOM-cell browser mirror
-> semantic automation + real PTY oracle
-> virtualization/devtools
-> OpenTUI/native decision
```

下一阶段最有价值的 vertical slice 不是完成所有 widget，而是：

> **同一个 Git Workspace plugin，在 Web、TUI 和 SwiftUI 中使用共享 model/commands、tailored views 和同一 semantic test；TUI 同时可在真实 terminal 与 browser DOM mirror 中显示，并由 AI 通过结构化 automation 驱动。**

这条 slice 一旦完成，就能清楚证明 Uniview 为什么比“单纯更快的 Ink”或“OpenTUI 的 wrapper”更有价值。

<!-- PAGEBREAK -->

# 参考资料

- **[R1]** HuakunShen/uniview, public GitHub repository and README, accessed 2026-07-13. `https://github.com/HuakunShen/uniview`
- **[R2]** `packages/tui-renderer/src/terminal/renderer.ts`, public `main` branch, accessed 2026-07-13.
- **[R3]** `packages/tui-renderer/src/reconciler/host-config.ts`, public `main` branch, accessed 2026-07-13.
- **[R4]** `packages/tui-renderer/src/components.tsx`, public `main` branch, accessed 2026-07-13.
- **[R5]** `packages/tui-renderer/tests/index.test.ts`, public `main` branch, accessed 2026-07-13.
- **[R6]** `examples/tui-demo/src/index.tsx`, public `main` branch, accessed 2026-07-13.
- **[R7]** *Modern TUI Architecture Research for Uniview*, user-provided research report.
- **[R8]** OpenTUI, *Testing*, `https://opentui.com/docs/core-concepts/testing/`, accessed 2026-07-13.
- **[R9]** Textual, *Testing*, `https://textual.textualize.io/guide/testing/`, accessed 2026-07-13.
- **[R10]** Ratatui, `TestBackend`, `https://docs.rs/ratatui/latest/ratatui/backend/struct.TestBackend.html`, accessed 2026-07-13.
- **[R11]** Yoga, `https://www.yogalayout.dev/`, accessed 2026-07-13.
- **[R12]** Node.js TTY documentation, `https://nodejs.org/api/tty.html`, accessed 2026-07-13.
- **[R13]** Vercel Labs, wterm repository and package READMEs, `https://github.com/vercel-labs/wterm`, accessed 2026-07-13.
- **[R14]** wterm DOM renderer, `packages/@wterm/dom/src/renderer.ts`; core interface, `packages/@wterm/core/src/terminal-core.ts`; browser tests, public `main` branch, accessed 2026-07-13.
- **[R15]** Microsoft, shell-use repository, README, SKILL and Cargo manifest, `https://github.com/microsoft/shell-use`, accessed 2026-07-13.
- **[R16]** *Pasted markdown (1)*, user-provided supplementary architecture/testing recommendation, reviewed 2026-07-13.
