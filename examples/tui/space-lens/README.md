# @uniview/tui-space-lens

A small Space Lens-style disk-tree screen built directly on
`@uniview/tui-core` — no React or Solid binding. It is the reference example
for a bounded, scrollable list:

- the panel uses `flexGrow` + `flexShrink` so its height is bounded by the terminal;
- core `overflow: "scroll"` and `scrollTop` clip rows while keeping the border fixed;
- `VirtualListMachine` clamps selection and scroll state across key input and resize;
- the scrollbar is rendered as a sibling overlay, so it does not scroll with the rows.

```bash
pnpm --filter @uniview/tui-space-lens dev
```

Keys: `j` / `k` or arrow keys move, `PageUp` / `PageDown` scroll by a page,
`Home` / `End` jump, and `q` / `Ctrl-C` quit.
