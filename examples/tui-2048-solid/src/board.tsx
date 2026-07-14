import { Index, type JSX } from "solid-js";
import type { Color } from "@uniview/tui-core";
import { Box, Text } from "@uniview/tui-solid";
import { boardToTiles, type Board } from "./vendor/board";

/** Cell geometry — a tile is 6 columns by 3 rows, which reads close to square. */
const TILE_W = 6;
const TILE_H = 3;

const EMPTY_BG: Color = { r: 0xcd, g: 0xc1, b: 0xb4 };
const BOARD_BG: Color = { r: 0xbb, g: 0xad, b: 0xa0 };
const DARK_FG: Color = { r: 0x77, g: 0x6e, b: 0x65 };
const LIGHT_FG: Color = { r: 0xf9, g: 0xf6, b: 0xf2 };

/** The classic 2048 palette, keyed by tile value. */
const TILE_BG: Record<number, Color> = {
  2: { r: 0xee, g: 0xe4, b: 0xda },
  4: { r: 0xed, g: 0xe0, b: 0xc8 },
  8: { r: 0xf2, g: 0xb1, b: 0x79 },
  16: { r: 0xf5, g: 0x95, b: 0x63 },
  32: { r: 0xf6, g: 0x7c, b: 0x5f },
  64: { r: 0xf6, g: 0x5e, b: 0x3b },
  128: { r: 0xed, g: 0xcf, b: 0x72 },
  256: { r: 0xed, g: 0xcc, b: 0x61 },
  512: { r: 0xed, g: 0xc8, b: 0x50 },
  1024: { r: 0xed, g: 0xc5, b: 0x3f },
  2048: { r: 0xed, g: 0xc2, b: 0x2e },
};
/** Anything past 2048 keeps going in near-black, as the web game does. */
const SUPER_BG: Color = { r: 0x3c, g: 0x3a, b: 0x32 };

function tileBackground(value: number): Color {
  if (value === 0) return EMPTY_BG;
  return TILE_BG[value] ?? SUPER_BG;
}

/** Small tiles keep the dark ink; from 8 up the tile is dark enough to invert. */
function tileForeground(value: number): Color {
  if (value === 0) return EMPTY_BG; // invisible: an empty cell shows no text
  return value <= 4 ? DARK_FG : LIGHT_FG;
}

/** Center a label in a fixed-width field (the terminal has no text-align). */
function center(label: string, width: number): string {
  const pad = Math.max(0, width - label.length);
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + label + " ".repeat(pad - left);
}

function Tile(props: { value: number }): JSX.Element {
  const label = (): string => (props.value === 0 ? "" : String(props.value));
  return (
    <Box
      width={TILE_W}
      height={TILE_H}
      flexDirection="column"
      backgroundColor={tileBackground(props.value)}
    >
      {/* A blank row above and below turns a 1-row label into a 3-row block. */}
      <Text backgroundColor={tileBackground(props.value)}>{" ".repeat(TILE_W)}</Text>
      <Text color={tileForeground(props.value)} bold backgroundColor={tileBackground(props.value)}>
        {center(label(), TILE_W)}
      </Text>
      <Text backgroundColor={tileBackground(props.value)}>{" ".repeat(TILE_W)}</Text>
    </Box>
  );
}

export interface BoardViewProps {
  board: Board;
  rows: number;
  cols: number;
}

/** The 2048 grid: one Box per tile, colored by value. */
export function BoardView(props: BoardViewProps): JSX.Element {
  const tiles = (): number[] => boardToTiles(props.board);
  const rowIndices = (): number[] => Array.from({ length: props.rows }, (_, r) => r);

  return (
    <Box flexDirection="column" backgroundColor={BOARD_BG} padding={1} gap={1}>
      <Index each={rowIndices()}>
        {(r) => (
          <Box flexDirection="row" gap={1}>
            <Index each={Array.from({ length: props.cols }, (_, c) => c)}>
              {(c) => <Tile value={tiles()[r() * props.cols + c()] ?? 0} />}
            </Index>
          </Box>
        )}
      </Index>
    </Box>
  );
}
