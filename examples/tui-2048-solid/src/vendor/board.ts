/**
 * Generic H×W 2048 engine — a TypeScript port of `src/game/board.py`.
 *
 * A board is a `Uint8Array(H*W)` of **exponents** in row-major order
 * (index = row*W + col): 0 = empty, k = tile 2^k. Unlike the original 4×4-only
 * engine (which used length-4 row lookup tables), this collapses each line with a
 * generic gather→merge→place pass, so it supports any board shape. The slide/merge
 * semantics are identical to the Python engine (`_move` / `collapse`), verified by
 * the golden-parity test on 4×4.
 *
 * Shape lives in an {@link Engine} instance; the encoding helpers and direction
 * constants below are shape-independent module exports.
 */

export type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

/** Directions in the exact order of Python's `DIRECTIONS` — matters for argmax tie-breaks. */
export const DIRS: readonly Dir[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const;

export type Board = Uint8Array; // length H*W, exponents 0..MAX_EXPONENT

export const MAX_EXPONENT = 17; // tiles up to 2^17 = 131072 (alphabet 18)

export interface MoveResult {
	after: Board;
	reward: number;
	changed: boolean;
}

/** A single tile's journey during a move: it slides from board cell `from` to `to`. */
export interface Slide {
	from: number;
	to: number;
	exp: number; // exponent *before* the move
	merged: boolean;
}

export interface MovePlan extends MoveResult {
	slides: Slide[];
}

/** An RNG returning a float in [0, 1). Defaults to `Math.random`. */
export type Rng = () => number;

export class Engine {
	readonly H: number;
	readonly W: number;
	readonly nCells: number;
	/** For each direction, the list of lines; each line is board indices in
	 *  collapse order (position 0 = the edge tiles slide toward). */
	private readonly lines: Record<Dir, number[][]>;

	constructor(H: number, W: number) {
		this.H = H;
		this.W = W;
		this.nCells = H * W;
		this.lines = this.buildLines();
	}

	private buildLines(): Record<Dir, number[][]> {
		const { H, W } = this;
		const idx = (r: number, c: number) => r * W + c;
		const up: number[][] = [];
		const down: number[][] = [];
		const left: number[][] = [];
		const right: number[][] = [];
		for (let r = 0; r < H; r++) {
			const row: number[] = [];
			for (let c = 0; c < W; c++) row.push(idx(r, c));
			left.push(row);
			right.push([...row].reverse());
		}
		for (let c = 0; c < W; c++) {
			const col: number[] = [];
			for (let r = 0; r < H; r++) col.push(idx(r, c));
			up.push(col);
			down.push([...col].reverse());
		}
		return { UP: up, DOWN: down, LEFT: left, RIGHT: right };
	}

	empty(): Board {
		return new Uint8Array(this.nCells) as Board;
	}

	/**
	 * Apply `dir`, returning the afterstate (no spawn), merge reward, and whether
	 * the board changed. Does not mutate `board`. Equivalent to
	 * `board.move(board, dir)` in Python.
	 */
	move(board: Board, dir: Dir): MoveResult {
		const after = this.empty();
		let reward = 0;
		let changed = false;
		for (const line of this.lines[dir]) {
			const n = line.length;
			// gather non-zero exponents nearest-wall-first (line is already ordered
			// so index 0 is the wall).
			let m = 0;
			const seq = new Array<number>(n);
			for (let j = 0; j < n; j++) {
				const v = board[line[j]];
				if (v !== 0) seq[m++] = v;
			}
			// merge equal neighbours once, writing straight into `after`.
			let k = 0;
			let i = 0;
			while (i < m) {
				if (i + 1 < m && seq[i] === seq[i + 1]) {
					const mv = seq[i] + 1;
					reward += 1 << mv;
					after[line[k++]] = mv;
					i += 2;
				} else {
					after[line[k++]] = seq[i];
					i += 1;
				}
			}
			// did this line change?
			for (let j = 0; j < n; j++) {
				if (after[line[j]] !== board[line[j]]) {
					changed = true;
					break;
				}
			}
		}
		return { after, reward, changed };
	}

	/** Like {@link move}, but records per-tile slides for animation. */
	planMove(board: Board, dir: Dir): MovePlan {
		const after = this.empty();
		let reward = 0;
		let changed = false;
		const slides: Slide[] = [];
		for (const line of this.lines[dir]) {
			const n = line.length;
			const tiles: { pos: number; exp: number }[] = [];
			for (let j = 0; j < n; j++) if (board[line[j]] !== 0) tiles.push({ pos: j, exp: board[line[j]] });
			let k = 0;
			let t = 0;
			while (t < tiles.length) {
				if (t + 1 < tiles.length && tiles[t].exp === tiles[t + 1].exp) {
					const mv = tiles[t].exp + 1;
					reward += 1 << mv;
					after[line[k]] = mv;
					slides.push({ from: line[tiles[t].pos], to: line[k], exp: tiles[t].exp, merged: true });
					slides.push({ from: line[tiles[t + 1].pos], to: line[k], exp: tiles[t + 1].exp, merged: true });
					k++;
					t += 2;
				} else {
					after[line[k]] = tiles[t].exp;
					slides.push({ from: line[tiles[t].pos], to: line[k], exp: tiles[t].exp, merged: false });
					k++;
					t += 1;
				}
			}
			for (let j = 0; j < n; j++) if (after[line[j]] !== board[line[j]]) { changed = true; break; }
		}
		return { after, reward, changed, slides };
	}

	/** All four afterstates, indexed by {@link DIRS} order. */
	allAfterstates(board: Board): MoveResult[] {
		return DIRS.map((d) => this.move(board, d));
	}

	/**
	 * Spawn one tile on a random empty cell: exponent 1 (tile 2) w.p. 0.9,
	 * exponent 2 (tile 4) w.p. 0.1. Mutates `board`; returns the cell index or -1.
	 */
	spawnCell(board: Board, rng: Rng = Math.random): number {
		let count = 0;
		for (let i = 0; i < this.nCells; i++) if (board[i] === 0) count++;
		if (count === 0) return -1;
		let pick = Math.floor(rng() * count);
		for (let i = 0; i < this.nCells; i++) {
			if (board[i] === 0 && pick-- === 0) {
				board[i] = rng() < 0.1 ? 2 : 1;
				return i;
			}
		}
		return -1;
	}

	spawn(board: Board, rng: Rng = Math.random): boolean {
		return this.spawnCell(board, rng) >= 0;
	}

	/** Fresh board with two tile-2s on distinct random cells. */
	initBoard(rng: Rng = Math.random): Board {
		const b = this.empty();
		const a = Math.floor(rng() * this.nCells);
		b[a] = 1;
		let c = Math.floor(rng() * (this.nCells - 1));
		if (c >= a) c++;
		b[c] = 1;
		return b;
	}

	/** Game over iff no empty cell and no orthogonally-adjacent equal pair. */
	isDone(board: Board): boolean {
		const { H, W } = this;
		for (let i = 0; i < this.nCells; i++) if (board[i] === 0) return false;
		for (let r = 0; r < H; r++)
			for (let c = 0; c < W - 1; c++)
				if (board[r * W + c] === board[r * W + c + 1]) return false;
		for (let r = 0; r < H - 1; r++)
			for (let c = 0; c < W; c++)
				if (board[r * W + c] === board[(r + 1) * W + c]) return false;
		return true;
	}

	hasWon(board: Board, goalExp = 11): boolean {
		for (let i = 0; i < this.nCells; i++) if (board[i] >= goalExp) return true;
		return false;
	}

	maxExp(board: Board): number {
		let m = 0;
		for (let i = 0; i < this.nCells; i++) if (board[i] > m) m = board[i];
		return m;
	}

	anyMove(board: Board): boolean {
		for (const d of DIRS) if (this.move(board, d).changed) return true;
		return false;
	}
}

// --------------------------------------------------------------------------- //
// Encoding helpers (shape-independent).
// --------------------------------------------------------------------------- //
export const expToTile = (e: number): number => (e === 0 ? 0 : 2 ** e);
export const tileToExp = (v: number): number => (v === 0 ? 0 : Math.round(Math.log2(v)));

export function tilesToBoard(tiles: ArrayLike<number>): Board {
	const b = new Uint8Array(tiles.length) as Board;
	for (let i = 0; i < tiles.length; i++) b[i] = tileToExp(tiles[i]);
	return b;
}

export function boardToTiles(board: ArrayLike<number>): number[] {
	const out = new Array<number>(board.length);
	for (let i = 0; i < board.length; i++) out[i] = expToTile(board[i]);
	return out;
}
