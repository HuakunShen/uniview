/**
 * Generic expectimax over afterstates — a port of `src/search/expectimax.py`.
 *
 * Alternates MAX nodes (our move) and CHANCE nodes (random spawn: 2 w.p. 0.9,
 * 4 w.p. 0.1). `depth == 1` reduces to greedy `a* = argmax_a [r + V(after)]`.
 * Works on any board shape via an {@link Engine}; adaptive depth uses the empty
 * **ratio** so large boards search shallow when open and deeper in the endgame.
 */
import { DIRS, type Board, type Dir, Engine } from './board';

/** Spawned tile as exponent + probability: 2 (exp 1) w.p. .9, 4 (exp 2) w.p. .1. */
const SPAWN_TILES: readonly [number, number][] = [
	[1, 0.9],
	[2, 0.1]
];

export interface DepthCfg {
	depth: number;
	/** `[maxEmptyRatio, depth]` rules (first match wins) overriding `depth`. */
	adaptive?: [number, number][];
	elseDepth?: number;
	maxChanceCells?: number;
}

export type ShapeValueFn = (board: Board) => number;

export class Expectimax {
	private tt = new Map<string, number>();

	constructor(
		private readonly engine: Engine,
		private readonly value: ShapeValueFn
	) {}

	private keyOf(board: Board, depth: number): string {
		let s = '';
		for (let i = 0; i < board.length; i++) s += String.fromCharCode(board[i] + 1);
		return s + ':' + depth;
	}

	private effectiveDepth(board: Board, cfg: DepthCfg): number {
		if (!cfg.adaptive || cfg.adaptive.length === 0) return cfg.depth;
		let nEmpty = 0;
		for (let i = 0; i < board.length; i++) if (board[i] === 0) nEmpty++;
		const ratio = nEmpty / board.length;
		for (const [maxRatio, d] of cfg.adaptive) if (ratio <= maxRatio) return d;
		return cfg.elseDepth ?? 1;
	}

	private evaluateAfterstate(after: Board, depth: number, maxChance: number): number {
		if (depth <= 0) return this.value(after);

		const key = this.keyOf(after, depth);
		const cached = this.tt.get(key);
		if (cached !== undefined) return cached;

		const empties: number[] = [];
		for (let i = 0; i < after.length; i++) if (after[i] === 0) empties.push(i);
		if (empties.length === 0) {
			const v = this.value(after);
			this.tt.set(key, v);
			return v;
		}

		const cells = empties.length > maxChance ? empties.slice(0, maxChance) : empties;
		let total = 0;
		for (const cell of cells) {
			for (const [tile, p] of SPAWN_TILES) {
				after[cell] = tile;
				total += p * this.bestActionValue(after, depth, maxChance);
				after[cell] = 0;
			}
		}
		const v = total / cells.length;
		this.tt.set(key, v);
		return v;
	}

	private bestActionValue(state: Board, depth: number, maxChance: number): number {
		let best = -Infinity;
		for (const d of DIRS) {
			const { after, reward, changed } = this.engine.move(state, d);
			if (!changed) continue;
			const val = reward + this.evaluateAfterstate(after, depth - 1, maxChance);
			if (val > best) best = val;
		}
		return best === -Infinity ? 0 : best;
	}

	getMove(board: Board, cfg: DepthCfg): { dir: Dir | null; value: number } {
		this.tt.clear();
		const depth = this.effectiveDepth(board, cfg);
		const maxChance = cfg.maxChanceCells ?? 8;
		let bestDir: Dir | null = null;
		let bestVal = -Infinity;
		for (const d of DIRS) {
			const { after, reward, changed } = this.engine.move(board, d);
			if (!changed) continue;
			const val = reward + this.evaluateAfterstate(after, depth - 1, maxChance);
			if (val > bestVal) {
				bestVal = val;
				bestDir = d;
			}
		}
		return { dir: bestDir, value: bestVal === -Infinity ? 0 : bestVal };
	}
}
