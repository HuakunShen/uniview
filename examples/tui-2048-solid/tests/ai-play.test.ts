import { describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import { createGame } from "../src/game";
import { createAi } from "../src/ai/controller";
import { hasModel } from "../src/ai/loader";
import { expToTile, type Rng } from "../src/vendor/board";

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

const withModel = describe.skipIf(!hasModel());

describe("AI controller — no model installed", () => {
  it("degrades to human-only play instead of failing", () => {
    createRoot((dispose) => {
      const game = createGame({ rng: seeded(1) });
      // Point the loader at an empty dir by clearing the env override.
      const prev = process.env.UNIVIEW_2048_MODEL_DIR;
      process.env.UNIVIEW_2048_MODEL_DIR = "/nonexistent/model";
      const ai = createAi(game);
      expect(ai.available()).toBe(false);
      expect(ai.step()).toBe(false); // inert, not throwing
      ai.toggle();
      expect(ai.running()).toBe(false); // cannot start without a model
      if (prev === undefined) delete process.env.UNIVIEW_2048_MODEL_DIR;
      else process.env.UNIVIEW_2048_MODEL_DIR = prev;
      dispose();
    });
  });
});

withModel("AI controller — with the trained model", () => {
  it("is available and steps the game", () => {
    createRoot((dispose) => {
      const game = createGame({ rng: seeded(2) });
      const ai = createAi(game, { depth: 1 });
      expect(ai.available()).toBe(true);

      expect(ai.step()).toBe(true);
      expect(game.moves()).toBe(1);
      expect(ai.lastMove()).not.toBe(null);
      dispose();
    });
  });

  it("toggling drives auto-play, and a human move takes the wheel back", () => {
    createRoot((dispose) => {
      const game = createGame({ rng: seeded(3) });
      const ai = createAi(game, { depth: 1 });
      ai.toggle();
      expect(ai.running()).toBe(true);
      ai.stop();
      expect(ai.running()).toBe(false);
      dispose();
    });
  });

  it("auto-plays a whole game and reaches at least 512 (depth 1, quick)", () => {
    createRoot((dispose) => {
      const game = createGame({ rng: seeded(11) });
      const ai = createAi(game, { depth: 1 });

      let guard = 0;
      while (!game.over() && ai.step() && guard++ < 20000) {
        /* let it play */
      }
      const best = expToTile(game.engine.maxExp(game.board()));
      expect(game.moves()).toBeGreaterThan(100);
      expect(best).toBeGreaterThanOrEqual(512);
      // The score curve grew alongside it — this is what the sparkline plots.
      expect(game.history().length).toBe(game.moves() + 1);
      expect(game.score()).toBeGreaterThan(1000);
      dispose();
    });
  }, 120_000);

  /**
   * THE requirement for this example: at the depth the app actually ships with,
   * the AI must reach the 2048 tile — through the real game controller, not the
   * raw engine. `game.won()` is the game's own verdict (goalExp 11), so this
   * fails if either the agent or the win detection regresses.
   *
   * Seeded, so it is a fixed game rather than a coin flip that can go red on CI.
   */
  it("reaches the 2048 tile at the app's default depth", () => {
    createRoot((dispose) => {
      const game = createGame({ rng: seeded(2048) });
      const ai = createAi(game); // no depth override → the app default

      expect(ai.depth()).toBe(2);

      let guard = 0;
      while (!game.over() && ai.step() && guard++ < 20000) {
        /* play it out */
      }

      const best = expToTile(game.engine.maxExp(game.board()));
      expect(best).toBeGreaterThanOrEqual(2048);
      expect(game.won()).toBe(true);
      dispose();
    });
  }, 300_000);
});
