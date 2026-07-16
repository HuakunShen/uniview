# @uniview/tui-htop-demo

An **htop-style system monitor** — a live per-core CPU bar chart and a memory
meter above a sortable process table.

```bash
pnpm --filter @uniview/tui-htop-demo dev
```

Keys: `↑`/`↓` `PgUp`/`PgDn` move · sort by **C**PU · **M**EM · **T**IME · **P**ID ·
**N**ame (press the key again to flip direction) · `q` or `Ctrl-C` quit.

## What it shows

- **Per-core CPU** — a `<BarChart>` with one bar per core (numbered), each bar
  colored green → yellow → red by that core's load, plus the overall average in
  the panel title.
- **Memory** — the used percentage shown as bold text *and* on a `<Gauge>` bar,
  with used / total GB, load average, and process count.
- **Process table** — a virtualized `<Table>`; every column sorts (the active
  column shows `▲`/`▼`). Default is CPU-descending, like htop.

## How it works

The rendering is entirely existing primitives — **no renderer changes**. The
demo's own code is the data layer, in `src/sysinfo.ts`:

- **Sampling is real I/O.** Overall and per-core CPU% come from differencing two
  `os.cpus()` snapshots (`1 − Δidle/Δtotal`), memory from
  `os.freemem()/totalmem()`, and the process list from shelling out to `ps`.
  This is exactly the Node/Bun **bridge-plugin** story — a sandboxed Worker can't
  read these; a plugin with real I/O can. If `ps` isn't available, a
  deterministic synthetic table keeps the demo running.
- **The parsing and math are pure and unit-tested** — `computeCpuPercent`,
  `computeCorePercents`, `parseEtime` (`[[DD-]HH:]MM:SS` → seconds), `parsePs`
  (keeps a spaced command path whole), and `sortProcesses`. See
  `tests/sysinfo.test.ts`.

The first frame's CPU bars are a transient artifact (the initial `os.cpus()`
delta spans near-zero time during startup); they settle to real per-core load
after the first sample interval. Memory, load, and the process list are correct
immediately.

Sampling runs on a **1.5 s interval** in `main.tsx` (not per animation frame — a
process monitor updates ~1 Hz, and each sample spawns `ps`). Each sample
re-renders with a fresh frame; the **sort and cursor state live in `<App>`**, so
re-sorting is instant and survives the next sample. History is a ring buffer of
the last 60 readings passed down as a prop.
