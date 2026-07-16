# @uniview/tui-input-lifecycle-demo

A small showcase of Phase 3's input & lifecycle additions in `@uniview/tui-react`:

- **`useInput((input, key) => …)`** — a global keyboard hook. Press `q` or `Escape`
  to quit, with no focused control required. Resolved host-side via
  `InputRouter.subscribeInput` (no per-event round trip).
- **`usePaste((text) => …)`** — bracketed paste reaches the hook as one string;
  paste anything and it is echoed.
- **`<ErrorBoundary fallback={(err) => <ErrorOverview error={err} />}>`** — a render
  error shows a readable panel instead of a wrecked raw-mode terminal.

## Run

```bash
pnpm --filter @uniview/tui-input-lifecycle-demo dev     # q or Ctrl-C to quit
pnpm --filter @uniview/tui-input-lifecycle-demo test
```

The same `useInput`/`usePaste` API is available identically from
`@uniview/tui-solid`.
