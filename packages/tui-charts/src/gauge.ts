import type { Color, RenderNode, StyledSpan } from "@uniview/tui-core";
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

/** Options controlling {@link renderLineGauge} width, styling, label, and percent. */
export interface LineGaugeOptions {
  /** Bar width in cells. Defaults to 20. */
  width?: number;
  /** Bar (filled) color. Defaults to the theme's success color. */
  color?: Color;
  /** Label printed before the bar (e.g. "Download"). */
  label?: string;
  /** Append the rounded percentage (e.g. " 60%"). Defaults to true. */
  showPercent?: boolean;
}

/**
 * Render a ratatui-style single-line gauge as a {@link RenderNode}: an optional
 * `label` prefix, a filled bar for `fraction∈[0,1]`, and an optional `NN%`
 * suffix, laid out side by side. Unlike {@link renderGauge} (which centers the
 * label *on* the bar), the pieces sit next to each other. Pure data → RenderNode.
 */
export function renderLineGauge(fraction: number, options: LineGaugeOptions = {}): RenderNode {
  const width = options.width ?? 20;
  const clamped = Math.max(0, Math.min(1, fraction));
  const bar = horizontalBarCells(clamped, 1, width);
  const spans: StyledSpan[] = [];
  if (options.label !== undefined && options.label.length > 0) {
    spans.push({ text: `${options.label} ` });
  }
  spans.push({ text: bar, style: { fg: options.color ?? defaultTheme.colors.success } });
  if (options.showPercent !== false) {
    spans.push({ text: ` ${Math.round(clamped * 100)}%`, style: { dim: true } });
  }
  return styledLinesToRenderNode([spans]);
}
