# @uniview/tui-react

Render **React** components to a terminal with a custom reconciler — no `react-dom`.

## Install

```bash
pnpm add @uniview/tui-react react
pnpm add -D typescript @types/react @types/node
```

The second line is TypeScript/TSX and `process` development tooling only. The runtime install
remains `@uniview/tui-react` plus `react`.

## Quick start

`render()` creates the terminal surface, starts input handling, and mounts your React tree.
Everything in this example comes from the one public binding package.

```tsx
import { Panel, Text, render } from "@uniview/tui-react";

const app = render(
  <Panel title="Hello" focused>
    <Text bold>from React</Text>
  </Panel>,
);

process.on("SIGINT", () => {
  app.destroy();
  process.exit(0);
});
```

`app.destroy()` restores the terminal. Call it before an intentional process exit. React
cannot synchronously unmount while it is rendering, committing, or running an effect; if
teardown originates there, schedule it outside React work, for example with
`queueMicrotask(() => app.destroy())`.

## Components

|                     |                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| **Primitives**      | `Box` `Text` `RichText`                                                                                 |
| **Layout**          | `Panel` (titled/footered border, focus color) · `StatusBar`                                             |
| **Lists**           | `List` (selection, full-row highlight, scroll-into-view) · `VirtualList` · `Select`                     |
| **Interaction**     | `ScrollView` · `Hoverable` · `CommandPalette`                                                           |
| **Content**         | `Markdown` · `Code` · `Diff` · `StreamingMarkdown`                                                      |
| **Charts**          | `BarChart` `Histogram` `Sparkline` `Gauge` `LineChart` `Scatter`                                        |
| **Hooks / helpers** | `useFocusList` · `nextFocus` · `listCounter` · `clampScroll` · `filterCommands` · `renderNodeToElement` |

The components, content, and charts are included in this package's published output. You do
not need to install Uniview implementation packages separately.

## Advanced: custom surfaces and no-framework UI

The binding re-exports common core facilities, so tests and custom React mount flows can
still use one package:

```ts
import {
  createTuiReactRoot,
  MemoryCellSurface,
  StyleTable,
} from "@uniview/tui-react";

const styles = new StyleTable();
const surface = new MemoryCellSurface({ styles });
const root = createTuiReactRoot({
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

- [`examples/tui/lazygit-demo`](../../examples/tui/lazygit-demo) — a lazygit clone.
- [`examples/tui/charts-demo`](../../examples/tui/charts-demo) — an oha-style chart dashboard.
- [`examples/tui/opencode-demo`](../../examples/tui/opencode-demo) — a multi-page chat UI.

## Notes

**Component sources are `.ts`, not `.tsx`.** They use `createElement` directly, because this
package's tsconfig has no `jsx` option — adding `.tsx` sources breaks `check-types`. Tests
are `.tsx`.

**`List` is controlled, and deliberately tracks a "last requested" index.** `selectedIndex`
only becomes the new prop once the parent re-renders, so two ArrowDowns dispatched in one
tick would otherwise both read the stale value and collapse into a single step. Don't
"simplify" that ref away — a test pins it.

**Keys route to the focused node**, bubbling to the nearest ancestor with an `onKeyDown`.
In tests, `dispatchInput(key("Tab"))` first or nothing is focused. Digits arrive as `text`
events; named keys as `key` events.

## Development

```bash
pnpm test          # vitest
pnpm check-types   # tsc --noEmit — vitest and tsdown do NOT type-check
pnpm build         # tsdown
```
