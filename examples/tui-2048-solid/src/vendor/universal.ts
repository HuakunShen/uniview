/**
 * Universal N-tuple value function — a TypeScript port of the base path of
 * `src/ntuple/universal_value.py`.
 *
 *   V(B) = Σ_k (1 / |Π_k|) · Σ_{p ∈ Π_k} T_k(x_{k,p})
 *
 * one shared table `T_k` per pattern, placement-mean over the placements compiled
 * for the current H×W. This is the same value the Python model evaluates (the
 * residual head is training-only and omitted here). Tables are dense
 * `Float32Array`s reconstructed from the sparse export.
 */

import { compilePattern, type Pattern, type CompiledPattern } from './patterns';

export class UniversalValue {
	readonly patterns: Pattern[];
	readonly luts: Float32Array[]; // one dense table per pattern
	readonly alphabet: number;
	readonly maxExp: number;
	private cache = new Map<string, CompiledPattern[]>();

	constructor(patterns: Pattern[], luts: Float32Array[]) {
		if (patterns.length !== luts.length) throw new Error('patterns/luts length mismatch');
		this.patterns = patterns;
		this.luts = luts;
		this.alphabet = patterns[0].alphabet;
		this.maxExp = this.alphabet - 1;
	}

	/** Compiled placements for a shape (cached). */
	compiledFor(H: number, W: number): CompiledPattern[] {
		const key = `${H}x${W}`;
		let c = this.cache.get(key);
		if (!c) {
			c = this.patterns.map((p) => compilePattern(p, H, W));
			this.cache.set(key, c);
		}
		return c;
	}

	value(board: ArrayLike<number>, H: number, W: number): number {
		const compiled = this.compiledFor(H, W);
		const maxExp = this.maxExp;
		let total = 0;
		for (let k = 0; k < compiled.length; k++) {
			const cp = compiled[k];
			if (cp.nInstances === 0) continue;
			const lut = this.luts[k];
			const cells = cp.cells;
			const pow = cp.pow;
			const L = cp.L;
			let s = 0;
			for (let inst = 0; inst < cp.nInstances; inst++) {
				const base = inst * L;
				let idx = 0;
				for (let j = 0; j < L; j++) {
					let e = board[cells[base + j]];
					if (e > maxExp) e = maxExp;
					idx += e * pow[j];
				}
				s += lut[idx];
			}
			total += s / cp.nInstances;
		}
		return total;
	}
}

/** Table size for a pattern: alphabet^L. */
export function tableSize(p: Pattern): number {
	return Math.pow(p.alphabet, p.cells.length);
}

/** Scatter sparse `(index, value)` pairs into a dense table: `lut[index[i]] = value[i]`. */
export function scatterInto(lut: Float32Array, indices: Uint32Array, values: Float32Array): void {
	for (let i = 0; i < indices.length; i++) lut[indices[i]] = values[i];
}
