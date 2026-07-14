import { describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiSolidRoot } from "@uniview/tui-solid";
import { App } from "../src/app";
import { createGame, type Game } from "../src/game";
import { createAi, type Ai } from "../src/ai/controller";
import { handleKey } from "../src/keys";
import { boardToTiles, type Rng } from "../src/vendor/board";

const tick = async () => {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

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

function mount(seed = 3) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width: 80, height: 24 } });
  let game!: Game;
  let ai!: Ai;
  const dispose = createRoot((d) => {
    game = createGame({ rng: seeded(seed) });
    ai = createAi(game);
    return d;
  });
  root.render(() => <App game={game} ai={ai} />);
  return { root, surface, styles, game, ai, dispose };
}

const key = (k: string): TuiInputEvent => ({
  type: "key",
  key: k,
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
});
const text = (t: string): TuiInputEvent => ({ type: "text", text: t });

describe("2048 app", () => {
  it("renders the board, the score panel and the status bar", async () => {
    const { root, surface, dispose } = mount();
    await tick();
    const out = surface.text({ trimRight: true });

    expect(out).toContain("2048"); // panel title
    expect(out).toContain("Score");
    expect(out).toContain("Move: ↑↓←→"); // status bar
    expect(out).toContain("AI: a");
    expect(out).toContain("2"); // the two starting tiles
    root.destroy();
    dispose();
  });

  it("an arrow key moves the board and updates the rendered score", async () => {
    const { root, surface, game, ai, dispose } = mount();
    await tick();
    const before = boardToTiles(game.board());

    // Play until something actually changes (a fresh board may no-op one way).
    for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) {
      handleKey({ game, ai, quit: () => {} }, key(k));
      if (boardToTiles(game.board()).join() !== before.join()) break;
    }
    await tick();

    expect(game.moves()).toBeGreaterThan(0);
    expect(boardToTiles(game.board()).join()).not.toBe(before.join());
    // The surface reflects the new state — reactivity through to the terminal.
    expect(surface.text({ trimRight: true })).toContain(String(game.score()));
    root.destroy();
    dispose();
  });

  it("n starts a new game", async () => {
    const { root, game, ai, dispose } = mount();
    await tick();
    for (let i = 0; i < 20; i += 1) {
      for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) {
        handleKey({ game, ai, quit: () => {} }, key(k));
      }
    }
    expect(game.moves()).toBeGreaterThan(0);

    handleKey({ game, ai, quit: () => {} }, text("n"));
    await tick();
    expect(game.moves()).toBe(0);
    expect(game.score()).toBe(0);
    root.destroy();
    dispose();
  });

  it("q quits", async () => {
    const { root, game, ai, dispose } = mount();
    await tick();
    let quit = 0;
    expect(handleKey({ game, ai, quit: () => (quit += 1) }, text("q"))).toBe(true);
    expect(quit).toBe(1);
    root.destroy();
    dispose();
  });

  it("vim keys move too", async () => {
    const { root, game, ai, dispose } = mount();
    await tick();
    const consumed = handleKey({ game, ai, quit: () => {} }, text("h"));
    expect(consumed).toBe(true);
    root.destroy();
    dispose();
  });

  it("ignores keys it does not own", async () => {
    const { root, game, ai, dispose } = mount();
    await tick();
    expect(handleKey({ game, ai, quit: () => {} }, text("z"))).toBe(false);
    root.destroy();
    dispose();
  });

  it("shows a game-over footer once the board is dead", async () => {
    const { root, surface, game, ai, dispose } = mount();
    await tick();
    // Hammer the board until it dies (a seeded game always terminates).
    let guard = 0;
    while (!game.over() && guard++ < 5000) {
      for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) {
        handleKey({ game, ai, quit: () => {} }, key(k));
        if (game.over()) break;
      }
    }
    expect(game.over()).toBe(true);
    await tick();
    expect(surface.text({ trimRight: true })).toContain("game over");
    root.destroy();
    dispose();
  });
});
