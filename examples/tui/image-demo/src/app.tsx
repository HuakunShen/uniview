import { useMemo, useState, type ReactElement } from "react";
import { Box, Image, Text, useInput } from "@uniview/tui-react";
import { gallery } from "./images";

export interface AppHost {
  quit: () => void;
}

/**
 * A terminal image viewer. Each built-in image is a large RGBA raster that
 * `<Image>` box-downsamples to fit the terminal and paints as half-block ▀
 * cells (fg = upper pixel, bg = lower pixel — two pixel rows per text row).
 *   n / → : next image   ·   q : quit
 */
export function App({ cols, rows, host }: { cols: number; rows: number; host: AppHost }): ReactElement {
  const images = useMemo(() => gallery(256), []);
  const [index, setIndex] = useState(0);
  const current = images[index]!;

  useInput((input, key) => {
    if (input === "q") host.quit();
    else if (input === "n" || key.rightArrow) setIndex((i) => (i + 1) % images.length);
    else if (key.leftArrow) setIndex((i) => (i - 1 + images.length) % images.length);
  });

  return (
    <Box flexDirection="column">
      <Text bold>
        {` ${current.name} — ${current.image.width}×${current.image.height}px → half-block ▀   (n: next · q: quit) `}
      </Text>
      <Image image={current.image} maxCols={cols} maxRows={Math.max(1, rows - 1)} />
    </Box>
  );
}
