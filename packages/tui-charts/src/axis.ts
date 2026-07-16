import type { Color, StyledLine, StyledSpan } from "@uniview/tui-core";
import { dataToPixel, defaultTheme } from "@uniview/tui-core";

// The data → pixel coordinate mapping now lives in `@uniview/tui-core`
// (`canvas/coords.ts`) so the public `<Canvas>` engine and the charts share a
// single implementation. Re-exported here to keep `@uniview/tui-charts`'s
// surface and internal `./axis` imports unchanged.
export { dataToPixel };

/** Options for the axis frame drawn around a plot body. */
export interface AxisOptions {
  x?: boolean;
  y?: boolean;
  xTicks?: number;
  yTicks?: number;
  xTitle?: string;
  yTitle?: string;
  color?: Color;
  precision?: number;
}

/** One resolved axis tick: its data value, display label, and cell index. */
export interface AxisTick {
  value: number;
  label: string;
  cell: number;
}

function formatTick(value: number, precision: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toPrecision(precision)).toString();
}

/**
 * Evenly spaced ticks across `bound`, inclusive of both ends, each mapped to a
 * cell index in `[0, cells-1]` via {@link dataToPixel}. Pure — no I/O.
 */
export function axisTicks(
  bound: readonly [number, number],
  count: number,
  cells: number,
  precision = 4,
): AxisTick[] {
  const n = Math.max(2, Math.floor(count));
  const [lo, hi] = bound;
  const ticks: AxisTick[] = [];
  for (let i = 0; i < n; i += 1) {
    const value = lo + ((hi - lo) * i) / (n - 1);
    ticks.push({ value, label: formatTick(value, precision), cell: dataToPixel(value, bound, cells) });
  }
  return ticks;
}

/**
 * Wrap a plot `body` (rows top→bottom, each `width` cells wide) with a Y-axis
 * gutter of numeric labels + a vertical rule, an X-axis horizontal rule with
 * tick marks, a row of X labels, and optional axis titles. Returns a fresh
 * {@link StyledLine} list — the body spans are reused by reference so their
 * colors are preserved. Pure — no I/O, no new primitive.
 */
export function frameChart(
  body: StyledLine[],
  width: number,
  height: number,
  xBounds: readonly [number, number],
  yBounds: readonly [number, number],
  options: AxisOptions = {},
): StyledLine[] {
  const drawX = options.x ?? true;
  const drawY = options.y ?? true;
  const axisColor = options.color ?? defaultTheme.colors.border;
  const precision = options.precision ?? 4;

  const yTicks = drawY ? axisTicks(yBounds, options.yTicks ?? 5, height, precision) : [];
  const xTicks = drawX ? axisTicks(xBounds, options.xTicks ?? 5, width, precision) : [];

  const labelWidth = yTicks.reduce((w, t) => Math.max(w, t.label.length), 0);
  const gutter = drawY ? labelWidth + 1 : 0;

  // tick.cell is a bottom-origin index; body rows are top→bottom, so flip.
  const yLabelByRow = new Map<number, string>();
  for (const t of yTicks) yLabelByRow.set(height - 1 - t.cell, t.label);

  const out: StyledLine[] = [];

  if (options.yTitle !== undefined) {
    out.push([{ text: " ".repeat(gutter) }, { text: options.yTitle, style: { fg: axisColor } }]);
  }

  body.forEach((line, row) => {
    if (!drawY) {
      out.push(line);
      return;
    }
    const label = yLabelByRow.get(row) ?? "";
    const gutterText = " ".repeat(labelWidth - label.length) + label + "│";
    out.push([{ text: gutterText, style: { fg: axisColor } }, ...line]);
  });

  if (drawX) {
    const rule = new Array<string>(width).fill("─");
    for (const t of xTicks) rule[t.cell] = "┴";
    const corner = gutter > 0 ? " ".repeat(gutter - 1) + "└" : "";
    out.push([{ text: corner + rule.join(""), style: { fg: axisColor } }]);

    const cells = new Array<string>(width).fill(" ");
    for (const t of xTicks) {
      for (let i = 0; i < t.label.length && t.cell + i < width; i += 1) cells[t.cell + i] = t.label[i]!;
    }
    out.push([{ text: " ".repeat(gutter) + cells.join(""), style: { fg: axisColor } }]);
  }

  if (options.xTitle !== undefined) {
    const start = Math.max(0, Math.floor((gutter + width - options.xTitle.length) / 2));
    const leader: StyledSpan[] = start > 0 ? [{ text: " ".repeat(start) }] : [];
    out.push([...leader, { text: options.xTitle, style: { fg: axisColor } }]);
  }

  return out;
}
