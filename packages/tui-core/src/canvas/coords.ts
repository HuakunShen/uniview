/**
 * Map a data value in `[bound[0], bound[1]]` to an integer dot index in
 * `[0, pixels-1]`, clamped to that range. Used to place data points onto a
 * {@link SubcellCanvas}'s dot grid and by {@link DrawContext.project}. Shared
 * with `@uniview/tui-charts` (which re-exports it).
 */
export function dataToPixel(
  value: number,
  bound: readonly [number, number],
  pixels: number,
): number {
  const [lo, hi] = bound;
  const max = pixels - 1;
  if (hi === lo) return Math.floor(max / 2);
  const raw = Math.round(((value - lo) / (hi - lo)) * max);
  return Math.max(0, Math.min(max, raw));
}
