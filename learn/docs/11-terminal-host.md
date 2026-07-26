# 11. The same tree as cells in a grid: layout, frame diff, paint

## Why

Stage C's claim is that one `UINode` tree can drive any screen. Svelte, Vue,
React and AppKit do not really test that claim: all four are retained scene
graphs with a layout engine already inside them, so "render a node" means "hand
it to something that knows how to be a box". A terminal has none of that. It is
a rectangle of character cells, the only operation is *write a glyph at a
coordinate*, and there is no `document`, no reflow, no repaint invalidation, no
sub-cell anything. If the protocol survives here it is genuinely
renderer-independent; if it needed one browser assumption, this is where it
would surface.

The second reason is a failure mode, not a proof. A terminal host that repaints
the whole screen on every frame does not merely waste I/O — the user *sees* it,
as flicker and tearing, because thousands of bytes go down a pty while the
terminal is compositing. `tui-core`'s answer is a frame diff, and its ANSI
surface exists to emit "exactly the changed cell runs — never a full-screen
clear"
([packages/tui-core/src/surface/ansi-surface.ts:21](../../packages/tui-core/src/surface/ansi-surface.ts#L21)).
That is step 05's lesson one layer down: the RPC boundary sends mutations
instead of trees for the same reason the terminal sends runs instead of screens.

## Why this approach, and not the obvious alternative

The obvious alternative is **translating mutations directly into cursor
writes** — `setText n2` becomes "move to where n2 is and print the new string",
and you never build a buffer at all. It is tempting because it looks like the
minimum work, and it is wrong for a reason this step's own output demonstrates:
run the example and compare section 5 with section 7. The plugin sent three
mutations. The screen changed in **sixteen runs across five rows**, most of
which the plugin never mentioned — adding a sixth row made the panel one cell
taller, which moved the bottom border down a row, which moved the caption below
it down a row. A mutation is a statement about the tree; a cell run is a
statement about the screen, and there is no function from one to the other that
does not amount to redoing layout. So the host redoes layout, paints into a
fresh buffer, and *discovers* what changed by comparing grids. The single frame
of history it keeps is the entire cost.

The second alternative is to **repaint the whole screen every frame** and skip
the diff. Section 9 of the run prices that: one `setText` produces **7 changed
cells and 24 bytes of ANSI**; the same frame repainted whole is 1017 bytes, a
42x difference, and at 60fps on an 80x24 terminal a full repaint is 115,200 cell
writes per second. Flicker is not a performance regression, it is a broken UI.

The third alternative is to **use a real flexbox engine and be done**. Uniview
actually ships one — `yogaLayoutEngine`, native flexbox via `yoga-layout` — but
it is *not* the default, and the reason is written into the default's one-line
comment: "The built-in flexbox engine (no dependencies; runs in Worker/Deno/Bun)"
([packages/tui-core/src/layout/engine.ts:13](../../packages/tui-core/src/layout/engine.ts#L13)).
A native/wasm dependency is exactly what a renderer meant to be reimplemented on
every platform cannot afford. Both engines sit behind one `LayoutEngine`
interface, and the repository's own comparison test is the interesting artifact:
`layout.ts` carries a long "KNOWN LIMITATION" note about percentage main-axis
sizes that was later *retracted* after Yoga was brought up and produced the same
geometry — "So this is correct `flex-basis: auto` behavior, not a bug"
([packages/tui-core/src/layout/layout.ts:111](../../packages/tui-core/src/layout/layout.ts#L111)).
The seam is what let them find that out.

`learn/` cannot install yoga, so section 5 of `main.ts` is a deliberately small
layout pass — main axis, gap, padding, border insets, explicit sizes, one
flex-grow rule, two `alignItems` values. What a real engine adds is listed under
"What this step leaves out", and it is a lot.

## What changed since step 10

Step 10 put the tree in front of a host with no JS runtime at all — AppKit in
Swift — and asked what the protocol must therefore guarantee: a JSON-safe
`UINode`, `HandlerId` strings instead of functions, semantic style tokens
instead of colors. That host still had a scene graph: `NSView`s that know their
own frames, and a layout engine (Yoga) it did not have to write.

Step 11 removes the scene graph. Concretely, against steps 07-10:

- **A second `MutableTree`, with a different public API and the opposite memory
  strategy.** Steps 02 and 07 used `@uniview/host-sdk`'s: two indexes, never
  mutates a node in place, returns a fresh root so a framework's reference-equality
  change detection can skip subtrees. `packages/host-tui` ships its own —
  `getRoot` / `getNode` / `parentId` / `applyBatch` / `apply` — which does
  `parent.children.push(mutation.node)` and clones nothing. Both are correct.
  Structural sharing buys a *framework* something; a terminal host has no
  framework and finds its delta by comparing grids, so cloning the path to the
  root would cost an allocation per node per frame and buy nothing.
- **No `ComponentRegistry` at all.** Step 07 taught the registry as the thing
  that keeps a host app-agnostic, and noted the terminal host as one of three
  different answers. Here it is: `host-tui` dispatches on a `TEXT_TYPES` set and
  otherwise treats every node as a box that lays out its children. There is no
  per-type widget object to register, so an unknown `type` is handled
  structurally rather than by a placeholder.
- **Layout as the host's own job.** Step 07's grid host stacked children
  vertically and ignored `gap` and `padding` entirely. This step computes a real
  rect for every node — measure pass, then arrange pass — and prints all of them,
  because a layout you cannot see is a layout you cannot debug.
- **A cell buffer instead of a string.** Step 07's `paint` built an array of
  strings. Here the frame is a struct-of-arrays (`graphemes`, `styleIds`) with
  interned style ids, because the next stage compares two of them cell by cell
  and that comparison has to be two primitive tests, not an object walk.
- **Two new pipeline stages that no previous host had: diff and emit.** Steps
  08-10 ended at "produce output". This step compares the new frame to the
  previous one, reduces the difference to `CellRun`s, and encodes only those runs
  as ANSI — measuring the bytes without ever writing them.
- **Border-drawing characters.** A CSS border is a decoration on a box that
  already exists. A terminal border is four rows and columns of literal glyphs
  that your content can no longer use, which means `borderInsets` must be
  subtracted during *measurement*, not painting — and the panel's title lives
  *in* the top border row, overwriting part of the `─` run.

## How Uniview really does it

The whole pipeline is one private method. Read it as the table of contents for
`main.ts` sections 4-9:

```typescript
  private renderFrame(_kind: RenderKind): void {
    if (this.lifecycle !== "active") return;
    const root: RenderNode = this.root ?? { type: "box" };
    const { buffer, owners } = renderToBuffer(
      root,
      this.size,
      this.styles,
      this.layoutEngine,
    );
    this.revision += 1;
    const previous = this.forceFullRepaint ? null : this.previous;
    const update = buildFrameUpdate(
      previous,
      buffer,
      this.revision,
      this.cursor,
    );
    this.forceFullRepaint = false;
```

[packages/tui-core/src/renderer/tui-renderer.ts:178](../../packages/tui-core/src/renderer/tui-renderer.ts#L178)
(lines 178-194; the method continues by presenting `update` to the surface and
storing `buffer` as the new `previous`).

The diff, and the one invariant that makes it harder than it looks:

```typescript
/**
 * Compute the changed cell runs between two frames.
 *
 * Runs never split a wide glyph: a run is expanded left to include a lead cell
 * when it begins on a continuation half, and expanded right to include the
 * continuation half when it ends on a wide lead. A dimension change forces a
 * full repaint (every row of `next`).
 */
export function diffFrames(prev: CellBuffer, next: CellBuffer): CellRun[] {
```

[packages/tui-core/src/diff/frame-diff.ts:24](../../packages/tui-core/src/diff/frame-diff.ts#L24)
(lines 24-32). `main.ts` implements the run-finding loop and the dimension rule
verbatim and skips the wide-glyph expansion, because its buffer is ASCII plus
box-drawing.

And the seam that keeps yoga optional:

```typescript
/**
 * A pluggable layout engine. The default {@link customLayoutEngine} is the
 * built-in pure-TS flexbox; alternative engines (e.g. a Yoga adapter) implement
 * the same interface so hosts can swap correctness/portability trade-offs.
 */
export interface LayoutEngine {
  computeLayout(root: LayoutInput, container: Size): LayoutResult;
}

/** The built-in flexbox engine (no dependencies; runs in Worker/Deno/Bun). */
export const customLayoutEngine: LayoutEngine = { computeLayout };
```

[packages/tui-core/src/layout/engine.ts:4](../../packages/tui-core/src/layout/engine.ts#L4)
(lines 4-14)

## What this step leaves out

- **A real flexbox engine.** `main.ts`'s layout pass has a main axis, `gap`,
  `padding`, border insets, explicit integer sizes, `flexGrow`, and
  `alignItems: "start" | "stretch"`. The real `customLayoutEngine` adds
  `row-reverse`/`column-reverse` (implemented by reversing four parallel arrays
  in lockstep), `justifyContent` including `space-between`/`space-around`,
  `alignSelf`, `flexShrink`, `flexBasis`, `position: "absolute"` with
  `top`/`right`/`bottom`/`left` insets resolved out of flow, percentage and
  `"auto"` dimensions, `min`/`max` on both axes, `margin`, and separate
  `rowGap`/`columnGap` — and *that* is still the small one.
  [packages/tui-core/src/layout/layout.ts:202](../../packages/tui-core/src/layout/layout.ts#L202)
- **Yoga.** `yogaLayoutEngine` maps `TuiStyle` onto real `yoga-layout` nodes with
  `setPointScaleFactor(1)` so geometry rounds to whole cells. It is stricter than
  the built-in engine in at least one observable way, and the built-in engine's
  own comment says so: it "honors explicit cross-axis sizes this engine
  stretches". `main.ts` copies the loose behavior (`alignItems: "stretch"`
  overrides an explicit width) and works around it with `alignItems: "start"`, so
  a reader can see the disagreement rather than read about it.
  [packages/tui-core/src/layout/yoga-engine.ts:1](../../packages/tui-core/src/layout/yoga-engine.ts#L1),
  [packages/tui-core/src/layout/layout.ts:126](../../packages/tui-core/src/layout/layout.ts#L126)
- **A scheduler and a frame clock.** `main.ts` renders synchronously, once per
  `applyBatch`. The real renderer invalidates a `RenderScheduler` that coalesces
  a burst of mutations into exactly one frame and ranks `layout` above `paint`,
  plus a frame clock, an easing library and a timeline for animation, and a
  diagnostics tracker counting mutations and rendered frames.
  [packages/tui-core/src/scheduler/scheduler.ts:19](../../packages/tui-core/src/scheduler/scheduler.ts#L19),
  [packages/tui-core/src/scheduler/frame-clock.ts](../../packages/tui-core/src/scheduler/frame-clock.ts),
  [packages/tui-core/src/scheduler/timeline.ts](../../packages/tui-core/src/scheduler/timeline.ts),
  [packages/tui-core/src/scheduler/diagnostics.ts](../../packages/tui-core/src/scheduler/diagnostics.ts)
- **Wide glyphs.** `main.ts` counts one character as one cell. The real buffer
  stores a wide grapheme as a lead cell (width 2) plus a zero-width continuation
  cell, repairs a dangling half before any overwrite, folds combining marks into
  the lead cell to their left, and refuses to write a wide glyph into the last
  column — "so that measurement and drawing never disagree — the invariant the
  POC renderer violated". The diff then has to expand runs so they never split a
  pair, and width itself is a Unicode grapheme walk with emoji and
  regional-indicator rules.
  [packages/tui-core/src/buffer/cell-buffer.ts:31](../../packages/tui-core/src/buffer/cell-buffer.ts#L31),
  [packages/tui-core/src/text/graphemes.ts:1](../../packages/tui-core/src/text/graphemes.ts#L1),
  [packages/tui-core/src/diff/frame-diff.ts:54](../../packages/tui-core/src/diff/frame-diff.ts#L54)
- **Hit testing and focus.** `main.ts`'s buffer has no `ownerIds` array, so a
  painted cell cannot be traced back to the node that painted it. The real one
  interns node ids into a per-cell integer — a container stamps its whole box so
  a click on empty space inside a row still resolves to the row, and children
  paint after so the deepest owner wins — and a focus manager plus an input
  router turn that into event dispatch back through `HandlerId`s.
  [packages/tui-core/src/paint/owner-table.ts:1](../../packages/tui-core/src/paint/owner-table.ts#L1),
  [packages/tui-core/src/focus/hit-test.ts](../../packages/tui-core/src/focus/hit-test.ts),
  [packages/tui-core/src/focus/focus-manager.ts](../../packages/tui-core/src/focus/focus-manager.ts),
  [packages/host-tui/src/input-router.ts](../../packages/host-tui/src/input-router.ts)
- **Input.** No raw mode, no key parsing, no mouse. The real host parses the
  terminal's escape-sequence input stream into key and mouse events, owns a
  terminal driver that puts the tty into raw mode and back, and installs a crash
  guard so a thrown exception cannot leave a user's shell in the alternate screen
  with the cursor hidden. Focus is deliberately resolved host-side and never
  streamed to the plugin — see the caret comment in `convert.ts`.
  [packages/tui-core/src/input/parser.ts](../../packages/tui-core/src/input/parser.ts),
  [packages/tui-core/src/input/events.ts](../../packages/tui-core/src/input/events.ts),
  [packages/tui-core/src/terminal/terminal-driver.ts](../../packages/tui-core/src/terminal/terminal-driver.ts),
  [packages/tui-core/src/terminal/crash-guard.ts](../../packages/tui-core/src/terminal/crash-guard.ts),
  [packages/host-tui/src/convert.ts:144](../../packages/host-tui/src/convert.ts#L144)
- **ANSI styling and real surfaces.** `main.ts` has three boolean attributes and
  an `sgrFor` that never emits a color; it returns the escape string instead of
  writing it. The real encoder handles eight SGR attributes plus named and
  24-bit RGB colors, and `AnsiCellSurface` runs a style/cursor state machine,
  wraps each frame in Synchronized Output (DEC private mode 2026) so a large
  delta cannot tear, hides the hardware cursor across the bulk write, and reports
  `{ rowsPainted, runsPainted, bytesWritten }`. There are three other surfaces —
  memory (for tests), SVG, and a DOM one in `tui-surface-dom`.
  [packages/tui-core/src/ansi/encode.ts:1](../../packages/tui-core/src/ansi/encode.ts#L1),
  [packages/tui-core/src/surface/ansi-surface.ts:46](../../packages/tui-core/src/surface/ansi-surface.ts#L46),
  [packages/tui-core/src/surface/memory-surface.ts](../../packages/tui-core/src/surface/memory-surface.ts),
  [packages/tui-core/src/surface/svg-surface.ts](../../packages/tui-core/src/surface/svg-surface.ts)
- **Backgrounds, overlays and clipping.** `main.ts` paints glyphs only, in child
  order. The real painter fills a node's box with a background color, treats text
  backgrounds as *transparent* by default so a run with no `bg` keeps the fill
  underneath ("like the web"), and paints in-flow children first and absolute
  children afterwards sorted by `zIndex` "so dialogs / command palettes paint on
  top of the content behind them".
  [packages/tui-core/src/paint/paint.ts:65](../../packages/tui-core/src/paint/paint.ts#L65),
  [packages/tui-core/src/paint/paint.ts:266](../../packages/tui-core/src/paint/paint.ts#L266)
- **Borders beyond the four classic presets.** `BORDER_PRESETS` also carries
  `quadrant-inside` and `quadrant-outside` half-block styles with per-edge glyph
  overrides (`horizontalTop`, `verticalLeft`, …), because an asymmetric border
  made of `▛▜▙▟` needs a different glyph on each of the four edges.
  [packages/tui-core/src/paint/border.ts:22](../../packages/tui-core/src/paint/border.ts#L22)
- **Rich text, canvas and charts.** A `spans` leaf paints consecutive styled runs
  on one line; the canvas module draws with braille and quadrant sub-cell blocks,
  coordinate transforms, images and a world map; `@uniview/tui-charts` builds
  line, bar, scatter, histogram, gauge and sparkline widgets on top. None of it
  is in `main.ts`.
  [packages/tui-core/src/text/styled-text.ts](../../packages/tui-core/src/text/styled-text.ts),
  [packages/tui-core/src/canvas/draw.ts](../../packages/tui-core/src/canvas/draw.ts),
  [packages/tui-core/src/canvas/subcell.ts](../../packages/tui-core/src/canvas/subcell.ts),
  [packages/tui-charts/src/line.ts](../../packages/tui-charts/src/line.ts)
- **Everything around the renderer.** Component state machines (text input,
  tabs, tree, table, calendar, selection), a virtual window for long lists, a
  theme and color-depth layer, an append-only committed-output channel for
  `<Static>` scrollback, a semantic tree with `queryByRole` / `queryByText` for
  testing, and the controller host that connects this renderer to a
  `PluginController` from step 07.
  [packages/tui-core/src/components/text-input-machine.ts](../../packages/tui-core/src/components/text-input-machine.ts),
  [packages/tui-core/src/virtual/virtual-window.ts](../../packages/tui-core/src/virtual/virtual-window.ts),
  [packages/tui-core/src/theme/color-depth.ts](../../packages/tui-core/src/theme/color-depth.ts),
  [packages/tui-core/src/app/committed-output.ts](../../packages/tui-core/src/app/committed-output.ts),
  [packages/host-tui/src/semantics.ts](../../packages/host-tui/src/semantics.ts),
  [packages/host-tui/src/controller-host.ts](../../packages/host-tui/src/controller-host.ts)
- **Resize.** `main.ts` has a fixed 52x14 screen. `TuiRenderer.resize` forces the
  next frame to be a full repaint precisely because there is no meaningful
  cell-to-cell correspondence between two different grids — the same rule
  `diffFrames` applies when dimensions differ.
  [packages/tui-core/src/renderer/tui-renderer.ts:99](../../packages/tui-core/src/renderer/tui-renderer.ts#L99)

## Trade-offs

- **Redoing layout and paint on every frame, then diffing**, means the host
  never has to translate a mutation into a screen edit — and the run output shows
  why that translation is not merely hard but ill-defined, since one appended row
  moved twelve runs the plugin never mentioned. The cost is that every frame is
  O(nodes) layout plus O(cells) paint plus O(cells) compare, even when one
  character changed: section 9's `setText` still laid out and painted all 728
  cells to discover that 7 of them differed.
- **Keeping exactly one previous buffer** turns 1017 bytes into 24 for a typical
  keystroke and is the difference between a UI and a flickering one. The cost is
  one full frame of memory (three typed arrays for a real buffer), and a subtle
  correctness obligation: anything that writes to the terminal *behind* the
  renderer's back invalidates the assumption that `previous` describes what is on
  screen, which is why `resize` and the first frame both force a full repaint.
- **A hand-written layout engine with no dependencies** is what lets the renderer
  run in a Worker, Deno or Bun and be portable to the next platform — the same
  bet as the whole project. The cost is a flexbox that is subtly not flexbox:
  `alignItems: "stretch"` overriding an explicit width is a real divergence from
  Yoga that the scene in `main.ts` has to work around, and the repository needed
  a *second engine plus a comparison test* to settle whether one of its layout
  behaviors was a bug.
- **Runs instead of individual cells** is chosen by what the transport charges
  for: a cursor move is ~7 bytes, so eight adjacent cells are one move plus eight
  glyphs while eight scattered cells are eight moves. The cost is that the diff is
  blind to meaning — row 9 in the run output breaks into six separate runs because
  a few spaces happen to match before and after, and no amount of "but the panel
  just moved down one row" is available to it.
- **Interned style ids in a struct-of-arrays buffer** make "did this cell change"
  two primitive comparisons instead of an object compare, which is what makes
  diffing 12,000 cells per frame affordable. The cost is a level of indirection
  everywhere: nothing in the buffer is readable without the `StyleTable`, and the
  serialized frame format has to ship the palette alongside the cells.

## Run it

```
pnpm tsx steps/11-terminal-host/main.ts
```

Real output, **trimmed** from 190 lines to the 42 that carry the idea. Elided:
section 1 (the `UINode` tree, 32 lines), section 2's full layout dump (21 lines,
one representative slice kept), frame 1's art, and all trailing commentary.
Every line below is verbatim; lines were removed between them, never altered.

Section 2 — layout is not a black box. Note `<name-tui>` at `w=32` while its
siblings are `w=37`: `flexGrow` gave the name whatever the status did not need,
which is the entire implementation of "right-aligned":

```
  <box#screen>               x= 0 y= 0 w=52 h=14
    <box#panel>              x= 1 y= 1 w=46 h= 9
      <text#lede>            x= 3 y= 2 w=42 h= 1  "the same UINode tree, in cells"
      <box#rows>             x= 3 y= 4 w=42 h= 5
        <box#row-svelte>     x= 3 y= 4 w=42 h= 1
          <text#name-svelte> x= 3 y= 4 w=37 h= 1  "host-svelte"
          <text#stat-svelte> x=40 y= 4 w= 5 h= 1  "ready"
        <box#row-tui>        x= 3 y= 8 w=42 h= 1
          <text#name-tui>    x= 3 y= 8 w=32 h= 1  "host-tui"
          <text#stat-tui>    x=35 y= 8 w=10 h= 1  "connecting"
    <text#caption>           x= 1 y=11 w=31 h= 1  "layout -> paint -> diff -> emit"
```

Section 6 — frame 2, painted into cells and printed with a column ruler. The
title and footer are *inside* the border rows:

```
       0         1         2         3         4         5
       0123456789012345678901234567890123456789012345678901
    0 |                                                    |
    1 | ╭────── uniview · one tree, many hosts ──────╮     |
    2 | │ the same UINode tree, in cells             │     |
    3 | │                                            │     |
    4 | │ host-svelte                          ready │     |
    5 | │ host-vue                             ready │     |
    6 | │ host-react                           ready │     |
    7 | │ UniviewAppKit                        ready │     |
    8 | │ host-tui                             ready │     |
    9 | │ host-harmony                        queued │     |
   10 | ╰───────────────────────── frame 2 · 6 hosts ╯     |
   11 |                                                    |
   12 | layout -> paint -> diff -> emit                    |
   13 |                                                    |
```

Sections 7-9 — the diff (5 of 16 runs kept), and the ratio the step exists for:

```
  y= 8 x=35..45  10 cells   "connecting" -> "     ready"
  y= 9 x= 1..27  26 cells   "╰─────────────────────────" -> "│ host-harmony            "
  y= 9 x=46..47   1 cell    "╯" -> "│"
  y=11 x= 1..32  31 cells   "layout -> paint -> diff -> emit" -> "                               "
  y=12 x= 1..32  31 cells   "                               " -> "layout -> paint -> diff -> emit"
=== 8. Cells in the frame vs cells actually emitted ===
  frame                : 52 x 14 = 728 cells
  changed runs         : 16 runs on 5 rows
  cells emitted        : 153  (21.0% of the frame)
  ANSI bytes, diffed   : 369
  ANSI bytes, full     : 1017
  saving               : 63.7% of the bytes a naive repaint would have written
  style ids interned   : 3  [{},{"bold":true},{"dim":true}]
=== 9. The common case: one setText ===
  y= 5 x=38..45   7 cells   "  ready" -> "syncing"
  cells emitted        : 7 of 728  (1.0% of the frame)
  ANSI bytes           : 24  (the same frame as a full repaint: 1017)
```

The lines worth staring at: `21.0%` and `1.0%`. Twenty-one percent is the
*expensive* case — inserting a row reflows everything below it, and once a
bordered panel is in the way there is no scroll-region trick available. One
percent is the case that happens on every keystroke: 7 cells, 24 bytes, against
a 1017-byte full repaint. Also worth noting is what the host did *not* know: it
laid out and painted all 728 cells both times, because nothing in
`Mutation` tells it where on the screen anything is. It found out afterwards, by
looking.

## Sources

- [packages/tui-core/src/renderer/tui-renderer.ts](../../packages/tui-core/src/renderer/tui-renderer.ts) —
  the render loop this step is a miniature of: scene root, double buffer,
  scheduler, `renderFrame`, `resize`, teardown
- [packages/tui-core/src/layout/layout.ts](../../packages/tui-core/src/layout/layout.ts) —
  the real pure-TS flexbox: `LayoutBox`, `LayoutInput`, `intrinsicSize`,
  `contentSize`, `arrange`, `computeLayout`, and the retracted "KNOWN LIMITATION"
- [packages/tui-core/src/layout/engine.ts](../../packages/tui-core/src/layout/engine.ts) —
  the `LayoutEngine` seam and why the zero-dependency engine is the default
- [packages/tui-core/src/layout/yoga-engine.ts](../../packages/tui-core/src/layout/yoga-engine.ts) —
  what a real flexbox engine costs and what it settles
- [packages/tui-core/src/buffer/cell-buffer.ts](../../packages/tui-core/src/buffer/cell-buffer.ts) —
  the struct-of-arrays frame, `CellFlags.Continuation`, `writeText`,
  `stampOwner`, and the wide-glyph invariant
- [packages/tui-core/src/buffer/frame.ts](../../packages/tui-core/src/buffer/frame.ts) —
  `frameToLines` / `frameToText` / `serializeFrame`, the `cells.json` truth used
  by tests
- [packages/tui-core/src/paint/paint.ts](../../packages/tui-core/src/paint/paint.ts) —
  `RenderNode`, `toLayoutInput`, `paintNode`, `drawEdgeText`, clipping,
  transparent text backgrounds, absolute overlays by `zIndex`, `renderToBuffer`
- [packages/tui-core/src/paint/border.ts](../../packages/tui-core/src/paint/border.ts) —
  `BorderGlyphs`, the six presets, and the per-edge overrides
- [packages/tui-core/src/paint/owner-table.ts](../../packages/tui-core/src/paint/owner-table.ts) —
  how a painted cell maps back to a node
- [packages/tui-core/src/diff/frame-diff.ts](../../packages/tui-core/src/diff/frame-diff.ts) —
  `CellRun`, `cellsEqual`, `diffFrames`, and the wide-glyph run expansion
- [packages/tui-core/src/surface/frame-update.ts](../../packages/tui-core/src/surface/frame-update.ts) —
  `buildFrameUpdate`, `dirtyRows`, and the full-repaint rule
- [packages/tui-core/src/surface/ansi-surface.ts](../../packages/tui-core/src/surface/ansi-surface.ts) —
  what emitting a frame update actually costs, and Synchronized Output
- [packages/tui-core/src/ansi/encode.ts](../../packages/tui-core/src/ansi/encode.ts) —
  `cursorTo`, `sgrFor`, and the named/RGB color parameters
- [packages/tui-core/src/style/tui-style.ts](../../packages/tui-core/src/style/tui-style.ts) —
  the full `TuiStyle`, `Dimension`, `InsetsValue`, `BorderValue`
- [packages/tui-core/src/style/style-table.ts](../../packages/tui-core/src/style/style-table.ts) —
  interned `CellStyle`s and the palette a serialized frame carries
- [packages/tui-core/src/text/graphemes.ts](../../packages/tui-core/src/text/graphemes.ts) —
  why "one character, one cell" is a lie
- [packages/tui-core/src/scheduler/scheduler.ts](../../packages/tui-core/src/scheduler/scheduler.ts) —
  coalescing a burst of mutations into one frame
- [packages/host-tui/src/mutable-tree.ts](../../packages/host-tui/src/mutable-tree.ts) —
  the SECOND `MutableTree`: `getRoot` / `getNode` / `parentId` / `applyBatch` /
  `apply`, mutating in place
- [packages/host-tui/src/convert.ts](../../packages/host-tui/src/convert.ts) —
  `UINode` → `RenderNode`, `TEXT_TYPES`, `STYLE_KEYS`, `joinText`,
  `extractHandlers`, and host-side caret resolution
- [packages/host-tui/src/tui-host.ts](../../packages/host-tui/src/tui-host.ts) —
  the whole terminal host: tree, conversion, renderer, input dispatch
- [packages/host-sdk/src/mutable-tree.ts](../../packages/host-sdk/src/mutable-tree.ts) —
  the first `MutableTree`, for the diff against the second
- [CLAUDE.md](../../CLAUDE.md) — "THE PRIME DIRECTIVE", and why a renderer that
  gets reimplemented per platform cannot afford opinions or dependencies
- [learn/docs/07-host-contract.md](./07-host-contract.md) and
  [learn/steps/07-host-contract/main.ts](../steps/07-host-contract/main.ts) —
  the seam this host plugs into, and the toy grid host this step replaces with a
  real one
