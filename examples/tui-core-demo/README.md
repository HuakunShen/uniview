# @uniview/tui-core-demo

An interactive counter built **directly on `@uniview/tui-core`** — no React, no
framework. It constructs the render tree by hand and drives the layout → paint →
diff → surface pipeline itself, showing the low-level core in isolation.

Useful as the minimal reference for what the framework adapters
(`@uniview/tui-react`, `@uniview/tui-solid`) sit on top of.

```bash
pnpm --filter @uniview/tui-core-demo dev
```

`q` / `Ctrl-C` to quit. For the React (JSX) equivalent see
`examples/tui-react-demo`.
