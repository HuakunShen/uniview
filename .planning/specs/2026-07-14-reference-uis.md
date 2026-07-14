# Reference UIs — screenshots we're reproducing

**Date:** 2026-07-14
**Companion to:** [`2026-07-14-tui-layout-charts-design.md`](./2026-07-14-tui-layout-charts-design.md)
**Why this file exists:** the three target UIs were shared as screenshots. This captures
their layout/colors/widgets in text so the intent survives context compaction, and maps
each to the ratatui widget it uses and the Uniview phase that reproduces it.

## Local reference repos (all under `~/Dev/others/`)

| Repo | Path | What to read | Relevant phase | deepwiki |
|---|---|---|---|---|
| **lazygit** | `~/Dev/others/lazygit` | `vendor/.../lazycore/pkg/boxlayout/boxlayout.go` (weighted box layout), `pkg/gui/` | Phase 1 | `jesseduffield/lazygit` |
| **ratatui** | `~/Dev/others/ratatui` | `ratatui-widgets/examples/{barchart,sparkline,chart,canvas,gauge}.rs`, `examples/apps/{chart,canvas,gauge}` | Phases 1–3 | `ratatui/ratatui` |
| **oha** | `~/Dev/others/oha` | `src/monitor.rs` (the whole TUI), `src/histogram.rs` | Phase 2 | `hatoo/oha` |
| **crossword** | `~/Dev/others/crossword` | `crosstui/src/main.rs` (rendering), `crossword/src/puz.rs` (.puz parser) | Phase 3 | `matrixfrog/crossword` |
| **opentui** | `~/Dev/uniview/references/opentui` | `packages/core/src/renderables/*.selection*.test.ts`, selection buffer | Phase 4 | — |
| **opencode** | `~/Dev/uniview/references/opencode` (+ `~/Dev/others/opencode`) | `packages/opencode/src/cli/cmd/tui/util/clipboard.ts`, `Selection.copy` | Phase 4 | `sst/opencode` |
| **ink** | `~/Dev/uniview/references/ink` (+ `~/Dev/others/ink`) | Yoga usage, component API | Phase 6 | `vadimdemedes/ink` |
| **textual** | `~/Dev/uniview/references/textual` | widget/layout ideas | general | `textualize/textual` |

> The user prefers **deepwiki** for fast lookups (`mcp__deepwiki__ask_question` with the
> `repoName` above). Clone-on-disk is for reading exact source.

---

## Screenshot 1 — lazygit (v0.57.0)  → Phase 1 (top priority)

**What it is:** the lazygit git TUI, here open on the `uniview` repo, `feat/tui` branch.

### Layout

Two columns. **Left column** (~⅓ width) is a vertical stack of 5 bordered panels;
**right column** (~⅔ width) stacks 2 panels; a **status bar** spans the very bottom.

```
┌ left (weighted) ──────────┐ ┌ right (weighted, wider) ─────────────────┐
│ ╭─[1]─Status────────────╮ │ │ ╭─[0]─Log──────────────────────────────╮ │
│ │ uniview → feat/tui    │ │ │ │ * commit 9297a6f (HEAD -> feat/tui)  │ │
│ ╰───────────────────────╯ │ │ │   Author: Huakun Shen <…>            │ │
│ ╭─[2]─Files — Worktrees ╮ │ │ │   Date:   29 minutes ago             │ │
│ │  (empty)              │ │ │ │                                       │ │
│ │                0 of 0 │ │ │ │      fix(tui-core): geometric hit-…  │ │
│ ╰───────────────────────╯ │ │ │   … (indented commit body)           │ │
│ ╭─[3]─Local branches ───╮ │ │ ╰───────────────────────────────────────╯ │
│ │ * feat/tui  «selected»│ │ │ ╭─Command log──────────────────────────╮ │
│ │ 1w main ✓             │ │ │ │ You can hide/focus this panel …       │ │
│ │ …                     │ │ │ ╰───────────────────────────────────────╯ │
│ │                1 of 8 │ │ └───────────────────────────────────────────┘
│ ╰───────────────────────╯ │
│ ╭─[4]─Commits — Reflog ─╮ │
│ │ 9297a6fc HS o fix(…)  │ │
│ │ …             1 of 136│ │
│ ╰───────────────────────╯ │
│ ╭─[5]─Stash ────────────╮ │
│ │ 5M On main: WIP…      │ │
│ │                1 of 9 │ │
│ ╰───────────────────────╯ │
└───────────────────────────┘
 Checkout: <space> | New branch: n | Delete: d | Rebase: r | … | Keybindings: ?    Donate  Ask Question  0.57.0
```

