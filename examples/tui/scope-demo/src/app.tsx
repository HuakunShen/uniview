import { useState, type ReactElement } from "react";
import { Box, Canvas, Text, useAnimation, useInput } from "@uniview/tui-react";
import { MODES } from "./scopes";
import { synthFrame } from "./signal";

export interface AppHost {
  quit: () => void;
}

/** Samples generated per frame — enough for the FFT and the scope window. */
const BLOCK = 2048;

/**
 * A terminal audio scope — three Tab-cycled full-screen modes (Oscilloscope /
 * Vectorscope / Spectroscope), each drawn on a braille `<Canvas>` fed by a
 * synthetic stereo source. The frame loop is `useAnimation()` over the host
 * `FrameClock`: every frame regenerates the signal at the current time and
 * repaints locally — no per-frame RPC. Modelled on ratatui `scope-tui`.
 *
 *   Tab / 1·2·3 : switch mode   ·   q : quit
 */
export function App({
  cols,
  rows,
  host,
}: {
  cols: number;
  rows: number;
  host: AppHost;
}): ReactElement {
  const [modeIndex, setModeIndex] = useState(0);
  const { time } = useAnimation();
  const mode = MODES[modeIndex]!;

  useInput((input, key) => {
    if (input === "q") host.quit();
    else if (key.tab) setModeIndex((i) => (i + (key.shift ? MODES.length - 1 : 1)) % MODES.length);
    else if (input >= "1" && input <= String(MODES.length)) setModeIndex(Number(input) - 1);
  });

  const frame = synthFrame(time / 1000, BLOCK);
  const bounds = mode.bounds(frame);
  const width = Math.max(8, cols - 2);
  const height = Math.max(4, rows - 4);

  return (
    <Box flexDirection="column" padding={0}>
      <Box flexDirection="row">
        {MODES.map((m, i) => (
          <Text key={m.id} bold={i === modeIndex} color={i === modeIndex ? "green" : "gray"}>
            {` ${i + 1} ${m.name} `}
          </Text>
        ))}
        <Text color="gray">{"   Tab: switch · q: quit"}</Text>
      </Box>
      <Canvas
        width={width}
        height={height}
        marker="braille"
        xBounds={bounds.x}
        yBounds={bounds.y}
        draw={(cv) => mode.draw(cv, frame)}
      />
      <Text color="gray">{` ${mode.hint}`}</Text>
      <Text>{` ${mode.readout(frame)}`}</Text>
    </Box>
  );
}
