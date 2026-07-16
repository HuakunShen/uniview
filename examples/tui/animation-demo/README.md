# @uniview/tui-animation-demo

An `animate()` showcase from `@uniview/tui-react` — a bouncing bar driven by the
host **FrameClock**:

```tsx
const w = animate("bar", 30, { from: 2, duration: 900, ease: "bounceOut", loop: true, alternate: true });
```

Each frame the tween writes a new width into an ordinary `<Box>` and the tree
re-renders **locally** — no per-frame message crosses a transport (prime-directive
principle 3). The engine (`Timeline` + `FrameClock` + named easings) is
framework-neutral and lives in `@uniview/tui-core`; the same `animate`/`useAnimation`
hooks exist identically in `@uniview/tui-solid`, and both render byte-identical SVG.

## Run

```bash
pnpm --filter @uniview/tui-animation-demo dev     # Ctrl-C to quit
pnpm --filter @uniview/tui-animation-demo test
```
