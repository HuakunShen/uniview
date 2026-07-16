import { useState, type ReactElement } from "react";
import { Box, Image, Text, useInput } from "@uniview/tui-react";
import type { NamedImage } from "./images";

export interface AppHost {
  quit: () => void;
}

/**
 * A terminal image viewer. Each image is an RGBA raster that `<Image>` box-
 * downsamples to fit the terminal and paints as half-block ▀ cells (fg = upper
 * pixel, bg = lower pixel — two pixel rows per text row).
 *   n / → : next image   ·   ← : previous   ·   q : quit
 */
export function App({
  cols,
  rows,
  host,
  images,
}: {
  cols: number;
  rows: number;
  host: AppHost;
  images: NamedImage[];
}): ReactElement {
  const [index, setIndex] = useState(0);
  const current = images[index]!;
  const many = images.length > 1;

  useInput((input, key) => {
    if (input === "q") host.quit();
    else if (many && (input === "n" || key.rightArrow)) setIndex((i) => (i + 1) % images.length);
    else if (many && key.leftArrow) setIndex((i) => (i - 1 + images.length) % images.length);
  });

  const hint = many ? "n: next · q: quit" : "q: quit";
  return (
    <Box flexDirection="column">
      <Text bold>
        {` ${current.name} — ${current.image.width}×${current.image.height}px → half-block ▀   (${hint}) `}
      </Text>
      <Image image={current.image} maxCols={cols} maxRows={Math.max(1, rows - 1)} />
    </Box>
  );
}
