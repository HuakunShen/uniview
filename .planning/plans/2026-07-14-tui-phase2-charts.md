# TUI Phase 2 — Charts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Detail level:** This plan is authored at **medium detail** (per the approved spec: Phase 1 full, Phase 2 medium). The novel primitives (Tasks 1–2) are full bite-sized TDD with complete code. The chart builders (Tasks 4–10) give exact interfaces, the core algorithm code, and the test cases to write — each still follows RED → GREEN → commit. Expand any builder task into finer steps at execution time if needed.

**Goal:** Add bar charts, histograms, sparklines, gauges, line and scatter plots (the oha/ratatui dashboard class) as pure builders that ride the existing `richtext` spans pipeline.

**Architecture:** Two new low-level rasterizers in `tui-core` — block-glyph bars (`▁▂▃▄▅▆▇█`) and a braille (2×4) sub-cell canvas — turn numbers into `StyledLine[]`. A new pure package `@uniview/tui-charts` builds `RenderNode`s from data using them (like `@uniview/tui-content` does for code/markdown). `tui-react` adds thin memoized chart components. No new `RenderNode` type, no protocol change.

**Tech Stack:** TypeScript (esnext, strict, `verbatimModuleSyntax`, `isolatedModules`, `noUnusedLocals`), Vitest, tsdown. No `as any` / `@ts-ignore` / `@ts-expect-error`.

**Reference:** design spec `.planning/specs/2026-07-14-tui-layout-charts-design.md`; screenshot detail `.planning/specs/2026-07-14-reference-uis.md`; ratatui examples `~/Dev/others/ratatui/ratatui-widgets/examples/{barchart,sparkline,chart,canvas,gauge}.rs`; oha `~/Dev/others/oha/src/monitor.rs` (its histogram is a `BarChart`).

## Global Constraints

