# @uniview/tui-react

Render **React** components to a terminal, via a custom reconciler — no `react-dom`.

```bash
pnpm add @uniview/tui-react react
```

```tsx
import { AnsiCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot, Panel, Text } from "@uniview/tui-react";

const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (c) => process.stdout.write(c), styles });
const root = createTuiReactRoot({ surface, styles, size: { width: 80, height: 24 } });

root.render(
  <Panel title="Hello" focused>
    <Text bold>from React</Text>
  </Panel>,
);
```

## Components

| | |
|---|---|
| **Primitives** | `Box` `Text` `RichText` |
| **Layout** | `Panel` (titled/footered border, focus color) · `StatusBar` |
| **Lists** | `List` (selection, full-row highlight, scroll-into-view) · `VirtualList` · `Select` |
| **Interaction** | `ScrollView` · `Hoverable` · `CommandPalette` |
| **Content** | `Markdown` · `Code` · `Diff` · `StreamingMarkdown` |
| **Charts** | `BarChart` `Histogram` `Sparkline` `Gauge` `LineChart` `Scatter` |
| **Hooks / helpers** | `useFocusList` · `nextFocus` · `listCounter` · `clampScroll` · `filterCommands` · `renderNodeToElement` |

Charts and content components wrap the pure builders in
[`@uniview/tui-charts`](../tui-charts) and [`@uniview/tui-content`](../tui-content).
The same components exist in [`@uniview/tui-solid`](../tui-solid) and render identically —
prop interpretation is host-side, shared by both.

## Working demos

- [`examples/tui-lazygit-demo`](../../examples/tui-lazygit-demo) — a lazygit clone.
- [`examples/tui-charts-demo`](../../examples/tui-charts-demo) — an oha-style chart dashboard.
- [`examples/tui-opencode-demo`](../../examples/tui-opencode-demo) — a multi-page chat UI.

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
