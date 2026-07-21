import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const bindings = [
  { dir: "packages/tui-react", peer: "react" },
  { dir: "packages/tui-solid", peer: "solid-js" },
];
const allowedUniview = new Set(["@uniview/tui-core"]);
const sourceExtensions = new Set([".mjs", ".js", ".mts", ".ts"]);
const bundledZodPattern = /node_modules\/\.pnpm\/zod@|vendor:\s*["']zod["']/;
const importPattern =
  /(?:^\s*import\s*["']|(?:^|[;\n])\s*(?:import|export)\b[^;\n]*?\bfrom\s*["']|\bimport\s*\(\s*["'])(@?[^"']+)["']/gm;

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    }),
  );
  return nested.flat();
}

function packageName(specifier) {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}

for (const binding of bindings) {
  const packageDir = join(root, binding.dir);
  const manifest = JSON.parse(
    await readFile(join(packageDir, "package.json"), "utf8"),
  );
  const declaredRuntime = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);

  for (const file of await filesBelow(join(packageDir, "dist"))) {
    if (!sourceExtensions.has(extname(file)) && !file.endsWith(".d.mts")) {
      continue;
    }
    const source = await readFile(file, "utf8");
    assert.ok(
      !bundledZodPattern.test(source),
      `${file}: bundled zod implementation`,
    );
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
      const name = packageName(specifier);
      if (name.startsWith("@uniview/")) {
        assert.ok(allowedUniview.has(name), `${file}: ${name}`);
      }
      assert.notEqual(name, "zod", `${file}: zod must not be imported`);
      assert.ok(
        declaredRuntime.has(name),
        `${file}: undeclared runtime import ${name}`,
      );
    }
  }

  const internalRuntime = Object.keys(manifest.dependencies ?? {}).filter(
    (name) => name.startsWith("@uniview/"),
  );
  assert.deepEqual(internalRuntime, ["@uniview/tui-core"]);
  assert.ok(manifest.peerDependencies?.[binding.peer]);
  assert.ok(!manifest.inlinedDependencies?.zod, `${binding.dir}: inlined zod`);
}

console.log("TUI package boundaries verified");
