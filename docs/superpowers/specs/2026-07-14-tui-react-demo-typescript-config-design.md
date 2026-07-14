# tui-react-demo TypeScript 配置设计

## 目标

让 `examples/tui-react-demo` 可以独立执行 TypeScript 类型检查，并与仓库中其他 TUI/React workspace 示例保持一致。

## 方案

- 新增 `examples/tui-react-demo/tsconfig.json`。
- 使用面向 Node.js、ESM、bundler resolution 的严格配置：`target`/`lib` 使用 `esnext`，启用 `react-jsx`、`strict`、`noUnusedLocals`、`noEmit`、`isolatedModules`、`verbatimModuleSyntax` 与 `skipLibCheck`，并加载 Node 类型。
- 在 `package.json` 的 `devDependencies` 中加入 `typescript: "^5.9.3"`。
- 增加 `check-types: "tsc --noEmit"` 脚本，使根目录 Turbo 类型检查可以发现并执行该 demo 的检查。

## 范围与验证

只修改该 demo 的配置文件与依赖声明，不改动运行时代码或其他 workspace。验证包括：

1. `pnpm --filter @uniview/tui-react-demo check-types`
2. `pnpm install --lockfile-only` 后确认 lockfile 收录该 importer 的 TypeScript 依赖

