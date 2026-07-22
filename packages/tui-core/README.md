# @uniview/tui-core

The framework-neutral terminal engine: layout → paint → buffer → diff → surface.
It powers the React and Solid bindings without depending on either framework.

`@uniview/tui-core` has runtime dependencies for Unicode cell widths and the optional Yoga
layout adapter; it is framework-neutral, not dependency-free.

If you are authoring React or Solid UI, install `@uniview/tui-react` or
`@uniview/tui-solid` instead. Each binding includes the usual terminal lifecycle and
re-exports common core facilities. Install this package directly when you are building a
custom surface or a no-framework terminal UI.

## Direct mode (no framework)

```bash
pnpm add @uniview/tui-core
```

```ts
import { createTuiApp, type RenderNode } from "@uniview/tui-core";

const scene: RenderNode = {
  type: "box",
  style: { flexDirection: "column", padding: 1, border: "rounded", width: 40 },
  children: [
    {
      type: "text",
      text: "Hello from Uniview",
      textStyle: { fg: "cyan", bold: true },
    },
    { type: "text", text: "No React or Solid required." },
  ],
};

const app = createTuiApp({ input: process.stdin, output: process.stdout });
app.render(scene);

process.on("SIGINT", () => {
  app.destroy();
  process.exit(0);
});
```

`createTuiApp()` owns the renderer and terminal as one session. If renderer cleanup fails,
the driver releases terminal resources best-effort but keeps both stream identities reserved;
`destroy()` or the next owner of either stream retries the same cleanup before acquiring the
terminal.

When composing `TerminalDriver` with a custom renderer, register that renderer's cleanup with
`driver.start({ cleanup })` and let `driver.stop()` tear down the whole session. The optional
`retainSessionOnError` predicate is only for a typed error that guarantees cleanup made no
mutation; returning `true` leaves the live session untouched.

Renderer teardown is durable. As soon as `TuiRenderer.destroy()` begins, queued frames are
invalidated and `setRoot()`, `resize()`, `setCursor()`, and `flush()` reject permanently—even
if the surface cleanup must be retried. Public renderer/host handles from an old app therefore
cannot write into a replacement terminal session.

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

|                     |                                                       |
| ------------------- | ----------------------------------------------------- |
| `AnsiCellSurface`   | a real terminal (truecolor, cursor, partial repaints) |
| `MemoryCellSurface` | in-memory — what tests assert against                 |
| `SvgCellSurface`    | render a frame to SVG (docs, screenshots)             |

`MemoryCellSurface` + `frameToText()` is the reason the whole TUI stack is testable without a TTY.

`CellSurface` is deliberately synchronous: `mount()`, `resize()`, and `destroy()` return
`void`, while `present()` returns `PresentStats` immediately. A custom surface must finish its
observable work during that call. If it needs asynchronous I/O, enqueue it internally without
returning a Promise or thenable; `TuiRenderer` rejects those results and invalidates the session
so an asynchronous operation cannot race a replacement renderer. Teardown is also reentrancy-safe:
a surface may trigger renderer destruction from `resize()`, `present()`, or its own `destroy()`
without recommitting work or recursively calling surface cleanup. Once teardown starts, renderer
mutations remain unavailable; an external `destroy()` may retry a cleanup call that threw.

## What's in here

**Layout** — `computeLayout`, `customLayoutEngine`, and `yogaLayoutEngine`. `LayoutEngine` is
an interface, so another engine can be supplied.

**Paint** — `renderToBuffer`, `CellBuffer`, `StyleTable` (interned styles), `OwnerTable`
(which node painted which cell — this is what makes hit-testing possible),
`borderGlyphs`/`BORDER_PRESETS`.

**Diff / output** — `diffFrames`, `buildFrameUpdate`, `frameToText`, `serializeFrame`.

**Canvas** — `VERTICAL_BLOCKS`/`HORIZONTAL_BLOCKS` + `verticalBarColumn` (eighth-block bars),
and `SubcellCanvas` (braille 2×4 sub-cell plotting).

**Input** — `TerminalDriver` (raw mode, mouse, resize), `InputParser`, `FocusManager`,
`hitTest`, plus state machines: `TextInputMachine`, `PressableMachine`, `CheckboxMachine`,
`TabsMachine`.

**Styling** — `defaultTheme`, `resolveColorCss`, `nearestNamedColor`, `rgbToAnsi256`.
`Color` is `string | RgbColor`, so truecolor works.

**UI helpers** — pure and framework-neutral helpers including `nextFocus`, `listCounter`,
`clampScroll`, `filterCommands`, and `computeVirtualWindow`.

## Known limitation

A `height: "100%"` child under a `flexGrow` ancestor resolves against the _grandparent's_
size rather than the flexGrow parent's final size, and overflows. Demos avoid percentage
heights under flexGrow. A characterization test pins the current behavior — fixing it is the
job of the Yoga layout adapter, not a patch here.

## Development

```bash
pnpm test          # vitest
pnpm check-types   # tsc --noEmit — vitest and tsdown do NOT type-check
pnpm build         # tsdown
```
