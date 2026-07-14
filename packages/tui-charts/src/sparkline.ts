import type { Color, RenderNode } from "@uniview/tui-core";
import { VERTICAL_BLOCKS, defaultTheme, styledLinesToRenderNode } from "@uniview/tui-core";

/** Options controlling {@link renderSparkline} scaling and styling. */
export interface SparklineOptions {
  /** The value that maps to a full-height glyph. Defaults to the largest value (min 1). */
  max?: number;
  /** Glyph color. Defaults to the theme's primary color. */
  color?: Color;
}

const clamp8 = (n: number): number => Math.max(0, Math.min(8, n));

/**
 * Render a single-line sparkline as a {@link RenderNode}: one eighth-block
 * glyph per value, all in a single styled span. Pure data → RenderNode — no
 * React, no terminal I/O.
 */
export function renderSparkline(
  values: readonly number[],
  options: SparklineOptions = {},
): RenderNode {
  const max = options.max ?? Math.max(1, ...values);
  const text = values
    .map((value) => {
      const index =
        !Number.isFinite(value) || !Number.isFinite(max) || max <= 0
          ? 0
          : clamp8(Math.round((value / max) * 8));
      return VERTICAL_BLOCKS[index];
    })
    .join("");

  return styledLinesToRenderNode([
    [{ text, style: { fg: options.color ?? defaultTheme.colors.primary } }],
  ]);
}
