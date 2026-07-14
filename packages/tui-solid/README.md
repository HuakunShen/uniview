# @uniview/tui-solid

Render **Solid** components to a terminal. The Solid half of uniview's TUI stack —
feature-for-feature equivalent to [`@uniview/tui-react`](../tui-react), on the same
framework-agnostic host.

```bash
pnpm add @uniview/tui-solid solid-js
```

```tsx
import { AnsiCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot, Panel, Text } from "@uniview/tui-solid";

const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (c) => process.stdout.write(c), styles });
const root = createTuiSolidRoot({ surface, styles, size: { width: 80, height: 24 } });

root.render(() => (
  <Panel title="Hello" focused>
    <Text bold>from Solid</Text>
  </Panel>
));
```

Mount once — signal writes drive every later frame. There is no `rerender()`.

## Components

| | |
|---|---|
| **Primitives** | `Box` `Text` `RichText` |
| **Layout** | `Panel` (titled/footered border, focus color) · `StatusBar` |
| **Lists** | `List` (selection, full-row highlight, scroll-into-view) · `VirtualList` · `Select` |
| **Interaction** | `ScrollView` · `Hoverable` · `CommandPalette` |
| **Content** | `Markdown` · `Code` · `Diff` · `StreamingMarkdown` |
| **Charts** | `BarChart` `Histogram` `Sparkline` `Gauge` `LineChart` `Scatter` |
| **Helpers** | `createFocusList` · `nextFocus` · `listCounter` · `renderNodeToElement` |

Charts and content components are thin wrappers over the pure builders in
[`@uniview/tui-charts`](../tui-charts) and [`@uniview/tui-content`](../tui-content),
so they render identically under React and Solid.

## Working demos

- [`examples/tui-lazygit-solid`](../../examples/tui-lazygit-solid) — a lazygit clone;
  the parity proof against the React version.
- [`examples/tui-2048-solid`](../../examples/tui-2048-solid) — 2048 played by a trained
  n-tuple + expectimax agent.

## Three things that will bite you

**Never write literal `<text>` JSX.** solid-js ships an SVG `text` intrinsic that shadows
our tag (an explicit member beats the renderer's catch-all index signature), so
`<text>` type-checks against SVG attributes. Use the exported `Text` component.

**Never destructure props.** It breaks Solid's reactivity — the value is read once and
frozen. Use `splitProps` or read `props.x` inline. This is enforced by tests, not style.

**`tsx`/esbuild cannot compile this.** Solid JSX must go through `babel-preset-solid`
targeting the universal renderer (`moduleName: "@uniview/solid-renderer"`,
`generate: "universal"`). Runnable apps use `vite-node` with a `vite.config.ts` that
hosts the babel plugin, plus `resolve.conditions: ["development", "browser"]` — without
that, Node resolves Solid's SSR build and nothing ever updates. Copy the config from
either demo.

## Development

```bash
pnpm test          # vitest
pnpm check-types   # tsc --noEmit — vitest and tsdown do NOT type-check
pnpm build         # tsdown
```
