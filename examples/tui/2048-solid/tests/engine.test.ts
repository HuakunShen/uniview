import { describe, expect, it } from "vitest";
import {
  boardToTiles,
  DIRS,
  Engine,
  expToTile,
  tilesToBoard,
  type Board,
  type Dir,
} from "../src/vendor/board";
import golden from "./fixtures/engine-golden.json";

/**
 * The engine is vendored verbatim from the training repo, where it is a port of
 * the Python RL environment. `engine-golden.json` is that Python reference's
 * output: 204 boards, each with the result of all four moves. Replaying it here
 * is what proves the port is faithful rather than merely plausible — 816 move
 * cases, not a handful of hand-written ones.
 */
interface GoldenMove {
  after: number[];
  reward: number;
  changed: boolean;
}
interface GoldenBoard {
  tiles: number[];
  value: number;
  moves: Record<string, GoldenMove>;
}
const boards = golden.boards as GoldenBoard[];

const eng = new Engine(4, 4);
const fromTiles = (rows: number[][]): Board => tilesToBoard(rows.flat());

describe("engine — golden parity with the Python reference", () => {
  it("has a non-trivial fixture", () => {
    expect(boards.length).toBeGreaterThan(200);
  });

  it("reproduces every move of all 204 golden boards", () => {
    let cases = 0;
    for (const [i, entry] of boards.entries()) {
      const board = tilesToBoard(entry.tiles);
      for (const dir of DIRS) {
        const expected = entry.moves[dir];
        expect(expected, `board ${i} missing dir ${dir}`).toBeDefined();
        const { after, reward, changed } = eng.move(board, dir as Dir);
        expect(boardToTiles(after), `board ${i} dir ${dir} after`).toEqual(expected!.after);
        expect(reward, `board ${i} dir ${dir} reward`).toBe(expected!.reward);
        expect(changed, `board ${i} dir ${dir} changed`).toBe(expected!.changed);
        cases += 1;
      }
    }
    expect(cases).toBe(boards.length * 4);
  });
});

describe("engine — move semantics", () => {
  it("slides and merges a row leftward", () => {
    const { after, reward, changed } = eng.move(
      fromTiles([
        [2, 2, 4, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      "LEFT",
    );
    expect(boardToTiles(after).slice(0, 4)).toEqual([4, 4, 0, 0]);
    expect(reward).toBe(4);
    expect(changed).toBe(true);
  });

  it("merges four equal tiles into two (no double-merge)", () => {
    const { after, reward } = eng.move(
      fromTiles([
        [4, 4, 4, 4],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      "LEFT",
    );
    expect(boardToTiles(after).slice(0, 4)).toEqual([8, 8, 0, 0]);
    expect(reward).toBe(16);
  });

  it("reports changed=false for a no-op move", () => {
    const { changed, reward } = eng.move(
      fromTiles([
        [4, 2, 4, 2],
        [2, 4, 2, 4],
        [4, 2, 4, 2],
        [2, 4, 2, 4],
      ]),
      "LEFT",
    );
    expect(changed).toBe(false);
    expect(reward).toBe(0);
  });

  it("does not mutate the input board", () => {
    const board = fromTiles([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const before = Array.from(board);
    eng.move(board, "LEFT");
    expect(Array.from(board)).toEqual(before);
  });
});

describe("engine — lifecycle", () => {
  it("initBoard places exactly two tiles", () => {
    const tiles = boardToTiles(eng.initBoard(() => 0.5));
    expect(tiles.filter((t) => t !== 0)).toHaveLength(2);
    expect(tiles.filter((t) => t === 0)).toHaveLength(14);
  });

  it("spawn fills exactly one empty cell with a 2 or a 4", () => {
    const board = fromTiles([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 4096],
      [2, 4, 8, 0], // one empty cell
    ]);
    expect(eng.spawn(board, () => 0.5)).toBe(true);
    const tiles = boardToTiles(board);
    expect(tiles[15] === 2 || tiles[15] === 4).toBe(true);
  });

  it("isDone on a full unmergeable board", () => {
    const dead = fromTiles([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(eng.isDone(dead)).toBe(true);

    const alive = fromTiles([
      [2, 2, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(eng.isDone(alive)).toBe(false);
  });

  it("tile ⇄ exponent helpers round-trip", () => {
    expect(expToTile(0)).toBe(0);
    expect(expToTile(11)).toBe(2048);
    expect(boardToTiles(tilesToBoard([0, 2, 4, 2048]))).toEqual([0, 2, 4, 2048]);
  });

  /** The engine is variable-grid: one code path serves every board shape. */
  it("supports non-square boards", () => {
    const e34 = new Engine(3, 4);
    expect(e34.H).toBe(3);
    expect(e34.W).toBe(4);
    const b = e34.initBoard(() => 0.5);
    expect(b.length).toBe(12);
    expect(boardToTiles(b).filter((t) => t !== 0)).toHaveLength(2);
  });
});
