# TUI Example Projects — Research & Gap Analysis

**Date:** 2026-07-16
**Branch:** `tui`
**Purpose:** Assess four reference TUIs as candidate uniview example apps, map each onto uniview's
current TUI stack (`@uniview/tui-core` + `@uniview/tui-react`/`@uniview/tui-solid` + `@uniview/host-tui`
+ `@uniview/tui-charts` + `@uniview/tui-content`), and derive a prioritized list of framework
capabilities we still lack. Reference repos cloned into `~/Dev/others/` (`scope-tui`, `csvlens`,
`openapi-tui`); image rendering researched via DeepWiki against `sxyazi/yazi` + `hpjansson/chafa`.

**Bottom line:** all four are good examples. Three (scope-tui, openapi-tui browse-only, half-block
image viewer) need **zero renderer changes** and land as pure plugin code. csvlens is the one that
would **pull the framework forward** — its four `<Table>` gaps (horizontal column scroll, column
freezing, cell selection, in-cell wrapping) are the most valuable framework work surfaced here.

---

## Recommended build order

| # | Example | Effort (min compelling) | Renderer changes? | Status | Why this order |
|---|---|---|---|---|---|
| 1 | **Image viewer** (half-block) | S–M | None | ✅ `examples/tui/image-demo` | Highest wow-per-line; proves the fg+bg cell model renders real rasters; universal (any truecolor term). |
| 2 | **scope-tui** (synthetic/file-fed) | S–M | None | ✅ `examples/tui/scope-demo` | Showcases the Canvas braille grid + `useAnimation` per-frame loop + React↔Solid parity; visually striking. |
| 3 | **openapi-tui** (browse-only) | S–M | None | ✅ `examples/tui/openapi-demo` | Exercises `<Panel>` + `FocusManager` + `tui-content` highlighting + `<Tree>`/`<Table>` in a realistic multi-pane app. |
| 4 | **csvlens** (viewer subset) | M | Phase-1 none | ✅ `examples/tui/csv-demo` | Reuses `<Table>` nearly as-is for phase 1; phase 2 lands 4 real Table capabilities every app benefits from. |

**All four phase-1 examples built** (2026-07-16, branch `tui`), each with a pure unit-tested core, a
headless-verified render, and **zero renderer changes**. Remaining follow-on work is the deeper
framework/bridge track, not new example scaffolding: csvlens phase-2 (the four `<Table>` gaps —
horizontal scroll, freezing, cell selection, in-cell wrap), and the "full parity" bridge-plugin I/O
variants below.

Each "full parity" version (live audio / live HTTP / large-file bridge) doubles as the canonical demo
of the **Node/Bun bridge plugin** doing real I/O — the sandboxed-Worker path can't open audio devices,
disk files, or arbitrary sockets, so these are exactly what the bridge runtime exists for.

---

## 1. scope-tui — audio oscilloscope / vectorscope / spectroscope

**What it is:** Rust/ratatui+cpal terminal audio scope (~1600 LOC). Three `<TAB>`-cycled full-screen
modes — Oscilloscope (waveform vs. time, edge-trigger + peaks), Vectorscope (L-vs-R Lissajous), and
Spectroscope (FFT magnitude, log-frequency axis, Hann window + averaging).

**Key implementation** (`~/Dev/others/scope-tui/src/`):
- Everything is a ratatui `Chart` fed `Dataset`s of `(f64,f64)` points, drawn with a **Braille**
  `Marker` (2×4 dots/cell). `display/mod.rs` defines a `DisplayMode` trait (`process`/`axis`/
  `references`/`handle`), one file per mode. FFT via **`rustfft`**.
- Audio: a `DataSource` trait (`recv() -> Option<Matrix<f64>>`); backends cpal / raw-file-pipe /
  PulseAudio; `stream_to_matrix()` de-interleaves `LRLR…`. Blocking `recv()` paces the frame loop.