### Key visual details (these define Phase 1 components)

- **Titled borders:** each panel's title is embedded in the **top border**, with a bracket
  number: `╭─[1]─Status──────╮`. lazygit uses rounded corners (`╭╮╰╯`).
- **Footer counter:** list panels show `N of M` right-aligned in the **bottom border**
  (`1 of 8`, `1 of 136`, `1 of 9`, `0 of 0`).
- **Focus:** the focused panel (`[3] Local branches` in the shot) has a **green** border +
  green title; unfocused panels are grey/white. Exactly one panel is focused.
- **Selected row:** the current list item has a **full-width blue background**
  (`* feat/tui`), not just the text highlighted — this is our geometric-hit-test full-row
  fill.
- **List content colors:** short commit hashes **yellow** (`9297a6fc`), author initials
  `HS` a distinct color, graph `o` glyph, `↑1`/`✓` markers, `(worktree)` annotations.
- **Status bar:** bottom row of `Label: key` pairs separated by ` | `, left-aligned;
  right side shows `Donate  Ask Question  0.57.0`.
- **Log panel:** renders `git log` — hash + `(HEAD -> feat/tui)` in green, `Author:`,
  `Date:`, blank line, indented commit subject/body. (We can feed this through
  `tui-content` for any diff/highlight.)

### ratatui/lazygit → Uniview mapping

| lazygit element | Uniview Phase 1 piece |
|---|---|
| bordered panel w/ `[n] Title` in top edge | **titled/footered border** (paint-level `title`/`footer`) + **`Panel`** component |
| `N of M` in bottom edge | `footer` prop, right-aligned |
| green-when-focused border | `Panel focused` prop + panel focus system |
| branch/commit lists, blue selected row | **`List` / `SelectableList`** (full-row highlight, keyboard + mouse) |
| bottom keybinding row | **`StatusBar`** |
| weighted column/row split | existing `flexGrow` (= lazygit `Weight`) |

---

## Screenshot 2 — oha (おはよう) load-tester  → Phase 2 (next priority)

**What it is:** oha's realtime load-test dashboard (ratatui). Source of truth:
`~/Dev/others/oha/src/monitor.rs`. Widgets it imports:
`BarChart, Block, Borders, Gauge, Paragraph` + `Layout`/`Constraint`.

### Layout (dark maroon background)

```
╭ Progress ─────────────────────────────────────────────────────────────╮
│ ████████████████░░░░░░░░░░░░░░░░              1s / 6s                    │   ← Gauge
╰─────────────────────────────────────────────────────────────────────────╯
╭ Stats for last sec ───────────────╮ ╭ Status code distribution ─────────╮
│ Requests : 248437                 │ │ [200] 487111 responses            │   ← Paragraph
│ Slowest: 0.0007 secs              │ │                                   │
│ Fastest: 0.0000 secs              │ │                                   │
│ Average: 0.0002 secs              │ │                                   │
│ Data: 3.08 MiB                    │ │                                   │
│ Number of open files: 63 / 1024   │ │                                   │
╰───────────────────────────────────╯ ╰───────────────────────────────────╯
╭ Error distribution ───────────────────────────────────────────────────╮  ← Block (empty)
╰─────────────────────────────────────────────────────────────────────────╯
╭ Requests / past sec (auto) ───────╮ ╭ Response time histogram ──────────╮
│ █    █                            │ │      █                            │
│ █    █                            │ │      █    █                       │   ← two BarCharts
│ █    █                            │ │      █    █    ▂                  │
│238005 249106                      │ │  1  133321 108025 6910  180       │
│ 0s   1s   2s   3s   4s            │ │0.0000 .0002 .0004 .0006 .0007     │
╰───────────────────────────────────╯ ╰───────────────────────────────────╯
```

### Key visual details

- **Progress:** ratatui `Gauge` — a filled bar (blue) + centered `1s / 6s` label.
- **Stat panels:** `Paragraph` inside a titled `Block`. Some lines are **color-coded**
  (Slowest/Fastest/Average in olive/green/blue).
- **Bar chart** (`Requests / past sec`): vertical **green** bars, value printed on/under
  each bar (`238005`, `249106`), x-axis time labels `0s 1s 2s 3s 4s`. It's a
  `BarChart::default()`.
