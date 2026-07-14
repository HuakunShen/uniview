import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiSolidRoot } from "@uniview/tui-solid";
import { App } from "./app";
import { createGame } from "./game";
import { createAi } from "./ai/controller";
import { handleKey } from "./keys";

/**
 * 2048 in the terminal, authored in Solid, with the real trained n-tuple +
 * expectimax agent behind AI mode.
 *
 *   pnpm --filter @uniview/tui-2048-solid dev
 *
 *   ↑↓←→ move · a: toggle AI · s: single AI step · n: new game · q/Ctrl-C: quit
 *
 * The weights are not committed. Without them the game is still fully playable;
 * only AI mode is unavailable (see README).
 */
const columns = process.stdout.columns ?? 80;
const rows = process.stdout.rows ?? 24;
const ONCE = !process.stdout.isTTY || process.env.UNIVIEW_DEMO_ONCE === "1";

const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (chunk) => process.stdout.write(chunk), styles });
const root = createTuiSolidRoot({ surface, styles, size: { width: columns, height: rows } });

const game = createGame();
const ai = createAi(game);

let started = false;
const quit = (): void => {
  ai.stop();
  root.destroy();
  if (started) driver.stop();
  process.exit(0);
};

const driver = new TerminalDriver({
  input: process.stdin,
  output: process.stdout,
  mouse: "off", // keyboard-only game
  onEvent: (event) => {
    if (event.type === "resize") {
      root.host.renderer.resize({ width: event.width, height: event.height });
      return;
    }
    handleKey({ game, ai, quit }, event);
  },
});

if (!ONCE) {
  driver.start();
  started = true;
  process.stdin.on?.("end", quit);
}

// Mounted once; signal writes drive every later frame.
root.render(() => <App game={game} ai={ai} />);

/**
 * The auto-play pump. A timer rather than a tight loop so the terminal keeps
 * repainting and keys stay responsive between moves — at depth 2 a move costs
 * roughly half a millisecond, so the delay is what makes it watchable, not a
 * performance limit.
 */
const AI_MOVE_DELAY_MS = 60;
if (!ONCE) {
  setInterval(() => {
    if (!ai.running()) return;
    if (game.over() || !ai.step()) ai.stop();
  }, AI_MOVE_DELAY_MS);
}

if (ONCE) setTimeout(quit, 300);
