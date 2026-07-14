# TUI Layout, Widgets & Charts — Design Spec

**Date:** 2026-07-14
**Branch:** `feat/tui`
**Status:** Approved shape; Phase 1 + 2 to be spec'd into an implementation plan next.
**Builds on:** the `tui-core` / `tui-content` / `tui-react` / `host-tui` stack (see `.planning/plans/tui-content-rendering.md`).

## 1. Goal

Grow the Uniview TUI from "renders Markdown / code / diff like opencode" into a general
terminal-UI toolkit that can reproduce three reference classes of app:

1. **lazygit** — multi-panel bordered layout, titled/footered focusable panels,
   scrollable selectable lists, a keybinding status bar. **(Top priority.)**
2. **oha / ratatui dashboards** — bar charts, histograms, sparklines, line & scatter
   plots, gauges, colored regions, updating live. **(Next priority.)**
3. **ratatui canvas (crossword, shapes)** — a grid of colored cells with content, and
   basic 2-D shape drawing. **(Lower priority; bitmap-image rendering out of scope.)**

Alongside these, four capability asks the user raised:
**text selection**, a **Solid** binding, **Yoga** as a layout option, and **more
components / layout** generally.

### Non-goals

- Bitmap / pixel image protocols (sixel, kitty, iterm2 inline images). Explicitly future.
- GPU / native acceleration. The pure-TypeScript, no-native, runs-in-Worker/Deno/Bun
  property is a deliberate advantage and is preserved.
- 3-D, sprites, ASCII-font art (opentui-only features). Not planned.

## 2. Context & references

Current engine already present and TDD-covered:

- `tui-core`: custom flexbox `computeLayout` (row/column, grow, justify, align, gap,
  padding, border, min/max, **absolute positioning**), `CellBuffer` (struct-of-arrays,
  wide-char safe, per-cell grapheme + style + **owner id**), frame diff, `OwnerTable`,
  **geometric hit-testing** (`stampOwner`), `border.ts`, `focus/focus-manager.ts`,
  `focus/hit-test.ts`, component state machines (`tabs`, `text-input`, `checkbox`,
  `pressable`), sub-cell-free `richtext` spans pipeline, `SyntaxTheme`.
- `tui-content`: `renderCode` / `renderMarkdown` / `renderDiff` / streaming — all pure
  functions producing `RenderNode` trees from `StyledLine[]`.
- `tui-react`: `<Box>/<Text>/<RichText>`, `ScrollView`, `CommandPalette`, `Hoverable`,
  `Markdown/Code/Diff`, `select`, `virtual-list`.
- `host-tui`: framework-agnostic host, `convert.ts` (UINode↔RenderNode), `input-router`
  (mouse click/hover/wheel/drag), `semantics`, `automation`.

Reference implementations studied:

- **lazygit** (`/Users/hk/Dev/others/lazygit`) — its window layout is
  `lazycore/pkg/boxlayout`: a box tree where each child has **either** a static `Size`
  **or** a `Weight`; static children reserve space first, the rest is split by weight.
  This is *simpler than* flexbox and maps directly onto our `flexGrow` (= weight) +
  fixed `width/height` (= size). **Conclusion: lazygit-class layouts already work on the
  current engine.**
- **ratatui** (via deepwiki) — `BarChart`, `Chart` (line/scatter over an internal
  `Canvas`), `Sparkline`, `Canvas`. High resolution comes from **markers**: `Braille`
  (2×4 dots/cell), `HalfBlock`, `Quadrant` (2×2), `Sextant` (2×3), `Octant`. Canvas uses
  a **bottom-left origin, f64** coordinate system and draws `Line`/`Rectangle`/`Circle`/
  `Points`/`Map` shapes.
- **opencode** (`sst/opencode`, `references/opentui`) — selection is **select-to-copy**:
  on mouse-up after a drag, `Selection.copy` fires; a feature flag flips it to
  right-click-to-copy. A focused renderable may expose `getClipboardText()` to control
  its own copy format; otherwise `getSelectedText()` is used. Clipboard is **OSC 52**
  first, then platform fallbacks (osascript / wl-copy / xclip / PowerShell).

## 3. Architectural decisions

### 3.1 Pluggable layout engine, custom default (decided)

Extract a `LayoutEngine` interface. Ship the existing custom engine as the default so
Worker/Deno/Bun stay dependency-free and pure-TS. Yoga becomes an **opt-in adapter
package** (Phase 6) for anyone who wants full CSS-flexbox correctness (flex-wrap,
flex-shrink, flex-basis, margin, aspect-ratio). This satisfies the Yoga ask without
paying its WASM/async-init cost by default.

