# tui-react-demo TypeScript 配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `examples/tui-react-demo` 增加可独立运行的严格 TypeScript 类型检查配置。

**Architecture:** demo 使用独立 `tsconfig.json`，以 Node.js ESM + bundler resolution 配置检查 `src/index.tsx`，并通过 workspace package 的 `check-types` script 接入 Turbo。

**Tech Stack:** TypeScript 5.9、React 19、tsx、pnpm workspace。

## Global Constraints

- 只修改 `examples/tui-react-demo` 的配置与依赖声明，不改运行时代码。
- 使用 `typescript: "^5.9.3"` 作为 demo 的 devDependency。
- 保留仓库当前已有的其他未提交改动。
- `tsconfig.json` 使用 `target`/`lib` 为 `esnext`、`jsx: "react-jsx"`、`module: "preserve"`、`moduleResolution: "bundler"`、`types: ["node"]`、`strict: true`、`noUnusedLocals: true`、`noEmit: true`、`isolatedModules: true`、`verbatimModuleSyntax: true`、`skipLibCheck: true`。

---

### Task 1: Add demo TypeScript configuration and dependency

**Files:**
- Create: `examples/tui-react-demo/tsconfig.json`
- Modify: `examples/tui-react-demo/package.json`
- Update: `pnpm-lock.yaml` through pnpm lockfile resolution

**Interfaces:**
- Consumes: existing `examples/tui-react-demo/src/index.tsx`, `@types/node`, `@types/react`, and `tsx` declarations.
- Produces: `pnpm --filter @uniview/tui-react-demo check-types` script and a strict no-emit TypeScript project.

- [x] **Step 1: Add the TypeScript project file**

Create `examples/tui-react-demo/tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "esnext",
    "lib": ["esnext"],
    "moduleDetection": "force",
    "module": "preserve",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "types": ["node"],
    "strict": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [x] **Step 2: Add the local TypeScript dependency and check script**

In `examples/tui-react-demo/package.json`, add:

```json
"check-types": "tsc --noEmit"
```

to `scripts`, and add:

```json
"typescript": "^5.9.3"
```

to `devDependencies`.

- [x] **Step 3: Update only the target importer in the lockfile**

Run:

```bash
pnpm install --lockfile-only --filter @uniview/tui-react-demo
```

Expected: the `examples/tui-react-demo` importer contains `typescript` with specifier `^5.9.3`; unrelated existing lockfile changes remain untouched.

- [x] **Step 4: Run the demo type check**

Run:

```bash
pnpm --filter @uniview/tui-react-demo check-types
```

Expected: exit code `0` with no TypeScript diagnostics.

- [x] **Step 5: Review the final diff**

Run:

```bash
git diff --check -- examples/tui-react-demo/package.json examples/tui-react-demo/tsconfig.json
git status --short
```

Expected: no whitespace errors; only the intended demo files (plus any lockfile change produced for this demo) and the pre-existing user changes are present.
