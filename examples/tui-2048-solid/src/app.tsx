import { Show, type JSX } from "solid-js";
import { Box, Panel, Sparkline, StatusBar, Text } from "@uniview/tui-solid";
import { BoardView } from "./board";
import type { Game } from "./game";
import type { Ai } from "./ai/controller";

const KEYS = [
  { label: "Move", keyHint: "↑↓←→" },
  { label: "AI", keyHint: "a" },
  { label: "Step", keyHint: "s" },
  { label: "New", keyHint: "n" },
  { label: "Quit", keyHint: "q" },
];

/** How many columns of sparkline fit inside the 24-wide panel. */
const CURVE_WIDTH = 20;

/**
 * Sparkline draws one glyph per value, and a long game runs to thousands of
 * moves — so the series is resampled down to the panel width rather than
 * overflowing it. Sampling (not truncating) keeps the shape of the whole game
 * visible instead of just its tail.
 */
function resample(series: readonly number[], width: number): number[] {
  if (series.length <= width) return [...series];
  const last = series.length - 1;
  return Array.from({ length: width }, (_, i) =>
    series[Math.round((i * last) / (width - 1))]!,
  );
}

/** Score / best / moves, plus the score curve as a sparkline. */
function Stats(props: { game: Game; ai: Ai }): JSX.Element {
  return (
    <Box flexDirection="column" gap={1}>
      <Panel title="Score" width={24} height={4}>
        <Box flexDirection="column">
          <Text bold>{`${props.game.score()}`}</Text>
          {/* Panel is 24 wide (22 inside the border) — keep this line shorter
              than that or it truncates mid-word. */}
          <Text dim>{`best ${props.game.best()} · ${props.game.moves()} moves`}</Text>
        </Box>
      </Panel>

      <Panel title="Score curve" width={24} height={5}>
        {/* The same Sparkline component the charts demo uses. */}
        <Sparkline values={resample(props.game.history(), CURVE_WIDTH)} />
      </Panel>

      <Panel
        title="AI"
        width={24}
        height={6}
        focused={props.ai.running()}
        focusedColor="green"
      >
        <Box flexDirection="column">
          <Show
            when={props.ai.available()}
            fallback={<Text dim>{"no model — human play"}</Text>}
          >
            <Text color={props.ai.running() ? "green" : undefined}>
              {props.ai.running() ? "▶ auto-playing" : "paused"}
            </Text>
            <Text dim>{`depth ${props.ai.depth()}`}</Text>
            <Text dim>{props.ai.lastMove() ? `last: ${props.ai.lastMove()}` : ""}</Text>
          </Show>
        </Box>
      </Panel>
    </Box>
  );
}

export function App(props: { game: Game; ai: Ai }): JSX.Element {
  const status = (): string => {
    if (props.game.over()) return "game over — press n for a new game";
    if (props.game.won()) return "2048! keep going";
    return "";
  };

  return (
    <Box flexDirection="column" width="100%" gap={1}>
      <Box flexDirection="row" gap={2}>
        <Panel title="2048" footer={status()} footerAlign="right">
          <BoardView
            board={props.game.board()}
            rows={props.game.engine.H}
            cols={props.game.engine.W}
          />
        </Panel>
        <Stats game={props.game} ai={props.ai} />
      </Box>
      <StatusBar items={KEYS} height={1} />
    </Box>
  );
}