```ts
export interface LayoutEngine {
  computeLayout(root: LayoutInput, container: Size): LayoutResult;
}
export const customLayoutEngine: LayoutEngine = { computeLayout };
```

`renderToBuffer`, the renderer, and the scheduler accept an optional `engine`
(defaulting to `customLayoutEngine`). No behavior change when unset.

### 3.2 Charts & crossword ride the existing `richtext` spans pipeline (key de-risk)

ratatui's plots are **characters with fg/bg colors**: block levels (`▁▂▃▄▅▆▇█`,
`▏▎▍▌▋▊▉`), braille dots (U+2800…U+28FF), quadrant blocks. Our `richtext` `StyledSpan`
already carries fg **and** bg per run all the way to cells, cross-framework, and the
transparent-bg compositing rule makes colored backgrounds work.

Therefore a "canvas" is a **pure function** `data → StyledLine[]`, consumed by the
existing `styledLinesToRenderNode`. **No new `RenderNode` type, no host/protocol change.**
Crossword cells are `Box(background) + centered Text`, both existing primitives.

Consequences:
- Charts/crossword are **pure, headlessly testable** builders (like `tui-content`).
- They work in React **and** Solid with zero per-framework rendering code.
- The only genuinely new low-level piece is a **sub-cell rasterizer** (data coords →
  braille/block glyphs + colors → `StyledLine[]`), which lives in `tui-core`.

### 3.3 Selection: app-level, structured, configurable (decided)

