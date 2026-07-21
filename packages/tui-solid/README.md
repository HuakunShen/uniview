# @uniview/tui-solid

Render **Solid** components to a terminal. It is feature-for-feature equivalent to
`@uniview/tui-react`, using the same framework-neutral terminal engine.

## Install

```bash
pnpm add @uniview/tui-solid solid-js
```

The package includes its Solid compiler integration. Vite, `vite-node`, and TypeScript remain
normal project tooling, not runtime dependencies of your terminal app:

```bash
pnpm add -D vite vite-node typescript
```

## Configure Vite and TypeScript

Create `vite.config.ts` with the public helper. It lowers TSX to Uniview's terminal renderer,
uses the reactive Solid development/browser conditions in Node, and keeps the relevant modules
inside Vite's SSR graph:

```ts
import { univiewSolid } from "@uniview/tui-solid/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [univiewSolid()],
});
```

Use normal preserved JSX in `tsconfig.json`, then make the public JSX augmentation visible to
your app. No internal Uniview package or `node_modules` path is required.

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true
  },
  "include": ["src"]
}
```

```ts
// src/uniview-jsx.d.ts
import type {} from "@uniview/tui-solid/jsx-runtime";
```

## Quick start

`render()` creates the terminal surface, starts input handling, and mounts your Solid app.
Everything in this example comes from the one public binding package.

```tsx
// src/App.tsx
import { Panel, Text } from "@uniview/tui-solid";

export function App() {
  return (
    <Panel title="Hello" focused>
      <Text bold>from Solid</Text>
    </Panel>
  );
}
```

```tsx
// src/main.tsx
import { render } from "@uniview/tui-solid";
import { App } from "./App";

const app = render(() => <App />);

process.on("SIGINT", () => {
  app.destroy();
  process.exit(0);
});
```

Mount once — signal writes drive every later frame. There is no `rerender()`.
`app.destroy()` restores the terminal before an intentional process exit.

## Components

|                 |                                                                                     |
| --------------- | ----------------------------------------------------------------------------------- |
| **Primitives**  | `Box` `Text` `RichText`                                                             |
| **Layout**      | `Panel` (titled/footered border, focus color) · `StatusBar`                         |
| **Lists**       | `List` (selection, full-row highlight, scroll-into-view) · `VirtualList` · `Select` |
| **Interaction** | `ScrollView` · `Hoverable` · `CommandPalette`                                       |
| **Content**     | `Markdown` · `Code` · `Diff` · `StreamingMarkdown`                                  |
| **Charts**      | `BarChart` `Histogram` `Sparkline` `Gauge` `LineChart` `Scatter`                    |
| **Helpers**     | `createFocusList` · `nextFocus` · `listCounter` · `renderNodeToElement`             |

The components, content, and charts are included in this package's published output. You do
not need to install Uniview implementation packages separately.

## Advanced: custom surfaces and no-framework UI

The binding re-exports common core facilities, so tests and custom Solid mount flows can
still use one package:

```ts
import {
  createTuiSolidRoot,
  MemoryCellSurface,
  StyleTable,
} from "@uniview/tui-solid";

const styles = new StyleTable();
const surface = new MemoryCellSurface({ styles });
const root = createTuiSolidRoot({
  surface,
  styles,
  size: { width: 80, height: 24 },
});
```

For a custom terminal surface or a UI with no React/Solid runtime, install core directly:

```bash
pnpm add @uniview/tui-core
```

```ts
import { createTuiApp } from "@uniview/tui-core";

const app = createTuiApp({ input: process.stdin, output: process.stdout });
```

## Working demos

- [`examples/tui/lazygit-solid`](../../examples/tui/lazygit-solid) — a lazygit clone;
  the parity proof against the React version.
- [`examples/tui/2048-solid`](../../examples/tui/2048-solid) — 2048 played by a trained
  n-tuple + expectimax agent.

## Three things that will bite you

**Never write literal `<text>` JSX.** solid-js ships an SVG `text` intrinsic that shadows
our tag (an explicit member beats the renderer's catch-all index signature), so `<text>`
type-checks against SVG attributes. Use the exported `Text` component.

**Never destructure props.** It breaks Solid's reactivity — the value is read once and
frozen. Use `splitProps` or read `props.x` inline. This is enforced by tests, not style.

**Run TSX through Vite.** `tsx` uses esbuild and cannot apply Solid's universal renderer
transform. Run with `vite-node src/main.tsx` in development, or use Vite/Vitest with the
`univiewSolid()` helper above.

## Development

```bash
pnpm test          # vitest
pnpm check-types   # tsc --noEmit — vitest and tsdown do NOT type-check
pnpm build         # tsdown
```
