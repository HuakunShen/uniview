import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const bindings = [
  { dir: "packages/tui-react", peer: "react", peerRange: "^19.2.0" },
  { dir: "packages/tui-solid", peer: "solid-js", peerRange: "^1.9.10" },
];
const allowedUniview = new Set(["@uniview/tui-core"]);
const sourceExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);
const declarationSuffixes = [".d.ts", ".d.mts", ".d.cts"];
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

export function validateSource({
  file,
  source,
  declaredRuntime,
  allowedInternal = allowedUniview,
}) {
  assert.ok(
    !bundledZodPattern.test(source),
    `${file}: bundled zod implementation`,
  );
  for (const specifier of extractModuleSpecifiers(source, file)) {
    if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
    const name = packageName(specifier);
    if (name.startsWith("@uniview/")) {
      assert.ok(allowedInternal.has(name), `${file}: ${name}`);
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

export function packageArtifactKind(file) {
  if (declarationSuffixes.some((suffix) => file.endsWith(suffix))) {
    return "declaration";
  }
  return sourceExtensions.has(extname(file)) ? "source" : null;
}

function declaredRuntimeDependencies(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
}

function validatePackageFiles({ manifest, files, allowedInternal }) {
  const declaredRuntime = declaredRuntimeDependencies(manifest);
  for (const [file, content] of files) {
    const kind = packageArtifactKind(file);
    if (!kind) continue;
    const source =
      typeof content === "string" ? content : content.toString("utf8");
    validateSource({ file, source, declaredRuntime, allowedInternal });
    if (kind === "declaration") {
      validatePortableCoreDeclaration({ file, source });
    }
  }
}

export function validateSynchronousCellSurfaceDeclarations(files) {
  const declarations = [...files]
    .filter(([file]) => packageArtifactKind(file) === "declaration")
    .map(
      ([file, content]) =>
        `${file}\n${typeof content === "string" ? content : content.toString("utf8")}`,
    )
    .join("\n");
  const contract = declarations.match(
    /interface CellSurface\s*\{[\s\S]*?\}/,
  )?.[0];
  assert.ok(contract, "packed core declarations must contain CellSurface");
  assert.doesNotMatch(
    contract,
    /\bPromise(?:Like)?\b/,
    "CellSurface declarations must be strictly synchronous",
  );
  assert.match(contract, /mount\s*\([^)]*\)\s*:\s*void\s*;/);
  assert.match(contract, /resize\s*\([^)]*\)\s*:\s*void\s*;/);
  assert.match(contract, /present\s*\([\s\S]*?\)\s*:\s*PresentStats\s*;/);
  assert.match(contract, /destroy\s*\(\s*\)\s*:\s*void\s*;/);
}

export function validateCorePackageFiles({
  manifest,
  files,
  requireSynchronousCellSurface = false,
}) {
  const declaredRuntime = declaredRuntimeDependencies(manifest);
  assert.deepEqual(
    [...declaredRuntime].filter((name) => name.startsWith("@uniview/")),
    [],
    "@uniview/tui-core must not depend on another @uniview package",
  );
  validatePackageFiles({ manifest, files, allowedInternal: new Set() });
  if (requireSynchronousCellSurface) {
    validateSynchronousCellSurfaceDeclarations(files);
  }
}

export function validateBindingPackageFiles({ manifest, files }) {
  validatePackageFiles({ manifest, files, allowedInternal: allowedUniview });
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
  const files = new Map();
  for (const file of await filesBelow(join(packageDir, "dist"))) {
    if (!packageArtifactKind(file)) continue;
    files.set(file, await readFile(file, "utf8"));
  }

  validateBindingPackageFiles({ manifest, files });
  validateManifest(binding, manifest);
}

export async function verifyCore() {
  const packageDir = join(root, "packages/tui-core");
  const manifest = JSON.parse(
    await readFile(join(packageDir, "package.json"), "utf8"),
  );
  const files = new Map();
  for (const file of await filesBelow(join(packageDir, "dist"))) {
    if (!packageArtifactKind(file)) continue;
    files.set(file, await readFile(file, "utf8"));
  }
  validateCorePackageFiles({
    manifest,
    files,
    requireSynchronousCellSurface: true,
  });
}

export async function main() {
  await verifyCore();
  for (const binding of bindings) await verifyBinding(binding);
  console.log("TUI package boundaries verified");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
