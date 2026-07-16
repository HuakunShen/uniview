/**
 * Pattern compiler — a TypeScript port of `src/game/symmetry.py`,
 * `src/ntuple/pattern.py` and `src/ntuple/library.py`.
 *
 * Turns relative-coordinate patterns into concrete placements (flat cell indices)
 * for a given board shape, exactly as the Python compiler does — same D4
 * orientations, same de-dup, same per-instance cell ordering — so the tuple
 * indices computed here match the trained Python model bit-for-bit.
 */

export interface Pattern {
	id: string;
	cells: [number, number][]; // relative (row, col)
	alphabet: number;
}

/** Default CORE library (mirrors `library.CORE`), parameterised by alphabet. */
export function coreLibrary(alphabet: number): Pattern[] {
	return [
		{ id: 'square_2x2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], alphabet },
		{ id: 'line_4', cells: [[0, 0], [0, 1], [0, 2], [0, 3]], alphabet },
		{ id: 'l_4', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], alphabet },
		{ id: 'rect_2x3', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], alphabet },
		{ id: 'corner_6', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0], [1, 1]], alphabet }
	];
}

// The 8 elements of D4 acting on (r, c) — identical order to symmetry._D4.
const D4: ((r: number, c: number) => [number, number])[] = [
	(r, c) => [r, c],
	(r, c) => [c, -r],
	(r, c) => [-r, -c],
	(r, c) => [-c, r],
	(r, c) => [r, -c],
	(r, c) => [c, r],
	(r, c) => [-r, c],
	(r, c) => [-c, -r]
];

/** All distinct oriented footprints of `cells` under D4, normalised to the
 *  non-negative quadrant, same index order as input. Port of `orient_cells`. */
export function orientCells(cells: [number, number][]): [number, number][][] {
	const seen = new Set<string>();
	const out: [number, number][][] = [];
	for (const g of D4) {
		const pts = cells.map(([r, c]) => g(r, c));
		let minR = Infinity;
		let minC = Infinity;
		for (const [r, c] of pts) {
			if (r < minR) minR = r;
			if (c < minC) minC = c;
		}
		const norm = pts.map(([r, c]) => [r - minR, c - minC] as [number, number]);
		const key = norm.map(([r, c]) => `${r},${c}`).join(';');
		if (!seen.has(key)) {
			seen.add(key);
			out.push(norm);
		}
	}
	return out;
}

export interface CompiledPattern {
	cells: Int32Array; // [nInstances * L] flat board indices
	pow: Float64Array; // [L] mixed-radix weights (alphabet^j)
	L: number;
	nInstances: number;
}

/** Compile one pattern for an H×W board. Port of `compile_pattern`. */
export function compilePattern(pattern: Pattern, H: number, W: number): CompiledPattern {
	const L = pattern.cells.length;
	const pow = new Float64Array(L);
	for (let j = 0; j < L; j++) pow[j] = Math.pow(pattern.alphabet, j);

	const seen = new Set<string>();
	const rows: number[] = [];
	for (const oriented of orientCells(pattern.cells)) {
		let ph = 0;
		let pw = 0;
		for (const [r, c] of oriented) {
			if (r + 1 > ph) ph = r + 1;
			if (c + 1 > pw) pw = c + 1;
		}
		if (ph > H || pw > W) continue;
		for (let dr = 0; dr <= H - ph; dr++) {
			for (let dc = 0; dc <= W - pw; dc++) {
				const flat = oriented.map(([r, c]) => (r + dr) * W + (c + dc));
				const key = flat.join(',');
				if (seen.has(key)) continue;
				seen.add(key);
				for (const f of flat) rows.push(f);
			}
		}
	}
	const nInstances = rows.length / L;
	return { cells: Int32Array.from(rows), pow, L, nInstances };
}
