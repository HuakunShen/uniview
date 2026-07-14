/**
 * Load the exported Universal model (manifest + sparse, chunked tables) into a
 * {@link UniversalValue}. Shared by the Web Worker and the Node tests.
 *
 * Large per-pattern tables are split into parts < 25 MiB (Cloudflare asset
 * limit); each part is a self-contained `uint32 idx ++ float32 val` sub-list
 * that scatters into the same dense table.
 */
import { UniversalValue } from './universal';
import type { Pattern } from './patterns';

export interface Manifest {
	alphabet: number;
	patterns: { id: string; cells: [number, number][] }[];
	tableSizes: number[];
	parts: number[][]; // parts[k] = [nnz per part] for table k
	shapes: string[];
}

export function patternsFromManifest(m: Manifest): Pattern[] {
	return m.patterns.map((p) => ({ id: p.id, cells: p.cells, alphabet: m.alphabet }));
}

/** Scatter one part buffer (`uint32 idx ++ f32 val`) into a dense table. */
export function scatterPart(lut: Float32Array, buf: ArrayBuffer, nnz: number): void {
	const indices = new Uint32Array(buf, 0, nnz);
	const values = new Float32Array(buf, nnz * 4, nnz);
	for (let i = 0; i < nnz; i++) lut[indices[i]] = values[i];
}

/** Reconstruct one dense table from its part buffers. */
export function reconstructTable(size: number, partBufs: ArrayBuffer[], partNnz: number[]): Float32Array {
	const lut = new Float32Array(size);
	for (let p = 0; p < partBufs.length; p++) scatterPart(lut, partBufs[p], partNnz[p]);
	return lut;
}

/** Build a UniversalValue from a manifest + per-pattern part buffers. */
export function buildValue(manifest: Manifest, buffers: ArrayBuffer[][]): UniversalValue {
	const luts = manifest.tableSizes.map((size, k) =>
		reconstructTable(size, buffers[k], manifest.parts[k])
	);
	return new UniversalValue(patternsFromManifest(manifest), luts);
}
