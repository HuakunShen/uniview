import type { Color, RenderNode } from "@uniview/tui-core";
import { defaultTheme, horizontalBarCells, styledLinesToRenderNode } from "@uniview/tui-core";

/** Options controlling {@link renderGauge} width, styling, and label. */
export interface GaugeOptions {
  /** Gauge width in cells. Defaults to 20. */
  width?: number;
  /** Bar color. Defaults to the theme's success color. */
  color?: Color;
  /** Optional label overlaid, centered, on the filled bar. */
  label?: string;
}

/**
 * Render a single-line horizontal gauge as a {@link RenderNode}: a filled
 * bar for `fraction∈[0,1]` over `width` cells, with an optional centered
 * label overlay. Pure data → RenderNode — no React, no terminal I/O.
 */
export function renderGauge(fraction: number, options: GaugeOptions = {}): RenderNode {
  const width = options.width ?? 20;
  let text = horizontalBarCells(fraction, 1, width);

  const label = options.label;
  if (label !== undefined && label.length > 0 && label.length <= width) {
    const start = Math.floor((width - label.length) / 2);
    text = text.slice(0, start) + label + text.slice(start + label.length);
  }

  return styledLinesToRenderNode([
    [{ text, style: { fg: options.color ?? defaultTheme.colors.success } }],
  ]);
}
