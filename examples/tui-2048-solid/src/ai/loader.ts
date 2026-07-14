import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildValue, type Manifest } from "../vendor/model";
import { UniversalValue } from "../vendor/universal";

/**
 * Load the trained n-tuple weights from disk.
 *
 * The weights are ~84 MB and are NOT committed, so this is deliberately
 * optional: when the model is absent `loadModel` returns null and the game runs
 * as a normal human-playable 2048 — only AI mode is unavailable.
 *
 * The tables are stored sparsely and sharded (`lut{k}_{p}.bin`, each a
 * self-contained `uint32 idx ++ float32 val` sub-list) because a single table
 * exceeds the 25 MiB asset limit upstream. `buildValue` scatters the parts back
 * into dense Float32Arrays.
 */
export const DEFAULT_MODEL_DIR = fileURLToPath(new URL("../../model/", import.meta.url));

/** Where the weights live: `$UNIVIEW_2048_MODEL_DIR`, else `<package>/model/`. */
export function modelDir(): string {
  return process.env.UNIVIEW_2048_MODEL_DIR ?? DEFAULT_MODEL_DIR;
}

/** True when a usable model is present at {@link modelDir}. */
export function hasModel(dir: string = modelDir()): boolean {
  return existsSync(join(dir, "manifest.json"));
}

/**
 * Read the manifest + every LUT shard and rebuild the value function.
 * Returns null when no model is installed. Throws only if the model is present
 * but corrupt — a missing shard is a real error, not a reason to play dumb.
 */
export function loadModel(dir: string = modelDir()): UniversalValue | null {
  if (!hasModel(dir)) return null;

  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
  const buffers = manifest.patterns.map((_pattern, k) =>
    manifest.parts[k]!.map((_nnz, p) => {
      const raw = readFileSync(join(dir, `lut${k}_${p}.bin`));
      // Slice to a standalone ArrayBuffer: Node pools small Buffers, so
      // `raw.buffer` may be a shared arena much larger than this file.
      return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    }),
  );
  return buildValue(manifest, buffers);
}
