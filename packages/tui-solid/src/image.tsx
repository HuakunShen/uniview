import { createMemo, type JSX } from "solid-js";
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
 * The Solid port of tui-react's `Image`: same half-block pipeline (fit →
 * box-downsample → `▀` cells with fg=upper px, bg=lower px), byte-identical SVG.
 * Props are never destructured (that would break fine-grained reactivity).
 */
export function Image(props: ImageProps): JSX.Element {
  const node = createMemo(() =>
    renderImage(props.image, {
      maxCols: props.maxCols,
      maxRows: props.maxRows,
      background: props.background,
    }),
  );
  return <>{renderNodeToElement(node())}</>;
}
