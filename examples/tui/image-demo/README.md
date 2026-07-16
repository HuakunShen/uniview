# @uniview/tui-image-demo

A terminal **image viewer**: an RGBA raster painted as half-block `▀` cells.

```bash
# built-in synthetic gallery (Mandelbrot / color wheel / gradient)
pnpm --filter @uniview/tui-image-demo dev

# view a real image file (PNG / JPEG / WebP / AVIF / HEIC / …)
pnpm --filter @uniview/tui-image-demo dev -- /path/to/photo.png
```

Runs under **`bun`** (the dev script is `bun src/main.tsx`). Keys: `n` / `→` next
image · `←` previous · `q` or `Ctrl-C` quit.

## How it works

`<Image>` (from `@uniview/tui-react`) takes a decoded `RgbaImage`
(`{ data: RGBA8, width, height }`) plus a `maxCols`/`maxRows` cell budget and:

1. **fits** the image into the budget preserving aspect (a half-block cell is
   1 pixel wide × 2 pixels tall, and a cell is ~twice as tall as wide, so a
   half-block pixel is roughly square),
2. **box-downsamples** the source raster to the target grid, and
3. paints each cell as `▀` with **fg = the upper pixel** and **bg = the lower
   pixel** — two pixel rows per text row, at full truecolor.

This is the universal, protocol-free image path (the same fallback yazi/chafa use
when no Kitty/Sixel/iTerm2 graphics protocol is available). It needs **no new
renderer primitive** — it emits the same styled-lines tree as the charts and
`<Canvas>`, honoring uniview's rule that the renderer only paints the pixels the
plugin hands it.

The built-in images (`src/images.ts`) are generated synthetically (Mandelbrot,
color wheel, gradient) so the demo runs with no arguments. Passing a file path
decodes it to `{ data, width, height }` and hands it to the same `<Image>`
(`src/decode.ts`): **`Bun.Image`** decodes any format Bun supports and normalizes
to PNG, then **`pngjs`** expands that to raw RGBA — no native `sharp` dependency.

The same bridge idea applies anywhere a plugin has real I/O: a Node/Bun plugin
decodes off disk; a browser Worker plugin uses `OffscreenCanvas` +
`createImageBitmap` → `ctx.getImageData()` (workers can't touch the DOM, so use
`OffscreenCanvas`, not a `<canvas>` element).

The `<Image>` component is identical in `@uniview/tui-react` and
`@uniview/tui-solid` and renders byte-identical output (asserted in
`packages/tui-solid/tests/image-parity.test.tsx`).
