import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const modelDirectory = resolve(import.meta.dirname, "../model");
const manifestPath = join(modelDirectory, "manifest.json");

if (!existsSync(manifestPath)) {
  throw new Error(`Cannot pack @uniview/tui-2048 without ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const requiredFiles = ["manifest.json", "golden.json"];

for (const [patternIndex, parts] of manifest.parts.entries()) {
  for (const partIndex of parts.keys()) {
    requiredFiles.push(`lut${patternIndex}_${partIndex}.bin`);
  }
}

const missingFiles = requiredFiles.filter(
  (filename) => !existsSync(join(modelDirectory, filename)),
);

if (missingFiles.length > 0) {
  throw new Error(
    `Cannot pack @uniview/tui-2048; model files are missing: ${missingFiles.join(", ")}`,
  );
}

console.log(
  `Model verified: ${requiredFiles.length} files in ${modelDirectory}`,
);
