/**
 * Rewrites `src/palette.ts` from the installed Tailwind. Run after bumping
 * tailwindcss; `palette.test.ts` will tell you when that's needed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readTailwindFamilies, SHADES } from "./tailwind-source.mjs";

const target = fileURLToPath(new URL("../src/palette.ts", import.meta.url));
const source = readFileSync(target, "utf8");

const families = readTailwindFamilies();
const body = Object.entries(families)
  .map(([name, hexes]) => `  ${name}: [\n${hexes.map((hex) => `    "${hex}",`).join("\n")}\n  ],`)
  .join("\n");

const head = source.slice(0, source.indexOf("const FAMILIES"));
const tail = source.slice(source.indexOf("\n};\n", source.indexOf("const FAMILIES")) + 4);

writeFileSync(
  target,
  `${head}const FAMILIES: Record<string, string[]> = {\n  // ${SHADES.join(", ")}\n${body}\n};\n${tail}`,
);

console.log(`palette.ts: ${Object.keys(families).length} families, ${Object.keys(families).length * SHADES.length} tokens`);