- Run tests per-package: `cd packages/<pkg> && pnpm vitest run`.
- After editing a lib's `src`, `pnpm --filter @uniview/<pkg> build` before dependents pick up `dist`.
- No `as any` / `@ts-ignore` / `@ts-expect-error`.
- New package scaffolding: mirror `@uniview/tui-content` exactly (its `tsdown.config.ts` is `defineConfig({ exports: true })` — do **not** use the `pnpm create tsdown` template's `dts: { tsgo: true }`, which pulls the uninstalled `@typescript/native-preview` and breaks the build).
- Charts are **pure** `data → RenderNode` functions — framework-agnostic, headlessly testable against `MemoryCellSurface`, and reusable by a future Solid binding. No React inside `@uniview/tui-charts`.
- Colors accept a name/CSS string or `{ r, g, b }`. Chart defaults come from `defaultTheme.colors` (`success` green, `warning` tan, `primary` blue).

---

## File Structure

**tui-core** (rasterizers):
- Create `packages/tui-core/src/canvas/blocks.ts` — block-glyph bar helpers.
- Create `packages/tui-core/src/canvas/subcell.ts` — `SubcellCanvas` (braille 2×4).
- Modify `packages/tui-core/src/index.ts` — export both.

**@uniview/tui-charts** (new pure package):
- Create `packages/tui-charts/{package.json,tsdown.config.ts,tsconfig.json,README.md}`.
- Create `packages/tui-charts/src/index.ts` — re-exports.
- Create `packages/tui-charts/src/{bar.ts,histogram.ts,sparkline.ts,gauge.ts,line.ts,scatter.ts,axis.ts}`.

**tui-react** (components):
- Create `packages/tui-react/src/charts.tsx` — `BarChart`/`Histogram`/`Sparkline`/`Gauge`/`LineChart`/`Scatter`.
- Modify `packages/tui-react/src/index.ts` — export them; add `@uniview/tui-charts` dependency.

**example**:
- Create `examples/tui-charts-demo/` — oha-style dashboard (package.json, tsconfig.json, src/app.tsx, src/main.tsx, tests/app.test.tsx, README.md).

---

## Task 1: Block-glyph bar helpers (tui-core)

**Files:**
- Create: `packages/tui-core/src/canvas/blocks.ts`
- Modify: `packages/tui-core/src/index.ts`
- Test: `packages/tui-core/tests/canvas/blocks.test.ts`

**Interfaces:**
- Produces:
  - `VERTICAL_BLOCKS: readonly string[]` (index 0..8 → `" ▁▂▃▄▅▆▇█"`).
  - `HORIZONTAL_BLOCKS: readonly string[]` (index 0..8 → `" ▏▎▍▌▋▊▉█"`).
  - `verticalBarColumn(value: number, max: number, height: number): string[]` — `height` glyphs, **top row first**; the bar fills from the bottom in ⅛-cell steps.
  - `horizontalBarCells(value: number, max: number, width: number): string` — a `width`-cell string filled left→right in ⅛ steps.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tui-core/tests/canvas/blocks.test.ts
import { describe, expect, it } from "vitest";
import { verticalBarColumn, horizontalBarCells, VERTICAL_BLOCKS } from "../../src/canvas/blocks";

describe("verticalBarColumn", () => {
  it("fills from the bottom", () => {
    expect(verticalBarColumn(8, 8, 2)).toEqual(["█", "█"]);   // full
    expect(verticalBarColumn(4, 8, 2)).toEqual([" ", "█"]);   // half height → bottom cell full
    expect(verticalBarColumn(2, 8, 2)).toEqual([" ", "▄"]);   // quarter → bottom cell half block
    expect(verticalBarColumn(0, 8, 2)).toEqual([" ", " "]);   // empty
  });
  it("clamps and handles max<=0", () => {
    expect(verticalBarColumn(99, 8, 1)).toEqual(["█"]);
    expect(verticalBarColumn(5, 0, 1)).toEqual([" "]);
  });
});

describe("horizontalBarCells", () => {
  it("fills left to right", () => {
    expect(horizontalBarCells(4, 8, 2)).toBe("█ ");   // half of 2 cells → first full
    expect(horizontalBarCells(8, 8, 2)).toBe("██");
  });
});

describe("VERTICAL_BLOCKS", () => {
  it("has 9 levels ending in a full block", () => {
    expect(VERTICAL_BLOCKS).toHaveLength(9);
    expect(VERTICAL_BLOCKS[8]).toBe("█");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`cd packages/tui-core && pnpm vitest run tests/canvas/blocks.test.ts`) — module missing.

- [ ] **Step 3: Implement**

```ts
// packages/tui-core/src/canvas/blocks.ts

/** Eighth-block glyphs, index 0..8 (empty → full), growing upward. */
export const VERTICAL_BLOCKS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;
/** Eighth-block glyphs, index 0..8 (empty → full), growing rightward. */
export const HORIZONTAL_BLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;

const clamp8 = (n: number): number => Math.max(0, Math.min(8, n));

/** Glyphs (top row first) for one vertical bar of `value∈[0,max]` over `height` rows. */
export function verticalBarColumn(value: number, max: number, height: number): string[] {
  const eighths = max <= 0 ? 0 : Math.max(0, Math.min(height * 8, Math.round((value / max) * height * 8)));
  const rows: string[] = [];
  for (let fromBottom = height - 1; fromBottom >= 0; fromBottom -= 1) {
    rows.push(VERTICAL_BLOCKS[clamp8(eighths - fromBottom * 8)]!);
  }
  return rows;
}

/** A `width`-cell string for a horizontal bar of `value∈[0,max]`, filled left→right. */
export function horizontalBarCells(value: number, max: number, width: number): string {
  const eighths = max <= 0 ? 0 : Math.max(0, Math.min(width * 8, Math.round((value / max) * width * 8)));
  let out = "";
  for (let cell = 0; cell < width; cell += 1) out += HORIZONTAL_BLOCKS[clamp8(eighths - cell * 8)]!;
  return out;
}
```

Export from `packages/tui-core/src/index.ts`:

```ts
// Canvas rasterizers (charts)
export { VERTICAL_BLOCKS, HORIZONTAL_BLOCKS, verticalBarColumn, horizontalBarCells } from "./canvas/blocks";
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(tui-core): block-glyph bar helpers for charts`.

---

## Task 2: Braille sub-cell canvas (tui-core)

**Files:**
- Create: `packages/tui-core/src/canvas/subcell.ts`
- Modify: `packages/tui-core/src/index.ts`
- Test: `packages/tui-core/tests/canvas/subcell.test.ts`

**Interfaces:**
- Consumes: `StyledLine`, `StyledSpan` (`../text/styled-text`); `Color` (`../style/style-table`).
- Produces: `class SubcellCanvas` with:
  - `constructor(cellWidth: number, cellHeight: number)` — logical resolution is `2*cellWidth × 4*cellHeight` dots.
  - `readonly widthPx: number; readonly heightPx: number`.
  - `set(px: number, py: number, color?: Color): void` — **bottom-left origin** (py grows upward). Out-of-range is ignored.
  - `line(x0: number, y0: number, x1: number, y1: number, color?: Color): void` — Bresenham over dots.
  - `toStyledLines(): StyledLine[]` — one line per cell row, consecutive same-color cells merged into runs; empty cells are un-styled spaces.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tui-core/tests/canvas/subcell.test.ts
import { describe, expect, it } from "vitest";
import { SubcellCanvas } from "../../src/canvas/subcell";
import { styledLineText } from "../../src/text/styled-text";

describe("SubcellCanvas", () => {
  it("maps bottom-left origin dots to braille glyphs", () => {
    const c = new SubcellCanvas(1, 1); // 2x4 dots, one cell
    c.set(0, 0); // bottom-left dot → braille bit 0x40 → U+2840 "⡀"
    expect(styledLineText(c.toStyledLines()[0]!)).toBe("⡀");
  });
  it("sets the top-right dot", () => {
    const c = new SubcellCanvas(1, 1);
    c.set(1, 3); // top-right dot → bit 0x08 → U+2808 "⠈"
    expect(styledLineText(c.toStyledLines()[0]!)).toBe("⠈");
  });
  it("draws a diagonal line spanning cells", () => {
    const c = new SubcellCanvas(2, 1); // 4x4 dots
    c.line(0, 0, 3, 3); // bottom-left to top-right
    const line = c.toStyledLines()[0]!;
    expect(styledLineText(line).trim().length).toBeGreaterThan(0);
  });
  it("carries a per-cell color", () => {
    const c = new SubcellCanvas(1, 1);
    c.set(0, 0, { r: 1, g: 2, b: 3 });
    expect(c.toStyledLines()[0]![0]!.style?.fg).toEqual({ r: 1, g: 2, b: 3 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
// packages/tui-core/src/canvas/subcell.ts
import type { StyledLine, StyledSpan } from "../text/styled-text";
import type { Color } from "../style/style-table";

/** Braille bit for a dot at (col∈0..1, row∈0..3) within a 2×4 cell (top row = 0). */
const BRAILLE_BITS: readonly (readonly number[])[] = [
  [0x01, 0x08], // row 0 (top)
  [0x02, 0x10], // row 1
  [0x04, 0x20], // row 2
  [0x40, 0x80], // row 3 (bottom)
];

/** A braille (2×4-per-cell) drawing surface that rasterizes to styled lines. */
export class SubcellCanvas {
  readonly widthPx: number;
  readonly heightPx: number;
  private readonly mask: Uint8Array;
  private readonly color: (Color | undefined)[];

  constructor(
    readonly cellWidth: number,
    readonly cellHeight: number,
  ) {
    this.widthPx = cellWidth * 2;
    this.heightPx = cellHeight * 4;
    this.mask = new Uint8Array(cellWidth * cellHeight);
    this.color = new Array<Color | undefined>(cellWidth * cellHeight).fill(undefined);
  }

  /** Set a dot. Origin is bottom-left; `py` grows upward. */
  set(px: number, py: number, color?: Color): void {
    if (px < 0 || py < 0 || px >= this.widthPx || py >= this.heightPx) return;
    const topRow = this.heightPx - 1 - py; // flip to top-left row space
    const cellX = px >> 1;
    const cellY = topRow >> 2;
    const idx = cellY * this.cellWidth + cellX;
    this.mask[idx]! |= BRAILLE_BITS[topRow & 3]![px & 1]!;
    if (color !== undefined) this.color[idx] = color;
  }

  line(x0: number, y0: number, x1: number, y1: number, color?: Color): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const dx = Math.abs(Math.round(x1) - x);
    const dy = -Math.abs(Math.round(y1) - y);
    const sx = x < x1 ? 1 : -1;
    const sy = y < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x, y, color);
      if (x === Math.round(x1) && y === Math.round(y1)) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  toStyledLines(): StyledLine[] {
    const lines: StyledLine[] = [];
    for (let cy = 0; cy < this.cellHeight; cy += 1) {
      const spans: StyledSpan[] = [];
      let run = "";
      let runColor: Color | undefined;
      const flush = () => {
        if (run.length === 0) return;
        spans.push(runColor === undefined ? { text: run } : { text: run, style: { fg: runColor } });
        run = "";
      };
      for (let cx = 0; cx < this.cellWidth; cx += 1) {
        const idx = cy * this.cellWidth + cx;
        const bits = this.mask[idx]!;
        const glyph = bits === 0 ? " " : String.fromCharCode(0x2800 + bits);
        const col = bits === 0 ? undefined : this.color[idx];
        if (col !== runColor) { flush(); runColor = col; }
        run += glyph;
      }
      flush();
      lines.push(spans);
    }
    return lines;
  }
}
```

Export from `packages/tui-core/src/index.ts`:

```ts
export { SubcellCanvas } from "./canvas/subcell";
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Build tui-core** — `pnpm --filter @uniview/tui-core build`.
- [ ] **Step 6: Commit** — `feat(tui-core): braille sub-cell canvas rasterizer`.

---

## Task 3: Scaffold @uniview/tui-charts

**Files:** create `packages/tui-charts/{package.json,tsdown.config.ts,tsconfig.json,src/index.ts,README.md}`.

**Interfaces:** Produces an empty-but-building package depending on `@uniview/tui-core`.

- [ ] **Step 1:** Create `packages/tui-charts/package.json` (mirror `@uniview/tui-content`):

```json
{
  "name": "@uniview/tui-charts",
  "type": "module",
  "version": "0.0.1",
  "description": "Charts for Uniview TUI: bar, histogram, sparkline, gauge, line and scatter as a styled-text model",
  "license": "MIT",
  "exports": { ".": "./dist/index.mjs", "./package.json": "./package.json" },
  "types": "./dist/index.d.mts",
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsdown", "dev": "tsdown --watch", "test": "vitest run",
    "check-types": "tsc --noEmit", "typecheck": "tsc --noEmit", "prepublishOnly": "pnpm run build"
  },
  "dependencies": { "@uniview/tui-core": "workspace:*" },
  "devDependencies": { "@types/node": "^22.0.0", "tsdown": "0.22.2", "typescript": "^5.7.0", "vitest": "^2.0.0" }
}
```

- [ ] **Step 2:** `packages/tui-charts/tsdown.config.ts` = `import { defineConfig } from "tsdown";\nexport default defineConfig({ exports: true });`
- [ ] **Step 3:** `packages/tui-charts/tsconfig.json` — copy `packages/tui-content/tsconfig.json` verbatim.
- [ ] **Step 4:** `packages/tui-charts/src/index.ts` — start with `export {};` (fill in per task).
- [ ] **Step 5:** `packages/tui-charts/README.md` — one paragraph (what it is, the builders, that it's pure/framework-agnostic).
- [ ] **Step 6:** Install + verify build: `pnpm install && pnpm --filter @uniview/tui-charts build`. Expected: builds. If pnpm doesn't see the package, confirm `packages/*` is in `pnpm-workspace.yaml` (it is for the other `packages/tui-*`).
- [ ] **Step 7: Commit** — `chore(tui-charts): scaffold package`.

---

## Task 4: renderBarChart

**Files:** create `packages/tui-charts/src/bar.ts`, `packages/tui-charts/tests/bar.test.ts`; modify `src/index.ts`.

**Interfaces:**
- Consumes: `verticalBarColumn`, `styledLinesToRenderNode`, `type RenderNode`, `type StyledLine`, `type Color` (from `@uniview/tui-core`); `defaultTheme` for the default color.
- Produces:
  - `interface BarDatum { label: string; value: number; color?: Color }`
  - `interface BarChartOptions { height?: number; max?: number; barWidth?: number; gap?: number; color?: Color; showValues?: boolean; showLabels?: boolean }`
  - `renderBarChart(data: readonly BarDatum[], options?: BarChartOptions): RenderNode`

**Algorithm:** `max = options.max ?? Math.max(1, ...values)`; `height = options.height ?? 8`. For each plot row `r` in `0..height-1` (top first), concatenate, per datum, `verticalBarColumn(value,max,height)[r]` repeated `barWidth` times as a span styled `{ fg: datum.color ?? options.color ?? theme.success }`, separated by `gap` spaces. Then an optional label row and value row (plain spans). `return styledLinesToRenderNode(lines)`.

**Tests to write (RED first):**
- `renderBarChart([{label:"a",value:1},{label:"b",value:2}], {height:2, max:2, gap:0})` → `verticalBarColumn(1,2,2)=[" ","█"]`, `verticalBarColumn(2,2,2)=["█","█"]`; with `gap:0` the two plot child lines are `styledLineText` `" █"` (top row) and `"██"` (bottom row). (With the default `gap:1` they would be `"  █"` and `"█ █"` — verify whichever gap the test sets.)
- default bar color is the theme `success` green when `color`/`datum.color` unset (check `spans[0].style.fg` equals `defaultTheme.colors.success`).
- `showLabels:true` adds a row containing `"a"` and `"b"`; `showValues:true` adds a row containing `"1"` and `"2"`.

- [ ] Step 1 RED test → Step 2 fail → Step 3 implement → Step 4 pass → Step 5 `export { renderBarChart } from "./bar"; export type { BarDatum, BarChartOptions } from "./bar";` in index → Step 6 commit `feat(tui-charts): renderBarChart`.

---

## Task 5: renderHistogram

**Files:** create `src/histogram.ts`, `tests/histogram.test.ts`; modify `src/index.ts`.

**Interfaces:**
- Consumes: `renderBarChart`, `BarDatum` (Task 4).
- Produces: `interface HistogramOptions extends BarChartOptions { bins?: number }`; `renderHistogram(values: readonly number[], options?: HistogramOptions): RenderNode`.

**Algorithm:** `bins = options.bins ?? 10`. Compute `min`/`max` of `values`; bucket width `= (max-min)/bins` (guard `max===min`). Count values per bucket (last bucket inclusive of `max`). Build `BarDatum[]` with `value = count`, `label = formatBound(min + i*width)` (e.g. 4 significant digits). `return renderBarChart(data, options)`.

**Tests:** `renderHistogram([0,0,1,2,2,2], { bins: 3 })` → counts `[2,1,3]`; assert the bar heights/labels match a `renderBarChart` of `[{label,value:2},{label,value:1},{label,value:3}]`. Empty input → a chart with all-zero bars (no throw).

- [ ] RED → fail → implement → pass → export → commit `feat(tui-charts): renderHistogram (binning over renderBarChart)`.

---

## Task 6: renderSparkline + renderGauge

**Files:** create `src/sparkline.ts`, `src/gauge.ts`, `tests/sparkline.test.ts`, `tests/gauge.test.ts`; modify `src/index.ts`.

**Interfaces:**
- Consumes: `VERTICAL_BLOCKS`, `horizontalBarCells`, `styledLinesToRenderNode`, `type Color`, `defaultTheme`.
- Produces:
  - `renderSparkline(values: readonly number[], options?: { max?: number; color?: Color }): RenderNode` — one line; each value → `VERTICAL_BLOCKS[round(v/max*8)]`, all in one span with `fg`.
  - `renderGauge(fraction: number, options?: { width?: number; color?: Color; label?: string }): RenderNode` — one line; `horizontalBarCells(fraction, 1, width)` filled portion + optional centered `label`.

**Tests:**
- `styledLineText(renderSparkline([0,4,8],{max:8}).children[0])` → `" ▄█"`.
- sparkline default color = theme primary; explicit color respected.
- `renderGauge(0.5,{width:4})` → filled 2 of 4 cells (`"██  "`); `renderGauge(1,{width:4})` → `"████"`.

- [ ] RED → fail → implement → pass → export both → commit `feat(tui-charts): sparkline + gauge`.

---

## Task 7: renderLineChart

**Files:** create `src/line.ts`, `src/axis.ts`, `tests/line.test.ts`; modify `src/index.ts`.

**Interfaces:**
- Consumes: `SubcellCanvas`, `styledLinesToRenderNode`, `type Color`, `type RenderNode`, `defaultTheme`.
- Produces:
  - `interface LineSeries { points: readonly (readonly [number, number])[]; color?: Color }`
  - `interface PlotOptions { width?: number; height?: number; xBounds?: [number, number]; yBounds?: [number, number] }`
  - `renderLineChart(series: readonly LineSeries[], options?: PlotOptions): RenderNode`
  - (in `axis.ts`) `dataToPixel(value, bound, pixels): number` helper — maps a data value in `[bound[0],bound[1]]` to a dot index in `[0, pixels-1]`, clamped.

**Algorithm:** `width = options.width ?? 40`, `height = options.height ?? 10`. Derive `xBounds`/`yBounds` from data if unset. `const canvas = new SubcellCanvas(width, height)`. For each series, map each point to `(px, py)` via `dataToPixel` (py uses bottom-left origin directly — no flip, the canvas flips), and `canvas.line(prevPx, prevPy, px, py, series.color ?? theme.primary)` between consecutive points. `return styledLinesToRenderNode(canvas.toStyledLines())`.

**Tests:**
- `dataToPixel(0, [0,1], 4)` → `0`; `dataToPixel(1, [0,1], 4)` → `3`; clamps out-of-range.
- `renderLineChart([{ points: [[0,0],[1,1]] }], { width: 2, height: 2, xBounds: [0,1], yBounds: [0,1] })` → the rendered lines contain at least one non-space braille glyph (a diagonal).
- two series with different colors → both colors appear among the spans.

- [ ] RED → fail → implement → pass → export `renderLineChart`, `LineSeries`, `PlotOptions` (+ `dataToPixel` from axis) → commit `feat(tui-charts): renderLineChart on braille canvas`.

---

## Task 8: renderScatter

**Files:** create `src/scatter.ts`, `tests/scatter.test.ts`; modify `src/index.ts`.

**Interfaces:**
- Consumes: `SubcellCanvas`, `dataToPixel` (Task 7 axis), `LineSeries`/`PlotOptions` (Task 7), `styledLinesToRenderNode`, `defaultTheme`.
- Produces: `renderScatter(series: readonly LineSeries[], options?: PlotOptions): RenderNode` — like `renderLineChart` but `canvas.set(px, py, color)` per point (no connecting lines).

**Tests:**
- a single point at `yBounds` max lands in the top cell row (first `toStyledLines()` line non-empty).
- a point at `yBounds` min lands in the bottom row.

- [ ] RED → fail → implement → pass → export → commit `feat(tui-charts): renderScatter`.

---

## Task 9: tui-react chart components

**Files:** create `packages/tui-react/src/charts.tsx`, `packages/tui-react/tests/charts.test.tsx`; modify `packages/tui-react/src/index.ts` and `packages/tui-react/package.json` (add `"@uniview/tui-charts": "workspace:*"`).

**Interfaces:**
- Consumes: `useMemo` (react); `renderNodeToElement` (from `./content` — already exported); the builders from `@uniview/tui-charts`.
- Produces memoized components, each `(props) => ReactElement`:
  - `BarChart({ data, options })`, `Histogram({ values, options })`, `Sparkline({ values, options })`, `Gauge({ fraction, options })`, `LineChart({ series, options })`, `Scatter({ series, options })`.

**Pattern (one shown; the rest are identical shape with their builder):**

```tsx
// packages/tui-react/src/charts.tsx
import { useMemo, type ReactElement } from "react";
import { renderBarChart, type BarDatum, type BarChartOptions /* …others… */ } from "@uniview/tui-charts";
import { renderNodeToElement } from "./content";

export interface BarChartProps { data: readonly BarDatum[]; options?: BarChartOptions }
export function BarChart({ data, options }: BarChartProps): ReactElement {
  return useMemo(() => renderNodeToElement(renderBarChart(data, options)), [data, options]);
}
// Histogram / Sparkline / Gauge / LineChart / Scatter follow the same shape.
```

**Tests:** mount each component against `MemoryCellSurface`; assert the expected glyphs/labels appear on screen (reuse the builder test expectations, e.g. `<Sparkline values={[0,4,8]} options={{max:8}}/>` → screen contains `▄█`).

- [ ] Add dep → RED tests → fail → implement all six → pass → export from index → `pnpm --filter @uniview/tui-react build` → commit `feat(tui-react): chart components`.

---

## Task 10: oha-style charts demo

**Files:** create `examples/tui-charts-demo/{package.json,tsconfig.json,src/app.tsx,src/main.tsx,tests/app.test.tsx,README.md}`.

**Interfaces:** mirror `examples/tui-lazygit-demo` boot shape (Phase 1 Task 8): `App({ state, host })`, `createState()`, a timer-driven `tick(state)` that updates the data, exported so the test can drive it headlessly. Deps: `@uniview/tui-core`, `@uniview/tui-react`, `react`.

**Layout (reproduce `.planning/specs/2026-07-14-reference-uis.md` §screenshot-2):**
- A `Panel "Progress"` with a `<Gauge fraction={elapsed/total} label={`${elapsed}s / ${total}s`}/>`.
- Two side-by-side `Panel`s: `"Stats for last sec"` (a `<Box>`/`<Text>` block: Requests/Slowest/Fastest/Average) and `"Status code distribution"`.
- Two side-by-side `Panel`s at the bottom: `"Requests / past sec"` → `<BarChart>` (green), `"Response time histogram"` → `<Histogram>` (tan `warning` color).

**Tests (headless against `MemoryCellSurface`):**
- initial render contains the panel titles `Progress`, `Stats for last sec`, `Requests / past sec`, `Response time histogram`.
- after several `tick()`s the bar chart region changes (data updated) — `screen(before) !== screen(after)`.
- the gauge shows a filled portion (`█` present in the Progress panel row).

- [ ] Scaffold files → RED integration test → fail → implement `app.tsx`/`main.tsx` (match `tui-opencode-demo/src/main.tsx` for the real-terminal boot + a `setInterval` calling `tick` then `host.rerender`) → pass → verify `pnpm --filter @uniview/tui-charts-demo dev` in a real terminal → README → commit `feat(examples): oha-style charts dashboard demo`.

---

## Self-Review (completed at authoring time)

- **Spec coverage (Phase 2):** block-glyph + braille rasterizers (Tasks 1–2), tui-charts package (3), Bar (4), Histogram = binning over Bar (5), Sparkline + Gauge (6), Line (7), Scatter (8), React components (9), oha-style demo (10). Every Phase-2 deliverable maps to a task. Axes/labels for line/scatter are minimal in v1 (bounds + plot area); richer axis ticks are a noted follow-up inside Task 7's `axis.ts` and can be expanded without interface changes.
- **Placeholder scan:** primitives (Tasks 1–2) are complete code. Builder tasks (4–10) state exact interfaces, the core algorithm, and concrete test cases — intentionally medium-grained per the approved scope, not placeholders (no TBD/TODO; every signature and default is given).
- **Type consistency:** `Color`/`RenderNode`/`StyledLine` from `@uniview/tui-core`; `BarDatum`/`BarChartOptions` defined in Task 4 and reused in Tasks 5/9; `LineSeries`/`PlotOptions`/`dataToPixel` defined in Task 7 and reused in Task 8; `renderNodeToElement` consumed from the existing `./content` export.
- **Dependency direction:** `tui-charts` depends only on `tui-core` (no React). `tui-react` depends on `tui-charts` (added in Task 9), consistent with how it already depends on `tui-content`.
```