- **Histogram** (`Response time histogram`): **the same `BarChart` widget** with binned
  data — **tan/brown** bars, per-bin counts `1 133321 108025 6910 180`, x-axis bucket
  bounds `0.0000 0.0002 0.0004 0.0006 0.0007`.
- **Layout math:** rows sized `Length(3)` (progress), `Length(8)` (stats), a fill row,
  and two `Percentage(50)` columns for the side-by-side panels — all expressible with our
  `flexGrow` + fixed sizes.

### → Uniview Phase 2 mapping

| oha element | Uniview piece |
|---|---|
| `Gauge` progress bar | **Gauge/ProgressBar** (block-level fill `█░`) |
| green `BarChart` | **`renderBarChart`** (vertical, block glyphs `▁▂▃▄▅▆▇█`) |
| tan histogram (`BarChart` on bins) | **`renderHistogram`** = same bar builder + binning |
| stat `Paragraph` panels | `Panel` + `richtext` (color-coded lines) |
| 50/50 column split | `flexGrow` columns |

**Bars & sparklines need only block glyphs, not braille.** Braille (2×4) is only for the
`Chart` widget (line/scatter) — see ratatui `chart.rs` / `canvas.rs`.

---

## Screenshot 3 — crossword  → Phase 3 (roadmap, lower priority)

**What it is:** `matrixfrog/crossword` (`crosstui`), a terminal crossword player
(ratatui). Rendering source: `~/Dev/others/crossword/crosstui/src/main.rs`.

**Crucial finding:** it uses **no canvas/braille**. Each square is a ratatui `Block` with
a **background color**, and the letter is drawn as **black bold text** on top. Confirmed in
source:

```rust
// square background by state:
SquareStyle::Standard => Color::White,      // filled cell
SquareStyle::Cursor   => Color::LightRed,   // current cell
SquareStyle::Word     => Color::LightYellow,// current across/down word
Style::new().bg(bg).black().bold()          // the letter
Square::Black => Block::new().on_black()     // blocked cell
```

So crossword = **`Box(backgroundColor) + centered Text`**, primitives we already have.

### Layout (dark background)

```
crossword   ★49   Play crossword puzzles in your terminal

┌ grid (5×5) ──────────────┐   ┌──────── Congratulations! ────────┐
│ ▓▓ ▓▓  A   M   Y          │   ┊                                  ┊
│ ▓▓  I   T   O   O         │   ┊         You solved it!           ┊
│  D   R   E   A   D        │   ┊                                  ┊
│  A   M   A   N   A        │   └──────────────────────────────────┘
│ [M] [A] [M] [A] ▓▓        │   Author: Neil McManus
└──────────────────────────┘   I somehow have 225 straight days …
      ↑red  ↑↑↑ yellow (current word)         crosshare.org
```

### Key visual details

- **Cells:** ~5 chars wide, colored background. **White** = normal filled, **LightRed** =
  cursor cell, **LightYellow** = the highlighted current word, **black** = blocked square.
- **Letters:** centered, **black bold** on the colored cell (blue/purple in the shot is
  the terminal's rendering of the default fg on white — source says `.black().bold()`).
- **Right panel:** `Paragraph "You solved it!"` centered inside a `Block::bordered()`
  titled `Congratulations!` (dashed border in the shot).
- **Below:** author + clue metadata as wrapped `Paragraph` text.

### → Uniview Phase 3 mapping

| crossword element | Uniview piece |
|---|---|
| colored square + letter | **`Box(background) + Text`** (existing) via a **`Grid`/`CellGrid`** helper |
| cursor / word highlight | per-cell background state (selection/focus color) |
| Congratulations panel | `Panel` (Phase 1) |
| shapes (Line/Rect/Circle) — *for other canvas apps* | Phase 2 **rasterizer** + shape helpers |

**Out of scope (noted):** bitmap/inline-image rendering (sixel/kitty/iterm2) — the
"very complex browser-image" rendering the user asked about is explicitly future.

---

## Summary: what each screenshot proves about our approach

1. **lazygit** → needs **titled/footered focusable panels + selectable lists + status
   bar**. Layout is weighted boxes we already do. This is Phase 1.
2. **oha** → **bars, histograms, gauges, sparklines are block-glyph characters** on the
   existing spans pipeline. One `renderBarChart` covers both bars and histograms. Phase 2.
3. **crossword** → **colored `Box` + `Text`**, no new primitive. Phase 3, trivial once
   Phase 1 exists. Braille canvas is only for line/scatter and freeform shapes.
