import type { TuiInputEvent } from "@uniview/tui-core";
import type { Dir } from "./vendor/board";
import type { Game } from "./game";
import type { Ai } from "./ai/controller";

export interface Controls {
  game: Game;
  ai: Ai;
  quit: () => void;
}

const ARROWS: Record<string, Dir> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
};

/** vim keys, because this is a terminal. */
const VIM: Record<string, Dir> = { k: "UP", j: "DOWN", h: "LEFT", l: "RIGHT" };

/**
 * Map a terminal input event onto the game. Returns true if it was consumed.
 *
 * Named keys (arrows, Ctrl-C) arrive as `key` events; plain letters arrive as
 * `text` events — a distinction that is easy to get wrong and is why this lives
 * in its own tested module rather than inline in the boot file.
 */
export function handleKey(controls: Controls, event: TuiInputEvent): boolean {
  const { game, ai, quit } = controls;

  if (event.type === "key" && event.ctrl && event.key === "c") {
    quit();
    return true;
  }

  if (event.type === "key") {
    const dir = ARROWS[event.key];
    if (dir) {
      ai.stop(); // a human move takes the wheel back from the AI
      game.play(dir);
      return true;
    }
  }

  const letter = event.type === "text" ? event.text : "";
  if (letter === "") return false;

  const vimDir = VIM[letter];
  if (vimDir) {
    ai.stop();
    game.play(vimDir);
    return true;
  }

  switch (letter) {
    case "q":
      quit();
      return true;
    case "n":
      ai.stop();
      game.reset();
      return true;
    case "a":
      ai.toggle();
      return true;
    case "s":
      ai.step();
      return true;
    case "+":
      ai.setDepth(ai.depth() + 1);
      return true;
    case "-":
      ai.setDepth(ai.depth() - 1);
      return true;
    default:
      return false;
  }
}
