# @uniview/tui-canvas-demo

A `<Canvas>` showcase from `@uniview/tui-react` — the public braille/shape
drawing surface:

- a **frame** (`cv.rect`) and a centered **circle** (`cv.circle`) in pixel space,
- a **sine wave** drawn in data space and mapped to pixels via `cv.project`
  (the same `dataToPixel` the charts use),
- all rasterized to braille sub-cells and emitted as styled text — **zero new
  protocol primitives**.

## Run

```bash
pnpm --filter @uniview/tui-canvas-demo dev     # Ctrl-C to quit
pnpm --filter @uniview/tui-canvas-demo test
```

The same `<Canvas>` API is available identically from `@uniview/tui-solid`,
and both bindings render byte-identical SVG.
