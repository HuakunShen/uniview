import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const bindings = [
  { dir: "packages/tui-react", peer: "react", peerRange: "^19.2.0" },
  { dir: "packages/tui-solid", peer: "solid-js", peerRange: "^1.9.0" },
];
const allowedUniview = new Set(["@uniview/tui-core"]);
const sourceExtensions = new Set([".mjs", ".js", ".mts", ".ts"]);
const bundledZodPattern = /node_modules\/\.pnpm\/zod@|vendor:\s*["']zod["']/;

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

export function extractModuleSpecifiers(source, file = "artifact.mjs") {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers = [];

  for (const directive of sourceFile.typeReferenceDirectives) {
    specifiers.push(directive.fileName);
  }

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      ((ts.isIdentifier(node.expression) &&
        node.expression.text === "require") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "require" &&
          node.expression.name.text === "resolve"))
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

export function validateSource({ file, source, declaredRuntime }) {
  assert.ok(
    !bundledZodPattern.test(source),
    `${file}: bundled zod implementation`,
  );
  for (const specifier of extractModuleSpecifiers(source, file)) {
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

export function validatePortableCoreDeclaration({ file, source }) {
  assert.ok(
    !/\bBuffer\b/.test(source),
    `${file}: public declaration leaks Node Buffer`,
  );
}

export function validateManifest(binding, manifest) {
  const internalRuntime = Object.keys(manifest.dependencies ?? {}).filter(
    (name) => name.startsWith("@uniview/"),
  );
  assert.deepEqual(internalRuntime, ["@uniview/tui-core"]);
  assert.equal(
    manifest.peerDependencies?.[binding.peer],
    binding.peerRange,
    `${binding.dir}: ${binding.peer} peer must be exactly ${binding.peerRange}`,
  );
  assert.ok(!manifest.inlinedDependencies?.zod, `${binding.dir}: inlined zod`);
}

async function verifyBinding(binding) {
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
    validateSource({ file, source, declaredRuntime });
  }

  validateManifest(binding, manifest);
}

export async function main() {
  for (const file of await filesBelow(join(root, "packages/tui-core/dist"))) {
    if (!file.endsWith(".d.mts") && !file.endsWith(".d.ts")) continue;
    validatePortableCoreDeclaration({
      file,
      source: await readFile(file, "utf8"),
    });
  }
  for (const binding of bindings) await verifyBinding(binding);
  console.log("TUI package boundaries verified");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
