import type { DrawContext, DrawStyle } from "./draw";

/**
 * A coarse world outline as `[lon°, lat°]` points (lon −180..180, lat −90..90).
 * This is a SEED set — enough to prove the shape end-to-end; drop in a denser
 * ratatui-style table (WORLD_LOW/HIGH_RESOLUTION) for a real map. Plotted via
 * {@link DrawContext.project}, so the caller sets xBounds/yBounds to the globe.
 */
export const WORLD_MAP_POINTS: readonly (readonly [number, number])[] = [
  // Americas
  [-150, 60], [-120, 50], [-100, 40], [-90, 30], [-80, 25], [-70, 10],
  [-60, 0], [-70, -20], [-70, -40], [-65, -50],
  // Europe / Africa
  [0, 50], [10, 45], [15, 35], [20, 10], [25, 0], [30, -20], [25, -34],
  [-10, 15], [0, 5],
  // Asia / Oceania
  [40, 55], [60, 45], [90, 30], [110, 20], [120, 35], [140, 40],
  [100, -5], [135, -25], [150, -35], [175, -40],
];

/**
 * Plot the world outline onto a Canvas. Coordinates map through `cv.project`,
 * so set `xBounds: [-180, 180]`, `yBounds: [-90, 90]` on the Canvas.
 */
export function drawWorldMap(cv: DrawContext, style?: DrawStyle): void {
  for (const [lon, lat] of WORLD_MAP_POINTS) {
    const [px, py] = cv.project(lon, lat);
    cv.set(px, py, style);
  }
}