A `tui-core` selection model tracks a drag range over the `CellBuffer`. Copy text is
extracted either **raw** (read graphemes in the selected cell rectangle — the buffer
already stores them) or **structured** (map selected cells → owning node via the owner
grid → the node's `getClipboardText()`), mirroring opencode. Behavior is a **host
option**: `mode: "copy-on-select" | "explicit" | "off"`, plus an optional custom
`getClipboardText`. Clipboard writes go through OSC 52 (with platform fallbacks) in the
terminal driver. App-level selection also sidesteps the "mouse-motion mode disables the
terminal's native drag-select" problem.

### 3.4 Framework-agnostic core, thin bindings

All new rendering logic (panel chrome, rasterizer, chart builders, selection model) lives
in `tui-core` / new pure packages. `tui-react` and `tui-solid` are **thin** component
wrappers. `host-tui` stays framework-agnostic. This is what makes the Solid phase a
mechanical mirror rather than a rewrite.

## 4. Phases

Ordering (approved): **1 → 2 → 3 → 4 → 5 → 6**. The design doc covers all six; the first
implementation plan covers **Phase 1 in full + Phase 2 in medium detail**; Phases 3–6 are
roadmap and each gets its own spec/plan when reached.

---

### Phase 1 — lazygit-style layout & core components  ★ top priority

**Purpose:** reproduce the lazygit layout class — bordered, titled, focusable panels in a
weighted multi-column/row arrangement, with scrollable selectable lists and a status bar.

**Building blocks that already exist:** weighted layout (`flexGrow`), borders, focus
manager, hit-testing, `select` / `virtual-list`, `ScrollView`. Phase 1 is largely
**composition + panel chrome + a polished demo**, not new engine work.

**New / extended pieces:**

1. **`LayoutEngine` interface** (§3.1) — small extraction; unblocks Phase 6. No behavior
   change.
2. **Titled/footered borders** — extend `RenderNode` + `drawBorder` with optional
   `title` / `titleAlign` and `footer` / `footerAlign` (+ styles), painted **into** the
   top/bottom border edges (lazygit: `╭─[1]─Status─────╮`, bottom-right `1 of 8`). Text
   overwrites border glyphs, clipped to the edge. **Paint-level** (not absolute-overlay
   composition — absolute children are inset to the inner area and cannot reach the
   border row). Tested at the paint layer. The props are threaded UINode → `convert.ts`
   → `RenderNode`: an **additive** protocol change (new optional box props, same
   `PROTOCOL_VERSION`).
3. **`Panel`** (tui-react component) — a bordered `Box` composing title + footer + a
   `focused` prop that recolors the border (lazygit green when focused). Content is
   `children`.
4. **`List` / `SelectableList`** — built on `select` + geometric hit-testing (full-row
   click already works): selection highlight across the whole row, keyboard
   up/down/home/end/pgup/pgdn, "N of M" counter wired to the panel footer, and
   scroll-to-keep-selection-visible. Mouse click selects a row; wheel scrolls.
5. **`StatusBar`** — a docked row of `key: action` pairs with themed styling
   (lazygit's bottom bar).
6. **Panel focus system** — a `useFocus`-style binding in tui-react over the existing
   `focus-manager`: Tab cycles panels, number keys jump (lazygit `1`–`5`), the focused
   panel gets `focused`. Mouse click on a panel focuses it.
7. **Demo: `examples/tui-lazygit-demo`** — reproduces the screenshot: left column
   (Status / Files / Branches / Commits / Stash) + right column (Log / Command log) +
   status bar; focus switching, scrollable+selectable lists, syntax-highlighted commit
   diff in the log pane (reusing `tui-content`).

**Testing:** paint-level tests for titled borders (title/footer land on the border row,
clip correctly, focus recolors). Component tests against `MemoryCellSurface` for
List selection/scroll/counter and StatusBar. A headless integration test for the demo
(focus switch changes the active border; arrow keys move selection; "N of M" updates).

**Success criteria:** the lazygit demo visually matches the reference layout; panels
focus-switch by key and click; lists scroll and select with keyboard and mouse; all
suites green.

---

### Phase 2 — charts  ★ next priority

**Purpose:** bar, histogram, sparkline, line, scatter — the oha/ratatui dashboard class.

**New pieces:**

1. **Sub-cell rasterizer** in `tui-core` (`src/canvas/`):
   - `SubcellCanvas` — constructed with logical pixel dimensions + a **marker** mode
     (`braille` 2×4, `quadrant` 2×2, `half-block`, plus `block-levels` for bars).
     Methods: `set(px, py, color)`, `line(a, b, color)`, `rect(...)`, `clear()`, and
     `toStyledLines(): StyledLine[]`.
   - Braille cell = up to 8 dots aggregated into a `U+2800`-based glyph, one fg color per
     cell (last-writer-wins per pixel; matches ratatui's default fidelity).
   - **Bottom-left origin, ratatui-compatible**, transformed to top-left cells on
     rasterize.
   - Block-level helpers: vertical `▁▂▃▄▅▆▇█` (8 levels) and horizontal `▏▎▍▌▋▊▉` for
     partial bars.
2. **`@uniview/tui-charts`** (new package; scaffold via `pnpm create tsdown`, then set
   `tsdown.config.ts` to `defineConfig({ exports: true })` per the known template fix).
   Pure builders returning `RenderNode`, theme-aware, like `tui-content`:
   - `renderBarChart(data, opts)` — vertical/horizontal, grouped/stacked, block glyphs.
   - `renderHistogram(values, opts)` — binning + bars.
   - `renderSparkline(values, opts)` — single-line block levels.
   - `renderLineChart(datasets, opts)` — braille canvas + axes/labels/legend.
   - `renderScatter(points, opts)` — dot/braille canvas + axes.
   - Shared axis / tick / label / legend / bounds helpers.
3. **tui-react components** — `<BarChart>`, `<Histogram>`, `<Sparkline>`, `<LineChart>`,
   `<Scatter>`: thin memoized wrappers over the builders (like `<Code>`).
4. **Demo: `examples/tui-charts-demo`** — oha-style: a progress gauge, stat panels, a
   live requests/sec bar chart, a response-time histogram, sparklines, colored regions,
   updating on a timer.

**Testing:** the rasterizer is pure and unit-tested (a known dot pattern → the expected
braille glyph; a line hits the expected cells; bounds/clip). Each chart builder is tested
headlessly (given data + size, assert glyphs/labels/axes in the resulting `StyledLine[]`
or via `MemoryCellSurface`). No terminal needed.

**Success criteria:** all five chart types render correctly headlessly and in a real
terminal; the charts demo updates live; charts are pure functions with no framework
coupling; suites green.

---

### Phase 3 — canvas / crossword  (roadmap)

- **Grid + shape helpers** built on the Phase 2 rasterizer: `Line`/`Rectangle`/`Circle`/
  `Points` drawing; a `Grid`/`CellGrid` widget of colored cells with centered content and
  per-cell focus/selection (crossword squares are `Box(bg) + Text`).
- **Demo: `examples/tui-crossword-demo`** — the reference crossword: a 5×5 grid of
  white/yellow/red cells with centered letters, a bordered "Congratulations!" panel,
  author text; keyboard cell navigation + mouse click.
- **Out of scope (noted):** bitmap/inline-image rendering (sixel/kitty/iterm2).

---

### Phase 4 — text selection & clipboard  (roadmap)

- **`SelectionController`** in `tui-core`: anchor→focus cell range from mouse
  down/drag/up; a selection style applied in paint to selected cells.
- **Extraction:** raw (graphemes in the cell rectangle) and structured (selected cells →
  owner grid → node `getClipboardText()`), per §3.3.
- **Host config:** `selection: { mode: "copy-on-select" | "explicit" | "off",
  getClipboardText? }`. Explicit mode copies on right-click / keybind.
- **Clipboard:** OSC 52 in the terminal driver, with osascript / wl-copy / xclip /
  PowerShell fallbacks. Additive; no protocol bump expected (host-side).
- **Consider pulling earlier** if copy-able hashes/paths are wanted in the lazygit demo
  (the user flagged this as the one reorder they'd weigh).

---

### Phase 5 — Solid binding  (roadmap)

- **`@uniview/tui-solid`** — a Solid reconciler/renderer producing the same UINode stream,
  reusing `host-tui` unchanged. Mirror `tui-react` primitives (`<Box>/<Text>/<RichText>`),
  content (`Markdown/Code/Diff`), interactive (`ScrollView`/`CommandPalette`), Phase 1
  components (`Panel`/`List`/`StatusBar`), and Phase 2 charts.
- Leverages the existing `solid-renderer` / `solid-runtime` groundwork. Because core logic
  is framework-agnostic, this is a thin mirror, not a rewrite.

---

### Phase 6 — Yoga adapter  (optional)

- **`@uniview/tui-layout-yoga`** — implements `LayoutEngine` via `yoga-layout` (or
  `yoga-wasm-web`). Map `TuiStyle` → Yoga node props; return `LayoutResult`.
- **Verify** Worker / Deno / Bun before recommending. Opt-in only; the custom engine
  remains the default.

## 5. Cross-cutting concerns

- **TDD throughout** (RED → GREEN → commit per milestone), per-package Vitest
  (`cd packages/<pkg> && pnpm vitest run`). New pure builders/rasterizer are unit-tested;
  components against `MemoryCellSurface`; demos have headless integration tests.
- **New packages:** `tui-charts`, `tui-solid`, `tui-layout-yoga` — scaffold with
  `pnpm create tsdown`, then replace the template's `dts: { tsgo: true }` with
  `defineConfig({ exports: true })` (known fix).
- **No *breaking* protocol changes.** Charts & crossword (Phases 2–3) need **no**
  protocol change — they ride `richtext`/`box`/`text`. Titled borders (Phase 1) add
  optional `title`/`footer` box props threaded through `convert.ts` — **additive**, same
  `PROTOCOL_VERSION` (per the protocol's additive-change rule). Selection (Phase 4) is
  host-side; a bump is only needed if selection must cross the plugin RPC boundary, which
  is not currently required.
- **Rebuild-dist reminder:** downstream packages import `tui-core`/`host-tui` from
  `dist`; after editing a lib's `src`, run `pnpm --filter <pkg> build` before demos/tests
  pick it up.
- **Duplicate workspace name (pre-existing):** `examples/bun-react` and
  `examples/bun-shadcn` both declare package name `bun-react-template`, which breaks
  repo-wide `turbo` / `pnpm -r`. Verify per-package until one is renamed (out of scope,
  needs user decision).

## 6. Risks

- **Braille color fidelity** — one fg color per cell (mixed pixels → last-writer-wins).
  Acceptable; matches ratatui's default marker behavior.
- **Titled-border text** overlapping border glyphs — must clip to the edge and handle
  narrow panels; covered by paint-level tests.
- **Yoga portability** — WASM in Worker/Deno/Bun is unverified; deferred to Phase 6 where
  it's opt-in and can be validated in isolation.
- **Selection vs mouse-motion mode** — app-level selection avoids the native-selection
  conflict, but interaction with hover routing needs care (drag = selection, not hover).

## 7. Success criteria (overall)

The first implementation cycle (Phases 1 + 2) is done when:

1. A lazygit-style demo reproduces the reference layout with focus-switchable panels,
   scrollable+selectable lists, titled borders, and a status bar.
2. An oha-style charts demo renders live bar / histogram / sparkline / line / scatter.
3. All new logic is pure and framework-agnostic (works unchanged toward a future Solid
   binding), TDD-covered, with every package's suite green.
