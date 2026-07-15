import { describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import { createGame } from "../src/game";
import { boardToTiles, type Rng } from "../src/vendor/board";

/** A small deterministic PRNG (mulberry32) so a game replays identically. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run inside a root so signals have an owner and can be disposed. */
function withGame<T>(fn: (game: ReturnType<typeof createGame>) => T, seed = 42): T {
  return createRoot((dispose) => {
    const game = createGame({ rng: seeded(seed) });
    const out = fn(game);
    dispose();
    return out;
  });
}

describe("game controller", () => {
  it("starts with two tiles, zero score, not over", () => {
    withGame((game) => {
      const tiles = boardToTiles(game.board());
      expect(tiles.filter((t) => t !== 0)).toHaveLength(2);
      expect(game.score()).toBe(0);
      expect(game.moves()).toBe(0);
      expect(game.over()).toBe(false);
      expect(game.won()).toBe(false);
    });
  });

  /**
   * Bumping into a wall must not consume a turn — otherwise it would spawn a
   * free tile and the player could stall the board by holding one direction.
   */
  it("a move that changes nothing is not a turn (no tile spawns)", () => {
    withGame((game) => {
      // Play LEFT until it stops changing anything.
      let guard = 0;
      while (game.play("LEFT") && guard++ < 200) {
        /* keep packing left */
      }
      expect(game.moves()).toBeGreaterThan(0);

      const movesBefore = game.moves();
      const scoreBefore = game.score();
      const tilesBefore = boardToTiles(game.board());

      expect(game.play("LEFT")).toBe(false); // the no-op is reported
      expect(game.moves()).toBe(movesBefore); // …and did not consume a turn
      expect(game.score()).toBe(scoreBefore);
      expect(boardToTiles(game.board())).toEqual(tilesBefore); // no free spawn
    });
  });

  it("scores a merge and records it in the history series", () => {
    withGame((game) => {
      const scores: number[] = [];
      for (let i = 0; i < 40; i += 1) {
        for (const dir of ["LEFT", "UP", "RIGHT", "DOWN"] as const) {
          if (game.play(dir)) scores.push(game.score());
        }
      }
      expect(game.score()).toBeGreaterThan(0); // merges happened
      expect(game.moves()).toBeGreaterThan(0);
      // history starts at 0 and gains one entry per successful move
      expect(game.history()[0]).toBe(0);
      expect(game.history()).toHaveLength(game.moves() + 1);
      // the score series is monotonically non-decreasing
      const h = game.history();
      for (let i = 1; i < h.length; i += 1) expect(h[i]!).toBeGreaterThanOrEqual(h[i - 1]!);
    });
  });

  it("is deterministic for a given seed", () => {
    const run = (): { tiles: number[]; score: number } =>
      withGame((game) => {
        for (let i = 0; i < 30; i += 1) {
          for (const dir of ["LEFT", "UP", "RIGHT", "DOWN"] as const) game.play(dir);
        }
        return { tiles: boardToTiles(game.board()), score: game.score() };
      }, 7);
    expect(run()).toEqual(run());
  });

  it("reset clears score, moves and history", () => {
    withGame((game) => {
      for (let i = 0; i < 20; i += 1) {
        for (const dir of ["LEFT", "UP", "RIGHT", "DOWN"] as const) game.play(dir);
      }
      expect(game.moves()).toBeGreaterThan(0);

      game.reset();
      expect(game.score()).toBe(0);
      expect(game.moves()).toBe(0);
      expect(game.history()).toEqual([0]);
      expect(boardToTiles(game.board()).filter((t) => t !== 0)).toHaveLength(2);
    });
  });

  it("tracks the best tile", () => {
    withGame((game) => {
      expect(game.best()).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < 50; i += 1) {
        for (const dir of ["LEFT", "UP", "RIGHT", "DOWN"] as const) game.play(dir);
      }
      expect(game.best()).toBeGreaterThanOrEqual(8);
    });
  });
});
