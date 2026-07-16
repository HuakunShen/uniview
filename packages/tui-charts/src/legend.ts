import type { Color, StyledLine, StyledSpan } from "@uniview/tui-core";
import { defaultTheme } from "@uniview/tui-core";

/** One legend entry: a colored swatch followed by a series name. */
export interface LegendEntry {
  label: string;
  color?: Color;
}

/** Layout + styling for a legend rendered as styled text lines. */
export interface LegendOptions {
  position?: "top" | "bottom";
  orientation?: "horizontal" | "vertical";
  swatch?: string;
  gap?: number;
  color?: Color;
}

/**
 * Build a legend as {@link StyledLine}s: each entry is a swatch span (colored by
 * the entry) plus a " name" span. Horizontal packs entries onto one line with a
 * `gap`-cell separator; vertical emits one line per entry. Pure — no I/O, no new
 * primitive.
 */
export function renderLegend(entries: readonly LegendEntry[], options: LegendOptions = {}): StyledLine[] {
  const swatch = options.swatch ?? "■";
  const gap = Math.max(0, options.gap ?? 2);
  const orientation = options.orientation ?? "horizontal";

  const spansFor = (e: LegendEntry): StyledSpan[] => {
    const nameSpan: StyledSpan = options.color
      ? { text: ` ${e.label}`, style: { fg: options.color } }
      : { text: ` ${e.label}` };
    return [{ text: swatch, style: { fg: e.color ?? defaultTheme.colors.primary } }, nameSpan];
  };

  if (orientation === "vertical") {
    return entries.map((e) => spansFor(e));
  }

  const line: StyledSpan[] = [];
  entries.forEach((e, i) => {
    if (i > 0 && gap > 0) line.push({ text: " ".repeat(gap) });
    line.push(...spansFor(e));
  });
  return [line];
}
