import { createSignal, type Accessor } from "solid-js";
import { Expectimax } from "../vendor/expectimax";
import type { Board, Dir } from "../vendor/board";
import type { Game } from "../game";
import { loadModel } from "./loader";

export interface Ai {
  /** False when no model is installed — the game is then human-only. */
  available: Accessor<boolean>;
  running: Accessor<boolean>;
  depth: Accessor<number>;
  lastMove: Accessor<Dir | null>;
  /** Play a single AI move. Returns false if it could not move. */
  step(): boolean;
  toggle(): void;
  stop(): void;
  setDepth(depth: number): void;
}

export interface AiOptions {
  depth?: number;
}

/**
 * Drives the game with the trained n-tuple + expectimax agent.
 *
 * Loading is lazy and failure is soft: with no model installed `available` is
 * false and every control is inert, so the game stays playable by hand rather
 * than refusing to start.
 */
export function createAi(game: Game, options: AiOptions = {}): Ai {
  const value = loadModel();
  const engine = game.engine;
  const agent =
    value === null
      ? null
      : new Expectimax(engine, (b: Board) => value.value(b, engine.H, engine.W));

  const [running, setRunning] = createSignal(false);
  const [depth, setDepth] = createSignal(options.depth ?? 2);
  const [lastMove, setLastMove] = createSignal<Dir | null>(null);

  const step = (): boolean => {
    if (agent === null || game.over()) return false;
    const { dir } = agent.getMove(game.board(), { depth: depth() });
    if (!dir) return false;
    setLastMove(dir);
    return game.play(dir);
  };

  return {
    available: () => agent !== null,
    running,
    depth,
    lastMove,
    step,
    toggle: () => {
      if (agent === null) return;
      setRunning((r) => !r);
    },
    stop: () => setRunning(false),
    setDepth: (d: number) => setDepth(Math.max(1, Math.min(4, d))),
  };
}
