# @uniview/tui-lazygit-solid

The lazygit-style multi-panel TUI demo — **authored in Solid**.

This is the parity proof for `@uniview/tui-solid`: it is the same application as
[`@uniview/tui-lazygit-demo`](../tui-lazygit-demo) (which is written in React),
rendering through the same framework-agnostic host (`@uniview/host-tui` +
`@uniview/tui-core`). Same panels, same keys, same pixels — different framework.

```bash
pnpm --filter @uniview/tui-lazygit-solid dev     # Ctrl-C to quit
```

- **1–5 / 0** — focus a panel
- **↑ ↓** — move the branch (panel 3) or commit (panel 4) selection

## What it demonstrates

- `Panel` (titled/footered borders, focus color), `List` (selection, full-row
  highlight, scroll-into-view), `StatusBar`, and `nextFocus`/`listCounter` — all
  from `@uniview/tui-solid`.
- Cross-panel reactivity: the Log panel mirrors the commit selected in panel 4.

## Two things that differ from the React twin

**No `rerender()`.** The React demo keeps a mutable `AppState` and calls
`root.render(...)` again after every key. Here the state is signals, the app is
mounted exactly once, and a `setFocused(…)` inside `handleKey` is enough — Solid
updates only the panels that actually changed. Resize needs no re-render either:
`renderer.resize()` invalidates layout and schedules its own repaint, and the
Solid tree is untouched.

**It runs under `vite-node`, not `tsx`.** The public `univiewSolid()` helper in
`vite.config.ts` compiles Solid JSX for the terminal renderer and serves both
`vite-node src/main.tsx` and Vitest. `tsx` uses esbuild alone, which cannot apply
Solid's universal renderer transform.

## Tests

```bash
pnpm --filter @uniview/tui-lazygit-solid test
```
