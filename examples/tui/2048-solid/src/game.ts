import { createSignal, type Accessor } from "solid-js";
import { Engine, expToTile, type Board, type Dir, type Rng } from "./vendor/board";

export interface GameOptions {
  rows?: number;
  cols?: number;
  /** Injectable RNG — pass a seeded one to make a game reproducible. */
  rng?: Rng;
  /** Exponent that counts as a win. Defaults to 11 (the 2048 tile). */
  goalExp?: number;
}

export interface Game {
  readonly engine: Engine;
  board: Accessor<Board>;
  score: Accessor<number>;
  /** Score after each move — the series behind the sparkline. */
  history: Accessor<readonly number[]>;
  best: Accessor<number>;
  moves: Accessor<number>;
  won: Accessor<boolean>;
  over: Accessor<boolean>;
  /** Play one move. Returns false when the move changes nothing (wall bump). */
  play(dir: Dir): boolean;
  reset(): void;
}

/**
 * The game controller: engine + reactive state, with no UI and no I/O.
 *
 * The RNG is injected rather than reaching for Math.random, so tests can seed it
 * and replay an identical game.
 */
export function createGame(options: GameOptions = {}): Game {
  const engine = new Engine(options.rows ?? 4, options.cols ?? 4);
  const rng: Rng = options.rng ?? Math.random;
  const goalExp = options.goalExp ?? 11;

  const [board, setBoard] = createSignal<Board>(engine.initBoard(rng));
  const [score, setScore] = createSignal(0);
  const [history, setHistory] = createSignal<readonly number[]>([0]);
  const [moves, setMoves] = createSignal(0);
  const [won, setWon] = createSignal(false);

  const best = (): number => expToTile(engine.maxExp(board()));
  const over = (): boolean => engine.isDone(board());

  const play = (dir: Dir): boolean => {
    if (engine.isDone(board())) return false;
    const { after, reward, changed } = engine.move(board(), dir);
    if (!changed) return false; // a move into a wall is not a turn

    engine.spawn(after, rng);
    const nextScore = score() + reward;
    setBoard(after);
    setScore(nextScore);
    setHistory((h) => [...h, nextScore]);
    setMoves((m) => m + 1);
    if (engine.hasWon(after, goalExp)) setWon(true);
    return true;
  };

  const reset = (): void => {
    setBoard(engine.initBoard(rng));
    setScore(0);
    setHistory([0]);
    setMoves(0);
    setWon(false);
  };

  return { engine, board, score, history, best, moves, won, over, play, reset };
}