**uniview mapping — near 1:1, and the drawing half needs nothing new:**
- `<Canvas>` (React `canvas.ts` / Solid `canvas.tsx`) is the direct analog of Chart-with-braille:
  `marker="braille"` (default), `xBounds`/`yBounds`, and a `draw(cv)` callback whose `DrawContext`
  (`tui-core/src/canvas/draw.ts`) gives `project(x,y)` (= ratatui axis bounds), `line`, `points`,
  `set`, `circle`, `rect`. Braille density matches ratatui exactly → equivalent waveform fidelity.
- Frame loop → `useAnimation()` `{frame,time,delta}` over the host `FrameClock`. Header bar → flex
  `box` of `text`/`richtext`. Controls → InputRouter keyboard.

**Missing capabilities (data, not rendering):**
- **No audio source** — Worker plugins can't open an OS audio device (no `AudioContext`/DOM). Needs
  a Node/Bun bridge plugin with a native binding (`naudiodon`/PortAudio) *or* synthetic/file-fed PCM.
- **No FFT** — need a JS FFT (`fft.js`) or a hand-rolled radix-2 (small). Hann window + ring-buffer
  averaging are trivial array math.
- **Not missing:** braille sub-cell density, per-frame streaming redraw, coordinate projection.

**Verdict:** Strong example. Reduced scope (synthetic/WAV/pipe data + small JS FFT) = **S–M**, pure
Worker plugin, no sandbox issues. Full live-audio parity = **M–L** (bridge plugin owning the device
is the only new infra + the main cross-platform risk — even the original needs BlackHole on macOS).

---

## 2. csvlens — `less` for CSV

