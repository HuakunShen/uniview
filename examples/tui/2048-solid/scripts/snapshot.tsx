import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoot } from "solid-js";
import { StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiSolidRoot } from "@uniview/tui-solid";
import { App } from "../src/app";
import { createGame } from "../src/game";
import { createAi } from "../src/ai/controller";
import type { Rng } from "../src/vendor/board";

/**
 * Render the game to an SVG the docs can embed.
 *
 * `SvgCellSurface` is a drop-in for the ANSI surface — the app is identical, only
 * the surface changes — so what lands in the docs is the real component tree, not
 * a mock-up that can drift from it.
 *
 *   pnpm --filter @uniview/tui-2048-solid snapshot
 */
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/public/tui/2048-solid.svg",
);

/** Seeded so the committed image is stable — a rerun must not churn the diff. */
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

const styles = new StyleTable();
const surface = new SvgCellSurface({ styles });
const root = createTuiSolidRoot({ surface, styles, size: { width: 80, height: 22 } });

createRoot(() => {
  const game = createGame({ rng: seeded(2048) });
  const ai = createAi(game); // depth 2 — the app default

  // Let the trained agent play to the 2048 tile, so the docs show a real board.
  let guard = 0;
  while (!game.over() && !game.won() && ai.step() && guard++ < 20000) {
    /* play */
  }

  root.render(() => <App game={game} ai={ai} />);

  setTimeout(() => {
    const svg = surface.toSVG();
    if (!svg) throw new Error("no frame was presented");
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, svg);
    console.log(`wrote ${OUT} (${svg.length} bytes, won=${game.won()}, score=${game.score()})`);
    process.exit(0);
  }, 200);
});
