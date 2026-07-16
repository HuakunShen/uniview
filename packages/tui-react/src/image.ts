import { useMemo, type ReactElement } from "react";
import { renderImage, type RgbaImage, type RgbColor } from "@uniview/tui-core";
import { renderNodeToElement } from "./content";

/** Props for {@link Image} — a raster image painted as half-block cells. */
export interface ImageProps {
  /** Decoded RGBA image (the plugin decodes; the renderer only paints pixels). */
  image: RgbaImage;
  /** Maximum width in terminal cells; the image fits inside, preserving aspect. */
  maxCols: number;
  /** Maximum height in terminal cells (rows). */
  maxRows: number;
  /** Background composited under transparent pixels / a padded bottom row. Default black. */
  background?: RgbColor;
}

/**
 * Display a raster image in the terminal with the universal half-block path:
 * fit → box-downsample → `▀` cells (fg = upper pixel, bg = lower pixel), so two
 * pixel rows share one text row at full color. Emits the same styled-lines tree
 * as the charts/canvas — no protocol primitive, no escape passthrough. Memoized
 * on its inputs like {@link Canvas}.
 */
export function Image({ image, maxCols, maxRows, background }: ImageProps): ReactElement {
  return useMemo(
    () => renderNodeToElement(renderImage(image, { maxCols, maxRows, background })),
    [image, maxCols, maxRows, background],
  );
}
