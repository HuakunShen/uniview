import { useMemo, type ReactElement } from "react";
import { renderCanvas, type CanvasDraw, type Marker } from "@uniview/tui-core";
import { renderNodeToElement } from "./content";

/** Props for {@link Canvas} — a public braille/shape drawing surface. */
export interface CanvasProps {
  /** Canvas width in terminal cells. */
  width: number;
  /** Canvas height in terminal cells. */
  height: number;
  /** Glyph family. Defaults to "braille". */
  marker?: Marker;
  /** X data bounds for `cv.project`. Defaults to [0, 1]. */
  xBounds?: readonly [number, number];
  /** Y data bounds for `cv.project`. Defaults to [0, 1]. */
  yBounds?: readonly [number, number];
  /** Draw callback; receives a {@link DrawContext} handle. */
  draw: CanvasDraw;
}

/**
 * A public drawing surface: rasterizes the `draw` callback to braille/block
 * glyphs and emits styled text lines — the same output path as the charts, so
 * it adds no protocol primitive. Memoized on its inputs like {@link LineChart}.
 */
export function Canvas({ width, height, marker, xBounds, yBounds, draw }: CanvasProps): ReactElement {
  return useMemo(
    () => renderNodeToElement(renderCanvas({ width, height, marker, xBounds, yBounds }, draw)),
    [width, height, marker, xBounds, yBounds, draw],
  );
}