**What it is:** Rust/ratatui CSV pager (~9.7k LOC). Virtualized grid over arbitrarily large files
(streamed + background-indexed), auto column sizing + width overrides, **column freezing** + horizontal
scroll, row/column/**cell** selection modes, **regex** find + row/column filter, sort (incl. natural),
char/word wrapping, status bar, vim keys, clipboard.

**Key implementation** (`~/Dev/others/csvlens/src/`):
- **Large-file indexing** (`csv.rs`): a background thread builds a **sparse position table** (one byte
  offset ~every `filesize/10000` bytes); `get_rows` seeks the nearest indexed offset then scans
  forward → random row access is O(index-gap), not O(file). Streaming via `csv_core` for stdin/growing
  files.
- **Table render** (`ui.rs` `CsvTable`): measure widths → clip to a max fraction → redistribute;
  `render_row` consults `ColumnsOffset` (`view.rs`) for `num_freeze` (sticky-left) + `num_skip`
  (horizontal scroll), drawing a freeze separator between them.
- **Search/filter** (`find.rs`, `columns_filter.rs`): background-thread `regex::Regex` scan → highlight
  + jump. **Sort** (`sort.rs`) background thread + `natural_cmp`. **Wrap** (`wrap.rs`).

**uniview mapping — `<Table>` already covers a large slice:**
- Vertical virtualization (`computeVirtualWindow`), column layout (`resolveColumnWidths`,
  flexGrow/fixed/min, alignment, `formatCell`/truncate), controlled **sort** (`cycleSort`/`orderRows`
  + clickable header), `SelectionMachine` roving cursor + full-row highlight, new `autoFocus`.
  `<TextInput>` for the `/`,`&`,`*` prompts; `<Scrollbar>` for position.
- App-code (no framework change): CSV parse + sparse-index/seek (Node/Bun bridge reads disk;
  Worker receives bytes), regex find/filter, natural sort, width overrides, row marking, status bar.

**Missing capabilities — the four genuine `<Table>` framework gaps:**
1. **Column freezing / sticky-left columns** — no `num_freeze` or freeze separator.
2. **Horizontal column scrolling** — no `num_skip`/column-axis offset (only vertical virtualization).
3. **Cell-level selection** — `SelectionMachine` is 1-D; Table highlights a full row; no row/col/cell
   mode toggle or 2-D cursor.
4. **In-cell text wrapping / variable row heights** — `formatCell` clips to one line; virtual window
   assumes uniform height.
   *(Plus: per-cell regex match highlighting needs `richtext` spans wired into the cell renderer.)*

**Verdict:** Strategically the best example — **M** for a compelling subset (bridge-plugin viewer:
sparse-index load + virtualized Table + regex find/highlight + row/column filter + sort), **L** for full
parity. Phase 2 (the four gaps, in order: horizontal scroll → freezing → cell selection → wrapping)
lands as real `<Table>` capabilities that benefit **every** uniview app. This is the ideal example
shape: it pulls the framework forward instead of living entirely in app code.

---

## 3. openapi-tui — OpenAPI browser + REST client

**What it is:** Rust/ratatui browser **and REST client** for OpenAPI v3.0/3.1 (v0.10.2). Browse all
paths/webhooks, tag + path filter, fullscreen panes; inspect request/response schemas as highlighted
YAML or an annotated type view with nested `$ref` drill-down + `anyOf`/`oneOf` variant switching; and
it **executes HTTP requests** (editable params/body, `reqwest`, status/timing, **jq** filtering, copy
as curl/httpie, auth from `securitySchemes`, history).

**Key implementation** (`~/Dev/others/openapi-tui/src/`):
- **App → Page → Pane** (`app.rs` holds a page stack + popup slot; Elm-style `Action` loop). Layout is
  hand-computed ratatui splits; **focus is a single `focused_pane_index`** cycled by `h`/`l`, focused
  pane draws a thick green border + grows (`Fill(3)`) — the lazygit accordion model.
- Lists = ratatui `List`+`ListState` with `.filter()` in `draw`. **Schema viewer** (`schema_viewer.rs`,
  ~2000 LOC — the heart): recursive `resolve_walk` → `RenderBlock`s, `$ref` resolution, Yaml (syntect)
  vs Annotated modes, `go()`/`back()` history + breadcrumb, variant selection map.
- REST client (`phone.rs`, `response_viewer.rs`): fold pane `RequestBuilder`s over `reqwest`, highlight
  + **`jaq`** (embedded jq) + search the response.

**uniview mapping — almost 1:1:**

| openapi-tui | uniview |
|---|---|
| Pane + thick focused border | `<Panel>` (`focusedColor`) |
| `focused_pane_index` + FocusNext/Prev | `FocusManager` + `useFocusList`/`nextFocus`; `autoFocus` |
| APIs/Tags lists | `<List>` / virtualized `<Table>` |
| `$ref` schema drill-down | `<Tree>`/`<DirectoryTree>` + breadcrumb |
| syntect YAML/JSON highlight | `tui-content` `renderCode`/`highlightToLines` + `SyntaxTheme` |
| footer filter / command input | `<TextInput>` + `<StatusBar>` |
| response scroll | `<Scrollbar>` / ScrollView |
| page stack | plugin component state |

**Missing capabilities:**
- **JSON-Schema tree widget** — generic `<Tree>` exists but nothing renders a JSON-Schema as a
  collapsible typed tree with inline `$ref` expansion (app code, but a reusable helper would be nice).
- **Multi-pane focus ergonomics** — `FocusManager` does Tab cycling, but directional `h/j/k/l` focus
  and grow-on-focus accordion layout are hand-wired (ergonomics gap, not a blocker).
- **Scroll-in-pane** — confirm keyboard `scroll_offset` inside a bordered `<Panel>` for long bodies
  (likely the roughest edge).
- **HTTP request/response helper** — none built in; bridge plugin or Worker `fetch()` does it, but
  no `RequestBuilder` fold / curl export / embedded jq (all app code).

**Verdict:** Strongly recommended. **S/M** for browse-only (bundle petstore.json, multi-pane focus,
tag/path filter, highlighted request/response schemas — hits every existing primitive, no live
requests). **L** for full parity (request page + execute via bridge + jq/search/auth/history). Build
browse-only as the flagship; live requests as the canonical bridge-plugin I/O demo.

---

## 4. Image viewer — how to display rasters in a terminal (yazi/chafa research)

**How yazi does it (DeepWiki):** picks an image **protocol at init** from the detected terminal, then
downscales the decoded image to a cell-measured rect and hands it to a driver:
- Drivers: **Kitty graphics**, **iTerm2 (OSC 1337)**, **Sixel**, **Überzug++** (external X11/Wayland
  overlay window), and **Chafa** as the protocol-free fallback (Unicode block/ASCII art).
- Selection (`Adapter::matches` after `Emulator::detect`): emulator identity first; tmux/Zellij
  restrict which protocols pass through; else session-type routes to Überzug; **falls back to Chafa**.
- Resize (`Image::downscale`): decode + EXIF orient, compute target pixels from cell size +
  `max_width/height`, resize (Nearest…Lanczos3); `pixel_area` maps pixel dims → cell `Rect` via
  `cell_size()`.
- **Chafa's fallback technique**: per character cell, build a 64-bit bitmap, match candidate Unicode
  symbols (HALF/QUAD/SEXTANT/BRAILLE), extract mean fg+bg colors, pick min-error symbol+colors.

**Protocol landscape:**

| Protocol | Mechanism | Support | Fidelity |
|---|---|---|---|
| Kitty graphics | base64 RGBA in `ESC_G…`, Unicode placeholders | Kitty, Ghostty, Konsole, WezTerm(partial) | Full pixel |
| iTerm2 (OSC 1337) | base64 image in `ESC ]1337;File=…` | iTerm2, WezTerm, Warp, VSCode, Tabby | Full pixel |
| Sixel | palette-quantized bitmap `ESC Pq…` | foot, Windows Terminal, xterm+sixel, mlterm | Full pixel, limited palette |
| Überzug++ | external overlay window | X11/Wayland + `ueberzugpp` | Full pixel, out-of-band |
| **Unicode half-block ▀** | `▀` fg=top px, bg=bottom px → 2 px/cell, SGR only | **any truecolor terminal** | Low-res, universal |
| Quadrant/sextant/braille | 2×2/2×3/2×4 subcell; single fg/cell | any Unicode+truecolor | Denser spatially, 1 color/cell |

Half-block with **fg+bg** = 2 full-color pixels/cell; quadrant/braille give more spatial subdivisions
but only one fg color/cell, so half-block usually looks better for photos.

**Path A — half-block (fits the current cell model, realistic first example):**
Pipeline: decode → downsample to `cols × (rows×2)` → emit `▀` with `fg`=upper px, `bg`=lower px →
StyledLines → RenderNode. **No core changes.** Already present: fg **and** bg per cell
(`style/style-table.ts`), truecolor `38;2`+`48;2` SGR (`ansi/encode.ts`), `canvas/draw.ts`
grid→`StyledLine[]`→RenderNode, run-merging. Must add (all TS): an **image-oriented half-block grid**
(the existing `HalfBlockGrid` stores only one fg/cell — needs `fg=top,bg=bottom` per cell), an **image
decoder** (bridge: `sharp`/`jimp`; Worker: `OffscreenCanvas`+`getImageData`), and a **downsampler**
(box filter, ~1:2 cell aspect). Effort **S–M**.

**Path B — true graphics (Kitty/Sixel/iTerm2), needs a new core primitive:**
uniview only emits SGR grapheme cells; the diff engine assumes one grapheme+style/cell
(`buffer/cell-buffer.ts`, `diff/frame-diff.ts`) with no escape passthrough. A "graphics cell / opaque
region" primitive would need: a node/cell kind carrying a raw escape payload + cell footprint; layout
reserving space; diff/encoder emitting it verbatim, leaving it untouched when unchanged, re-emitting on
scroll/resize/occlusion (Kitty image-id lifecycle, Sixel repaint, overlay repositioning); and
per-terminal capability detection with fallback to Path A. This **breaks the one-grapheme-per-cell
invariant** and adds per-platform cost — exactly what the PRIME DIRECTIVE warns against baking into the
small rewritable core. Effort **L**, touches the core.

**Verdict:** Build **Path A** first — it's yazi/chafa's universal fallback, works on any truecolor
terminal, needs only TS plugin code (decode → downsample → `▀` cells), and honors the PRIME DIRECTIVE.
Demo: load a PNG/JPG → colored half-blocks in a flex panel → resize-to-fit on terminal resize → a
quadrant/braille toggle to contrast density vs color → caption. Defer Path B as a later core-level
design note.

---

## Consolidated gap analysis — capabilities uniview still lacks

Grouped by whether it's a **framework/renderer gap** (needs core/component work) or **reusable app
helper** (nice-to-have library code). Cross-referenced with `docs/content/docs/tui/comparison.mdx`.

### Framework / renderer gaps (ranked by impact × cheapness)

1. **`<Table>` — horizontal column scroll + column freezing** *(csvlens #2, #1)* — most-felt on wide
   data; the Table has no column-axis offset or sticky columns today. **M.** Highest-value framework
   work surfaced here.
2. **`<Table>` — cell-level selection (2-D cursor, row/col/cell modes)** *(csvlens #3)* —
   `SelectionMachine` is 1-D. **M.**
3. **`<Table>` — in-cell wrapping + variable row heights** *(csvlens #4)* — `formatCell` clips to one
   line; virtual window assumes uniform height. **M–L** (windowing must handle variable heights).
4. **Per-cell substring/regex highlight in `<Table>`** *(csvlens)* — wire `richtext` spans into the
   cell renderer. **S–M.**
5. **Half-block image grid (fg=top,bg=bottom per cell)** *(image viewer Path A)* — small canvas
   addition, unlocks the whole image example. **S.**
6. **Editable multi-line `<Textarea>`** — genuinely missing (comparison.mdx confirms ❌; opentui &
   Textual both have it). Selection/undo/wrap editor. **L.** Not required by any of the 4 examples but
   the biggest standalone widget gap.
7. **Directional/spatial focus + grow-on-focus layout** *(openapi-tui)* — `FocusManager` only does
   linear Tab cycling. Ergonomics. **M.**
8. **Keyboard `scroll_offset` inside a bordered `<Panel>`** *(openapi-tui)* — verify/close the
   scroll-in-pane edge. **S.**
9. **True-graphics image primitive (Kitty/Sixel/iTerm2)** *(image viewer Path B)* — opaque
   escape-passthrough region + capability detection; breaks one-grapheme-per-cell. **L**, core-level,
   defer.

### Reusable app helpers (library code, no core change)

- JS **FFT** + Hann window + de-interleave/ring-buffer *(scope-tui)*.
- **CSV sparse-index + seek** loader (bridge plugin) *(csvlens)*.
- **JSON-Schema → collapsible typed tree** helper with `$ref` expansion *(openapi-tui)*.
- **HTTP request/response** helper + curl/httpie export + embedded jq *(openapi-tui)*.
- **Image decode + box-downsample** pipeline (bridge `sharp` / Worker `OffscreenCanvas`) *(image)*.
- **Node/Bun bridge audio source** (native binding) *(scope-tui, full parity)*.

### Other open gaps from comparison.mdx (not driven by these 4 examples)

- CSS-like stylesheet system (TCSS analog) — **L**, lowest priority vs ink/opentui (neither has it).
- Kitty keyboard protocol (disambiguated keys), screen-reader detection, session recording/replay,
  a built-in snapshot-test harness — all present in ≥1 competitor, none blocking.

---

## Doc drift to fix (found during this research)

`docs/content/docs/tui/comparison.mdx` is **stale for Phase 2 primitives**: rows for `<Static>`,
`<Spacer>`, `<Newline>`, `<Transform>`, and `<Masked>` show ❌/⚠️, but all five are implemented and
exported from `@uniview/tui-react` (`static.ts`, `layout-primitives.ts`, `compat.ts`, `masked.ts`) and
the Solid mirror. These rows should flip to ✅. (Verified 2026-07-16.) Everything else in the doc
matches the code.
