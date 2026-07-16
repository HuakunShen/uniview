import type { ReactElement } from "react";
import { Box, Text, animate } from "@uniview/tui-react";

/** A looping, ping-ponging bounce driven by `animate()` off the host FrameClock. */
export function App(): ReactElement {
  const w = animate("bar", 30, { from: 2, duration: 900, ease: "bounceOut", loop: true, alternate: true });
  return (
    <Box flexDirection="column">
      <Text>animate() — bouncing bar</Text>
      <Text color="accent">{"█".repeat(Math.max(0, Math.round(w)))}</Text>
    </Box>
  );
}
