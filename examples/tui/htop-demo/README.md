# @uniview/tui-htop-demo

An **htop-style system monitor** — a live CPU/MEM history plot and meters above a
sortable process table.

```bash
pnpm --filter @uniview/tui-htop-demo dev
```

Keys: `↑`/`↓` `PgUp`/`PgDn` move · sort by **C**PU · **M**EM · **T**IME · **P**ID ·
**N**ame (press the key again to flip direction) · `q` or `Ctrl-C` quit.

## What it shows

- **History plot** — one `<LineChart>` with two braille lines, CPU (green) and
  MEM (cyan), scrolling over the last 60 samples, y fixed to 0–100%.
- **Meters** — `<LineGauge>` bars for current CPU and MEM that shift green →
  yellow → red as they climb, plus core count / load average / process count.
- **Process table** — a virtualized `<Table>`; every column sorts (the active
  column shows `▲`/`▼`). Default is CPU-descending, like htop.

## How it works

The rendering is entirely existing primitives — **no renderer changes**. The
demo's own code is the data layer, in `src/sysinfo.ts`:

- **Sampling is real I/O.** CPU% comes from differencing two `os.cpus()`
  snapshots (`1 − Δidle/Δtotal`), memory from `os.freemem()/totalmem()`, and the
  process list from shelling out to `ps`. This is exactly the Node/Bun
  **bridge-plugin** story — a sandboxed Worker can't read these; a plugin with
  real I/O can. If `ps` isn't available, a deterministic synthetic table keeps
  the demo running.
- **The parsing and math are pure and unit-tested** — `computeCpuPercent`,
  `parseEtime` (`[[DD-]HH:]MM:SS` → seconds), `parsePs` (keeps a spaced command
  path whole), and `sortProcesses`. See `tests/sysinfo.test.ts`.

Sampling runs on a **1.5 s interval** in `main.tsx` (not per animation frame — a
process monitor updates ~1 Hz, and each sample spawns `ps`). Each sample
re-renders with a fresh frame; the **sort and cursor state live in `<App>`**, so
re-sorting is instant and survives the next sample. History is a ring buffer of
the last 60 readings passed down as a prop.
