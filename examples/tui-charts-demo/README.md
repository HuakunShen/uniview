# @uniview/tui-charts-demo

An oha-style load-test dashboard built on the Uniview TUI stack and the
Phase 2 chart primitives — a `Gauge`, two stat/status panels, and a
`BarChart` + `Histogram` pair that animate once per (simulated) second.

```bash
pnpm --filter @uniview/tui-charts-demo dev
```

## Panels

- **Progress** — a `Gauge` showing elapsed vs. total seconds
  (`{elapsed}s / {total}s` centered on the filled bar).
- **Stats for last sec** — Requests / Slowest / Fastest / Average, computed
  from the response-time samples generated on the most recent tick.
- **Status code distribution** — a placeholder `[200] N responses` line.
- **Requests / past sec** — a green `BarChart` over a rolling window of
  simulated requests/sec.
- **Response time histogram** — a tan (`warning`-themed) `Histogram`,
  binning a rolling window of response-time samples.

## Controls

| Input | Action |
| --- | --- |
| `Ctrl-C` | quit |

## How it works

`createState()` builds an oha-like model (elapsed/total seconds, rolling
requests/sec and response-time arrays, cumulative request count).
`tick(state)` advances the simulated load test by one second — it appends a
new requests/sec value and a batch of response-time samples using
deterministic (seed-free) generators, so re-renders visibly change without
relying on `Math.random()`. `App({ state, host })` is a pure function of
that state, composing `Panel`, `Box`, `Text`, `Gauge`, `BarChart`, and
`Histogram` from `@uniview/tui-react`.

[`src/main.tsx`](src/main.tsx) is just the terminal boot: it wires up a
`TerminalDriver` + `AnsiCellSurface`, and drives the animation with a
`setInterval` that calls `tick(state)` then `host.rerender()` once a second.

Because the whole view is `App(state, host)`, the animation is
integration-tested headlessly against a `MemoryCellSurface` — see
[`tests/app.test.tsx`](tests/app.test.tsx).
