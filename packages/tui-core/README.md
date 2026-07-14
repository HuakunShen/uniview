# @uniview/tui-core

The terminal rendering engine: layout → paint → buffer → diff → surface. Framework-agnostic
and dependency-free — React and Solid both sit on top of it, and neither is visible from here.

## The pipeline

```
RenderNode tree
   → computeLayout()      resolve geometry (flexbox-ish)
   → renderToBuffer()     paint cells + record ownership
   → diffFrames()         emit only what changed
   → CellSurface          write it out
```

`TuiRenderer` drives that loop and schedules frames; `createTuiApp()` wires it to a terminal.

## Surfaces

| | |
|---|---|
| `AnsiCellSurface` | a real terminal (truecolor, cursor, partial repaints) |
| `MemoryCellSurface` | in-memory — what tests assert against |
| `SvgCellSurface` | render a frame to SVG (docs, screenshots) |

`MemoryCellSurface` + `frameToText()` is the reason the whole TUI stack is testable without a TTY.

## What's in here

**Layout** — `computeLayout`, `customLayoutEngine`. `LayoutEngine` is an interface, so an
alternative engine (e.g. Yoga) can be dropped in.

**Paint** — `renderToBuffer`, `CellBuffer`, `StyleTable` (interned styles), `OwnerTable`
(which node painted which cell — this is what makes hit-testing possible),
`borderGlyphs`/`BORDER_PRESETS`.

**Diff / output** — `diffFrames`, `buildFrameUpdate`, `frameToText`, `serializeFrame`.

**Canvas** — `VERTICAL_BLOCKS`/`HORIZONTAL_BLOCKS` + `verticalBarColumn` (eighth-block bars),
and `SubcellCanvas` (braille 2×4 sub-cell plotting). [`@uniview/tui-charts`](../tui-charts)
is built entirely on these two.

**Input** — `TerminalDriver` (raw mode, mouse, resize), `InputParser`, `FocusManager`,
`hitTest`, plus state machines: `TextInputMachine`, `PressableMachine`, `CheckboxMachine`,
`TabsMachine`.

**Styling** — `defaultTheme`, `resolveColorCss`, `nearestNamedColor`, `rgbToAnsi256`.
`Color` is `string | RgbColor`, so truecolor works.

**UI helpers** — pure and framework-agnostic; the React and Solid bindings both re-export
them rather than reimplementing: `nextFocus`, `listCounter`, `clampScroll`, `filterCommands`,
`computeVirtualWindow`.

## Known limitation

A `height: "100%"` child under a `flexGrow` ancestor resolves against the *grandparent's*
size rather than the flexGrow parent's final size, and overflows. Demos avoid percentage
heights under flexGrow. A characterization test pins the current behavior — fixing it is the
job of the planned Yoga layout adapter, not a patch here.

## Development

```bash
pnpm test          # vitest
pnpm check-types   # tsc --noEmit — vitest and tsdown do NOT type-check
pnpm build         # tsdown
```
