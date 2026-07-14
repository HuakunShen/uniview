
/** Eighth-block glyphs, index 0..8 (empty → full), growing upward. */
export const VERTICAL_BLOCKS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;
/** Eighth-block glyphs, index 0..8 (empty → full), growing rightward. */
export const HORIZONTAL_BLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;

const clamp8 = (n: number): number => Math.max(0, Math.min(8, n));

/** Glyphs (top row first) for one vertical bar of `value∈[0,max]` over `height` rows. */
export function verticalBarColumn(value: number, max: number, height: number): string[] {
  const eighths =
    !Number.isFinite(value) || !Number.isFinite(max) || max <= 0
      ? 0
      : Math.max(0, Math.min(height * 8, Math.round((value / max) * height * 8)));
  const rows: string[] = [];
  for (let fromBottom = height - 1; fromBottom >= 0; fromBottom -= 1) {
    rows.push(VERTICAL_BLOCKS[clamp8(eighths - fromBottom * 8)]!);
  }
  return rows;
}

/** A `width`-cell string for a horizontal bar of `value∈[0,max]`, filled left→right. */
export function horizontalBarCells(value: number, max: number, width: number): string {
  const eighths =
    !Number.isFinite(value) || !Number.isFinite(max) || max <= 0
      ? 0
      : Math.max(0, Math.min(width * 8, Math.round((value / max) * width * 8)));
  let out = "";
  for (let cell = 0; cell < width; cell += 1) out += HORIZONTAL_BLOCKS[clamp8(eighths - cell * 8)]!;
  return out;
}
