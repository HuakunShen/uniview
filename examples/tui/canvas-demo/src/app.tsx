import type { ReactElement } from "react";
import { Box, Canvas, Text } from "@uniview/tui-react";

/** A Canvas showcase: a sine wave (data-space via project), a circle and a frame. */
export function App(): ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Canvas &amp; shapes</Text>
      <Canvas
        width={48}
        height={14}
        xBounds={[0, Math.PI * 2]}
        yBounds={[-1, 1]}
        draw={(cv) => {
          // Frame + centre circle in pixel space.
          cv.rect(0, 0, cv.widthPx, cv.heightPx, { color: "blue" });
          cv.circle(cv.widthPx / 2, cv.heightPx / 2, Math.min(cv.widthPx, cv.heightPx) / 3, { color: "green" });
          // Sine wave in data space via the shared projection.
          let prev: [number, number] | undefined;
          for (let i = 0; i <= 96; i += 1) {
            const x = (i / 96) * Math.PI * 2;
            const p = cv.project(x, Math.sin(x));
            if (prev) cv.line(prev[0], prev[1], p[0], p[1], { color: "red" });
            prev = p;
          }
        }}
      />
    </Box>
  );
}
