import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  inspectTarball,
  loadTarballDescriptor,
  parseSmokeArguments,
  writeTarballDescriptor,
} from "./tui-tarball-descriptor.mjs";
import {
  validateBindingPackageFiles,
  validateCorePackageFiles,
} from "./verify-tui-package-boundaries.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const cli = parseSmokeArguments(process.argv.slice(2));
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
assert.ok(
  nodeMajor >= (cli.mode === "reuse" ? 18 : 24),
  cli.mode === "reuse"
    ? `TUI packages require Node >=18, got ${process.version}`
    : `TUI release preparation requires Node >=24, got ${process.version}`,
);
console.log(
  `${cli.mode === "reuse" ? "TUI tarball smoke" : "TUI tarball preparation"} runtime: ${process.version}`,
);
const publicPackages = {
  core: {
    directory: join(repo, "packages/tui-core"),
    name: "@uniview/tui-core",
    exports: [".", "./package.json"],
  },
  react: {
    directory: join(repo, "packages/tui-react"),
    name: "@uniview/tui-react",
    exports: [".", "./compat", "./package.json"],
  },
  solid: {
    directory: join(repo, "packages/tui-solid"),
    name: "@uniview/tui-solid",
    exports: [".", "./jsx-runtime", "./renderer", "./vite", "./package.json"],
  },
};

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "1", ...extraEnv },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      [
        `$ ${command} ${args.join(" ")}`,
        result.error?.stack,
        result.stdout,
        result.stderr,
        result.signal ? `terminated by ${result.signal}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout.trim();
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function findPackageDirectory(entry, name) {
  let directory = dirname(entry);
  for (;;) {
    try {
      const manifest = await readJson(join(directory, "package.json"));
      if (manifest.name === name) return directory;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = dirname(directory);
    assert.notEqual(parent, directory, `cannot find installed package ${name}`);
    directory = parent;
  }
}

async function resolveInstalledDependency(packageDirectory, name) {
  let searchDirectory = packageDirectory;
  for (;;) {
    if (basename(searchDirectory) === "node_modules") {
      try {
        return await realpath(join(searchDirectory, ...name.split("/")));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const parent = dirname(searchDirectory);
    if (parent === searchDirectory) break;
    searchDirectory = parent;
  }

  const require = createRequire(join(packageDirectory, "package.json"));
  let entry;
  try {
    entry = require.resolve(`${name}/package.json`);
  } catch (error) {
    if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    entry = require.resolve(name);
  }
  return realpath(await findPackageDirectory(entry, name));
}

async function collectOfflineOverrides(seedDirectories) {
  const replacementsByName = new Map();
  const seenDirectories = new Set();
  const queue = [...seedDirectories];
  while (queue.length > 0) {
    const packageDirectory = await realpath(queue.shift());
    if (seenDirectories.has(packageDirectory)) continue;
    seenDirectories.add(packageDirectory);
    const manifest = await readJson(join(packageDirectory, "package.json"));
    for (const [name, specifier] of Object.entries(
      manifest.dependencies ?? {},
    )) {
      if (name.startsWith("@uniview/")) continue;
      const dependencyDirectory = await resolveInstalledDependency(
        packageDirectory,
        name,
      );
      const replacement = `file:${dependencyDirectory}`;
      const replacements = replacementsByName.get(name) ?? new Map();
      const specifiers = replacements.get(replacement) ?? new Set();
      specifiers.add(specifier);
      replacements.set(replacement, specifiers);
      replacementsByName.set(name, replacements);
      queue.push(dependencyDirectory);
    }
  }

  const overrides = {};
  for (const [name, replacements] of replacementsByName) {
    if (replacements.size === 1) {
      overrides[name] = replacements.keys().next().value;
      continue;
    }
    for (const [replacement, specifiers] of replacements) {
      for (const specifier of specifiers) {
        const selector = `${name}@${specifier}`;
        assert.ok(
          !overrides[selector] || overrides[selector] === replacement,
          `offline graph resolves ${selector} to multiple installed versions`,
        );
        overrides[selector] = replacement;
      }
    }
  }
  return overrides;
}

function assertNoWorkspaceRuntimeSpecs(manifest) {
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, specifier] of Object.entries(manifest[field] ?? {})) {
      assert.ok(
        typeof specifier !== "string" || !specifier.startsWith("workspace:"),
        `${manifest.name} ${field}.${name} was not rewritten: ${specifier}`,
      );
    }
  }
}

function assertInternalRuntimeDependencies(manifest, expected) {
  const actual = Object.keys(manifest.dependencies ?? {})
    .filter((name) => name.startsWith("@uniview/"))
    .sort();
  assert.deepEqual(
    actual,
    [...expected].sort(),
    `${manifest.name} runtime boundary`,
  );
}

function assertRuntimeContract(manifest, expected) {
  assert.deepEqual(
    manifest.dependencies ?? {},
    expected.dependencies,
    `${manifest.name} dependencies`,
  );
  assert.deepEqual(
    manifest.optionalDependencies ?? {},
    expected.optionalDependencies,
    `${manifest.name} optionalDependencies`,
  );
  assert.deepEqual(
    manifest.peerDependencies ?? {},
    expected.peerDependencies,
    `${manifest.name} peerDependencies`,
  );
  assert.deepEqual(
    manifest.peerDependenciesMeta ?? {},
    expected.peerDependenciesMeta,
    `${manifest.name} peerDependenciesMeta`,
  );
}

function assertPackedPackage(pack, manifest, definition) {
  assert.equal(pack.name, definition.name);
  assert.equal(manifest.name, definition.name);
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.engines?.node, ">=18");
  assert.equal(manifest.types, "./dist/index.d.mts");
  assert.deepEqual(Object.keys(manifest.exports), definition.exports);

  const contents = new Set(pack.files.map(({ path }) => path));
  assert.ok(
    contents.has("package.json"),
    `${manifest.name}: missing package.json`,
  );
  assert.ok(contents.has("README.md"), `${manifest.name}: missing README.md`);
  assert.ok(
    ![...contents].some(
      (path) => path.startsWith("src/") || path.includes("/tests/"),
    ),
    `${manifest.name}: source or tests leaked into tarball`,
  );

  for (const target of Object.values(manifest.exports)) {
    if (target === "./package.json") continue;
    const runtimeFile = target.replace(/^\.\//, "");
    assert.ok(
      contents.has(runtimeFile),
      `${manifest.name}: missing exported file ${runtimeFile}`,
    );
    const declarationFile = runtimeFile.replace(/\.mjs$/, ".d.mts");
    assert.ok(
      contents.has(declarationFile),
      `${manifest.name}: missing declaration ${declarationFile}`,
    );
  }

  assertNoWorkspaceRuntimeSpecs(manifest);
}

async function installedManifest(projectDirectory, packageName) {
  return JSON.parse(
    await readFile(
      join(
        projectDirectory,
        "node_modules",
        ...packageName.split("/"),
        "package.json",
      ),
      "utf8",
    ),
  );
}

function dependencyRecords(value, packageName, records = []) {
  if (!value || typeof value !== "object") return records;
  if (Array.isArray(value)) {
    for (const item of value) dependencyRecords(item, packageName, records);
    return records;
  }
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    for (const [name, dependency] of Object.entries(value[field] ?? {})) {
      if (name === packageName) records.push(dependency);
      dependencyRecords(dependency, packageName, records);
    }
  }
  return records;
}

async function assertSingleInstalledVersion(
  projectDirectory,
  packageName,
  expectedVersion,
) {
  const graph = JSON.parse(
    run(
      pnpm,
      ["list", packageName, "--depth", "Infinity", "--json"],
      projectDirectory,
    ),
  );
  const versions = new Set();
  for (const record of dependencyRecords(graph, packageName)) {
    if (record.path) {
      const manifest = await readJson(join(record.path, "package.json"));
      versions.add(manifest.version);
    } else if (record.version) {
      versions.add(record.version);
    }
  }
  assert.deepEqual(
    [...versions].sort(),
    [expectedVersion],
    `${projectDirectory}: ${packageName} graph must contain exactly ${expectedVersion}`,
  );
}

async function createProject({
  directory,
  dependencies,
  expectedDirectDependencies,
  coreTarball,
  offlineOverrides,
  source,
  typeScriptFixture,
}) {
  assert.deepEqual(
    Object.keys(dependencies).sort(),
    [...expectedDirectDependencies].sort(),
    `${directory}: unexpected direct runtime dependencies`,
  );
  const writeRuntimeProject = async (projectDirectory, runtimeSource) => {
    await mkdir(projectDirectory, { recursive: true });
    await writeJson(join(projectDirectory, "package.json"), {
      private: true,
      type: "module",
      dependencies,
      // The registry would resolve this exact transitive version after publish.
      // The tarball override provides the same resolution without adding core to
      // the binding consumer's direct install surface or accessing the network.
      pnpm: {
        overrides: {
          ...offlineOverrides,
          "@uniview/tui-core": `file:${coreTarball}`,
        },
      },
    });
    await writeFile(join(projectDirectory, "smoke.mjs"), runtimeSource);
  };

  await writeRuntimeProject(directory, source);
  if (typeScriptFixture) {
    await writeFile(join(directory, "smoke.tsx"), typeScriptFixture.source);
    await writeJson(join(directory, "tsconfig.json"), typeScriptFixture.config);
  }

  run(
    pnpm,
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-optional",
      "--strict-peer-dependencies",
      "--no-frozen-lockfile",
    ],
    directory,
  );
  const fixtureManifest = await readJson(join(directory, "package.json"));
  assert.deepEqual(
    Object.keys(fixtureManifest.dependencies ?? {}).sort(),
    [...expectedDirectDependencies].sort(),
    `${directory}: install fixture gained a direct runtime dependency`,
  );
  run(process.execPath, ["smoke.mjs"], directory);
  if (typeScriptFixture) {
    run(
      process.execPath,
      [
        join(repo, "node_modules/typescript/bin/tsc"),
        "--project",
        "tsconfig.json",
      ],
      directory,
    );
  }

  const productionDirectory = `${directory}-production`;
  await writeRuntimeProject(
    productionDirectory,
    `
import assertProduction from "node:assert/strict"
assertProduction.equal(process.env.NODE_ENV, "production")
${source}`,
  );
  run(
    pnpm,
    [
      "install",
      "--prod",
      "--offline",
      "--ignore-scripts",
      "--no-optional",
      "--strict-peer-dependencies",
      "--no-frozen-lockfile",
    ],
    productionDirectory,
  );
  const productionManifest = await readJson(
    join(productionDirectory, "package.json"),
  );
  assert.deepEqual(
    Object.keys(productionManifest.dependencies ?? {}).sort(),
    [...expectedDirectDependencies].sort(),
    `${productionDirectory}: production fixture gained a direct runtime dependency`,
  );
  assert.equal(
    Object.hasOwn(productionManifest, "devDependencies"),
    false,
    `${productionDirectory}: production fixture must not declare devDependencies`,
  );
  run(process.execPath, ["smoke.mjs"], productionDirectory, {
    NODE_ENV: "production",
  });
}

async function packPackage(definition, tarballDirectory) {
  const output = run(
    pnpm,
    ["pack", "--json", "--pack-destination", tarballDirectory],
    definition.directory,
  );
  const pack = JSON.parse(output);
  assert.ok(pack.filename.endsWith(".tgz"), `${pack.name}: expected a tarball`);
  return pack;
}

async function prepareTarballs(tarballDirectory) {
  await mkdir(tarballDirectory, { recursive: true });
  assert.deepEqual(
    await readdir(tarballDirectory),
    [],
    `artifact directory must be empty: ${tarballDirectory}`,
  );
  const tarballs = {};
  for (const [key, definition] of Object.entries(publicPackages)) {
    const pack = await packPackage(definition, tarballDirectory);
    assert.equal(pack.name, definition.name, `${key}: packed package name`);
    tarballs[key] = pack.filename;
  }
  const descriptorPath = await writeTarballDescriptor({
    directory: tarballDirectory,
    tarballs,
  });
  return loadTarballDescriptor({ descriptorPath });
}

if (cli.mode === "prepare") {
  const prepared = await prepareTarballs(resolve(cli.outputDirectory));
  console.log(`Prepared immutable TUI tarballs: ${prepared.descriptorPath}`);
  // Artifact writes and descriptor verification are complete; do not create or
  // run consumer fixtures in the build-only phase.
  process.exit(0);
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "uniview-tui-release-"));
try {
  const prepared =
    cli.mode === "reuse"
      ? await loadTarballDescriptor({
          descriptorPath: resolve(cli.descriptorPath),
        })
      : await prepareTarballs(join(temporaryRoot, "tarballs"));
  const packs = prepared.packages;
  assert.deepEqual(
    Object.keys(packs),
    ["core", "react", "solid"],
    "release smoke must use exactly three packages",
  );

  // Inspect the descriptor-verified packed manifests before local offline
  // overrides can alter resolution. Exact objects make drift a release failure.
  const packedManifests = {
    core: packs.core.manifest,
    react: packs.react.manifest,
    solid: packs.solid.manifest,
  };
  const releaseVersion = packedManifests.core.version;
  assert.equal(packedManifests.react.version, releaseVersion);
  assert.equal(packedManifests.solid.version, releaseVersion);
  assertRuntimeContract(packedManifests.core, {
    dependencies: {
      "get-east-asian-width": "^1.3.0",
      "yoga-layout": "^3.2.1",
    },
    optionalDependencies: {},
    peerDependencies: {},
    peerDependenciesMeta: {},
  });
  assertRuntimeContract(packedManifests.react, {
    dependencies: {
      lowlight: "^3.3.0",
      marked: "^15.0.0",
      "react-reconciler": "^0.33.0",
      "@uniview/tui-core": releaseVersion,
    },
    optionalDependencies: {
      "react-devtools-core": "^7.0.1",
    },
    peerDependencies: {
      react: "^19.2.0",
    },
    peerDependenciesMeta: {},
  });
  assertRuntimeContract(packedManifests.solid, {
    dependencies: {
      "@babel/core": "^7.26.0",
      "@babel/preset-typescript": "^7.26.0",
      "babel-preset-solid": "^1.9.0",
      lowlight: "^3.3.0",
      marked: "^15.0.0",
      "@uniview/tui-core": releaseVersion,
    },
    optionalDependencies: {
      "solid-devtools": "^0.34.5",
    },
    peerDependencies: {
      "solid-js": "^1.9.10",
    },
    peerDependenciesMeta: {},
  });
  assertInternalRuntimeDependencies(packedManifests.core, []);
  assertInternalRuntimeDependencies(packedManifests.react, [
    publicPackages.core.name,
  ]);
  assertInternalRuntimeDependencies(packedManifests.solid, [
    publicPackages.core.name,
  ]);
  assertPackedPackage(packs.core, packedManifests.core, publicPackages.core);
  assertPackedPackage(packs.react, packedManifests.react, publicPackages.react);
  assertPackedPackage(packs.solid, packedManifests.solid, publicPackages.solid);
  const [packedCore, packedReact, packedSolid] = await Promise.all([
    inspectTarball(packs.core.filename),
    inspectTarball(packs.react.filename),
    inspectTarball(packs.solid.filename),
  ]);
  validateCorePackageFiles({
    manifest: packedCore.manifest,
    files: packedCore.contents,
    requireSynchronousCellSurface: true,
  });
  validateBindingPackageFiles({
    manifest: packedReact.manifest,
    files: packedReact.contents,
  });
  validateBindingPackageFiles({
    manifest: packedSolid.manifest,
    files: packedSolid.contents,
  });

  const localReact = await realpath(
    join(repo, "packages/tui-react/node_modules/react"),
  );
  const localSolid = await realpath(
    join(repo, "packages/tui-solid/node_modules/solid-js"),
  );
  const coreOfflineOverrides = await collectOfflineOverrides([
    publicPackages.core.directory,
  ]);
  const reactOfflineOverrides = await collectOfflineOverrides([
    publicPackages.core.directory,
    publicPackages.react.directory,
    localReact,
  ]);
  const solidOfflineOverrides = await collectOfflineOverrides([
    publicPackages.core.directory,
    publicPackages.solid.directory,
    localSolid,
  ]);
  const localSolidManifest = await readJson(join(localSolid, "package.json"));
  assert.equal(localSolidManifest.version, "1.9.10");
  solidOfflineOverrides["solid-js"] = `file:${localSolid}`;

  const coreProject = join(temporaryRoot, "core");
  await createProject({
    directory: coreProject,
    dependencies: {
      "@uniview/tui-core": `file:${packs.core.filename}`,
    },
    expectedDirectDependencies: ["@uniview/tui-core"],
    coreTarball: packs.core.filename,
    offlineOverrides: coreOfflineOverrides,
    source: `
import assert from "node:assert/strict"
import {
  MemoryCellSurface,
  StyleTable,
  TerminalDriver,
  createTuiApp,
  stringCellWidth,
} from "@uniview/tui-core"
const styles = new StyleTable()
const surface = new MemoryCellSurface({ styles })
assert.ok(surface)
assert.equal(stringCellWidth("界"), 2)

class FakeInput {
  isTTY = true
  rawModes = []
  dataListeners = new Set()
  setRawMode(mode) { this.rawModes.push(mode) }
  resume() {}
  pause() {}
  on(_event, listener) { this.dataListeners.add(listener) }
  off(_event, listener) { this.dataListeners.delete(listener) }
}
class FakeOutput {
  columns = 20
  rows = 2
  chunks = []
  resizeListeners = new Set()
  failWrite
  write(chunk) {
    const error = this.failWrite?.(chunk)
    if (error) throw error
    this.chunks.push(chunk)
  }
  on(_event, listener) { this.resizeListeners.add(listener) }
  off(_event, listener) { this.resizeListeners.delete(listener) }
}
const input = new FakeInput()
const output = new FakeOutput()
const renderError = new Error("packed core replacement frame failed")
const cleanupError = new Error("packed core surface cleanup failed")
const reset = String.fromCharCode(27) + "[0m" + String.fromCharCode(27) + "[?25h"
const frameStart = String.fromCharCode(27) + "[?2026h"
let failRender = false
let blockCleanup = true
let cleanupAttempts = 0
output.failWrite = (chunk) => {
  if (failRender && chunk.includes(frameStart)) {
    failRender = false
    return renderError
  }
  if (chunk === reset) {
    cleanupAttempts += 1
    if (blockCleanup) return cleanupError
  }
}
const app = createTuiApp({ input, output })
app.render({ type: "text", text: "Old core app" })
failRender = true
assert.throws(
  () => app.render({ type: "text", text: "Broken core replacement" }),
  (error) => error === renderError,
)
assert.deepEqual(input.rawModes, [true, false])
assert.equal(input.dataListeners.size, 0)
assert.equal(output.resizeListeners.size, 0)
const enter = String.fromCharCode(27) + "[?1049h"
const enterWritesBeforeBlocked = output.chunks.filter((chunk) => chunk.includes(enter)).length
assert.throws(
  () => createTuiApp({ input, output }),
  (error) => error === cleanupError,
)
assert.equal(
  output.chunks.filter((chunk) => chunk.includes(enter)).length,
  enterWritesBeforeBlocked,
)
assert.deepEqual(input.rawModes, [true, false])
blockCleanup = false
const replacement = createTuiApp({ input, output })
replacement.render({ type: "text", text: "Core replacement" })
assert.equal(cleanupAttempts, 3)
const beforeStaleUse = {
  rawModes: [...input.rawModes],
  chunks: [...output.chunks],
  dataListeners: input.dataListeners.size,
  resizeListeners: output.resizeListeners.size,
}
app.destroy()
assert.throws(() => app.render({ type: "text", text: "Stale" }), /teardown/i)
assert.throws(() => app.onInput(() => {}), /teardown/i)
assert.throws(
  () => app.renderer.setRoot({ type: "text", text: "Stale renderer" }),
  /teardown|destroy/i,
)
assert.throws(() => app.renderer.flush(), /teardown|destroy/i)
assert.deepEqual({
  rawModes: input.rawModes,
  chunks: output.chunks,
  dataListeners: input.dataListeners.size,
  resizeListeners: output.resizeListeners.size,
}, beforeStaleUse)
replacement.destroy()
assert.deepEqual(input.rawModes, [true, false, true, false])
assert.equal(input.dataListeners.size, 0)
assert.equal(output.resizeListeners.size, 0)

const snapshotInput = new FakeInput()
const snapshotOutput = new FakeOutput()
const snapshotError = new Error("packed original cleanup failed")
let snapshotBlocked = true
let snapshotAttempts = 0
const mutableSession = {
  cleanup() {
    snapshotAttempts += 1
    mutableSession.cleanup = () => {}
    if (snapshotBlocked) throw snapshotError
  },
}
const snapshotOwner = new TerminalDriver({
  input: snapshotInput,
  output: snapshotOutput,
  onEvent: () => {},
})
snapshotOwner.start(mutableSession)
assert.throws(() => snapshotOwner.stop(), (error) => error === snapshotError)
const snapshotReplacement = new TerminalDriver({
  input: snapshotInput,
  output: snapshotOutput,
  onEvent: () => {},
})
assert.throws(
  () => snapshotReplacement.start(),
  (error) => error === snapshotError,
)
assert.equal(snapshotAttempts, 2)
snapshotBlocked = false
snapshotReplacement.start()
assert.equal(snapshotAttempts, 3)
snapshotReplacement.stop()

const predicateInput = new FakeInput()
const predicateOutput = new FakeOutput()
const predicateCleanupError = new Error("packed predicate cleanup failed")
const predicateError = new Error("packed retain predicate failed")
let predicateBlocked = true
let predicateCleanupAttempts = 0
const predicateOwner = new TerminalDriver({
  input: predicateInput,
  output: predicateOutput,
  onEvent: () => {},
})
predicateOwner.start({
  cleanup() {
    predicateCleanupAttempts += 1
    if (predicateBlocked) throw predicateCleanupError
  },
  retainSessionOnError() {
    throw predicateError
  },
})
assert.throws(
  () => predicateOwner.stop(),
  (error) => error === predicateCleanupError,
)
assert.deepEqual(predicateInput.rawModes, [true, false])
const predicateReplacement = new TerminalDriver({
  input: predicateInput,
  output: predicateOutput,
  onEvent: () => {},
})
assert.throws(
  () => predicateReplacement.start(),
  (error) => error === predicateCleanupError,
)
assert.equal(predicateCleanupAttempts, 2)
predicateBlocked = false
predicateReplacement.start()
assert.equal(predicateCleanupAttempts, 3)
predicateReplacement.stop()
`,
  });

  const reactProject = join(temporaryRoot, "react");
  await createProject({
    directory: reactProject,
    dependencies: {
      "@uniview/tui-react": `file:${packs.react.filename}`,
      react: `file:${localReact}`,
    },
    expectedDirectDependencies: ["@uniview/tui-react", "react"],
    coreTarball: packs.core.filename,
    offlineOverrides: reactOfflineOverrides,
    source: `
import assert from "node:assert/strict"
import { createElement, useEffect } from "react"
import { Text, render } from "@uniview/tui-react"
import { Text as CompatText, createTuiRoot } from "@uniview/tui-react/compat"

class FakeInput {
  isTTY = true
  rawModes = []
  dataListeners = new Set()
  resumeCount = 0
  pauseCount = 0
  setRawMode(mode) { this.rawModes.push(mode) }
  resume() { this.resumeCount += 1 }
  pause() { this.pauseCount += 1 }
  on(event, listener) {
    assert.equal(event, "data")
    this.dataListeners.add(listener)
  }
  off(event, listener) {
    assert.equal(event, "data")
    this.dataListeners.delete(listener)
  }
}
class FakeOutput {
  columns = 20
  rows = 2
  chunks = []
  resizeListeners = new Set()
  failWrite
  write(chunk) {
    const error = this.failWrite?.(chunk)
    if (error) throw error
    this.chunks.push(chunk)
  }
  on(event, listener) {
    assert.equal(event, "resize")
    this.resizeListeners.add(listener)
  }
  off(event, listener) {
    assert.equal(event, "resize")
    this.resizeListeners.delete(listener)
  }
}

const input = new FakeInput()
const output = new FakeOutput()
let cleanupCount = 0
let reentrantCleanupCount = 0
let reentrantDestroyError
function App() {
  useEffect(() => () => { cleanupCount += 1 }, [])
  return createElement(Text, null, "Hello React")
}
function ReentrantApp() {
  useEffect(() => {
    try {
      app.destroy()
    } catch (error) {
      reentrantDestroyError = error
    }
    return () => { reentrantCleanupCount += 1 }
  }, [])
  return createElement(Text, null, "React still active")
}
const app = render(createElement(App), { input, output })
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
assert.match(output.chunks.join(""), /Hello React/)
assert.deepEqual(input.rawModes, [true])
assert.equal(input.dataListeners.size, 1)
assert.equal(output.resizeListeners.size, 1)
app.render(createElement(ReentrantApp))
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
assert.match(reentrantDestroyError?.message ?? "", /queueMicrotask/)
assert.equal(cleanupCount, 1)
assert.equal(reentrantCleanupCount, 0)
assert.deepEqual(input.rawModes, [true])
assert.equal(input.dataListeners.size, 1)
assert.equal(output.resizeListeners.size, 1)
app.destroy()
assert.equal(reentrantCleanupCount, 1)
assert.deepEqual(input.rawModes, [true, false])
assert.equal(input.dataListeners.size, 0)
assert.equal(output.resizeListeners.size, 0)
app.destroy()
assert.equal(cleanupCount, 1)
assert.deepEqual(input.rawModes, [true, false])

const cleanupInput = new FakeInput()
const cleanupOutput = new FakeOutput()
const hostError = new Error("host teardown failed")
const driverError = new Error("terminal leave failed")
let hostFailed = false
let driverFailed = false
const cleanupApp = render(createElement(Text, null, "Cleanup failure"), {
  input: cleanupInput,
  output: cleanupOutput,
})
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
cleanupOutput.failWrite = (chunk) => {
  const escape = String.fromCharCode(27)
  if (!hostFailed && chunk === escape + "[0m" + escape + "[?25h") {
    hostFailed = true
    return hostError
  }
  if (hostFailed && !driverFailed) {
    driverFailed = true
    return driverError
  }
}
assert.throws(
  () => cleanupApp.destroy(),
  (error) => error === hostError,
)
assert.equal(hostFailed, true)
assert.equal(driverFailed, true)
assert.deepEqual(cleanupInput.rawModes, [true, false])
assert.equal(cleanupInput.dataListeners.size, 0)
assert.equal(cleanupOutput.resizeListeners.size, 0)
assert.throws(
  () => cleanupApp.render(createElement(Text, null, "Too late")),
  /teardown has started/,
)
cleanupApp.destroy()

const barrierInput = new FakeInput()
const barrierOutput = new FakeOutput()
const barrierError = new Error("packed React surface cleanup failed")
const barrierReset = String.fromCharCode(27) + "[0m" + String.fromCharCode(27) + "[?25h"
let blockBarrierCleanup = true
let barrierCleanupAttempts = 0
barrierOutput.failWrite = (chunk) => {
  if (chunk === barrierReset) {
    barrierCleanupAttempts += 1
    if (blockBarrierCleanup) return barrierError
  }
}
const barrierApp = render(createElement(Text, null, "Old barrier app"), {
  input: barrierInput,
  output: barrierOutput,
})
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
assert.throws(() => barrierApp.destroy(), (error) => error === barrierError)
const barrierEnter = String.fromCharCode(27) + "[?1049h"
const barrierEnterWritesBeforeBlocked = barrierOutput.chunks.filter((chunk) =>
  chunk.includes(barrierEnter),
).length
assert.throws(
  () => render(createElement(Text, null, "Must not mount"), {
    input: barrierInput,
    output: barrierOutput,
  }),
  (error) => error === barrierError,
)
assert.equal(
  barrierOutput.chunks.filter((chunk) => chunk.includes(barrierEnter)).length,
  barrierEnterWritesBeforeBlocked,
)
assert.deepEqual(barrierInput.rawModes, [true, false])
assert.equal(barrierInput.dataListeners.size, 0)
assert.equal(barrierOutput.resizeListeners.size, 0)
blockBarrierCleanup = false
const barrierReplacement = render(createElement(Text, null, "Barrier replacement"), {
  input: barrierInput,
  output: barrierOutput,
})
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
assert.equal(barrierCleanupAttempts, 3)
const beforeBarrierStaleUse = {
  rawModes: [...barrierInput.rawModes],
  chunks: [...barrierOutput.chunks],
  dataListeners: barrierInput.dataListeners.size,
  resizeListeners: barrierOutput.resizeListeners.size,
}
barrierApp.destroy()
assert.throws(
  () => barrierApp.render(createElement(Text, null, "Stale render")),
  /teardown|destroyed/i,
)
assert.throws(
  () => barrierApp.dispatchInput({ type: "text", text: "x" }),
  /teardown|destroyed/i,
)
assert.throws(
  () => barrierApp.host.renderer.setRoot({ type: "text", text: "Stale renderer" }),
  /teardown|destroy/i,
)
assert.throws(() => barrierApp.host.renderer.flush(), /teardown|destroy/i)
assert.deepEqual({
  rawModes: barrierInput.rawModes,
  chunks: barrierOutput.chunks,
  dataListeners: barrierInput.dataListeners.size,
  resizeListeners: barrierOutput.resizeListeners.size,
}, beforeBarrierStaleUse)
barrierReplacement.destroy()
assert.deepEqual(barrierInput.rawModes, [true, false, true, false])
assert.equal(barrierInput.dataListeners.size, 0)
assert.equal(barrierOutput.resizeListeners.size, 0)

const compatInput = new FakeInput()
const compatOutput = new FakeOutput()
const compatRootError = new Error(
  "Cannot destroy a React renderer during React work; schedule destroy outside render, commit, or effects (for example with queueMicrotask)",
)
const compatDriverError = new Error("compat terminal leave failed")
let compatRootFailed = false
let compatDriverFailed = false
const compatRoot = createTuiRoot({ input: compatInput, output: compatOutput })
compatRoot.render(createElement(CompatText, null, "Compat cleanup"))
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
compatOutput.failWrite = (chunk) => {
  const escape = String.fromCharCode(27)
  if (!compatRootFailed && chunk === escape + "[0m" + escape + "[?25h") {
    compatRootFailed = true
    return compatRootError
  }
  if (
    compatRootFailed &&
    !compatDriverFailed &&
    chunk.includes(escape + "[?1049l")
  ) {
    compatDriverFailed = true
    return compatDriverError
  }
}
assert.throws(
  () => compatRoot.destroy(),
  (error) => error === compatRootError,
)
assert.equal(compatRootFailed, true)
assert.equal(compatDriverFailed, true)
assert.deepEqual(compatInput.rawModes, [true, false])
assert.equal(compatInput.resumeCount, 1)
assert.equal(compatInput.pauseCount, 1)
assert.equal(compatInput.dataListeners.size, 0)
assert.equal(compatOutput.resizeListeners.size, 0)
compatRoot.destroy()

const compatReplacement = createTuiRoot({
  input: compatInput,
  output: compatOutput,
})
compatReplacement.render(createElement(CompatText, null, "Compat replacement"))
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
const compatBeforeStaleDestroy = {
  rawModes: [...compatInput.rawModes],
  dataListeners: compatInput.dataListeners.size,
  resizeListeners: compatOutput.resizeListeners.size,
}
compatRoot.destroy()
assert.deepEqual({
  rawModes: compatInput.rawModes,
  dataListeners: compatInput.dataListeners.size,
  resizeListeners: compatOutput.resizeListeners.size,
}, compatBeforeStaleDestroy)
compatReplacement.destroy()
assert.deepEqual(compatInput.rawModes, [true, false, true, false])
assert.equal(compatInput.dataListeners.size, 0)
assert.equal(compatOutput.resizeListeners.size, 0)

const compatBarrierInput = new FakeInput()
const compatBarrierOutput = new FakeOutput()
const compatBarrierError = new Error("packed compat surface cleanup failed")
const compatBarrierReset = String.fromCharCode(27) + "[0m" + String.fromCharCode(27) + "[?25h"
let blockCompatBarrierCleanup = true
let compatBarrierCleanupAttempts = 0
compatBarrierOutput.failWrite = (chunk) => {
  if (chunk === compatBarrierReset) {
    compatBarrierCleanupAttempts += 1
    if (blockCompatBarrierCleanup) return compatBarrierError
  }
}
const compatBarrierRoot = createTuiRoot({
  input: compatBarrierInput,
  output: compatBarrierOutput,
})
compatBarrierRoot.render(createElement(CompatText, null, "Old compat barrier"))
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
assert.throws(
  () => compatBarrierRoot.destroy(),
  (error) => error === compatBarrierError,
)
const compatBarrierEnter = String.fromCharCode(27) + "[?1049h"
const compatBarrierEnterWritesBeforeBlocked = compatBarrierOutput.chunks.filter((chunk) =>
  chunk.includes(compatBarrierEnter),
).length
assert.throws(
  () => createTuiRoot({
    input: compatBarrierInput,
    output: compatBarrierOutput,
  }),
  (error) => error === compatBarrierError,
)
assert.equal(
  compatBarrierOutput.chunks.filter((chunk) =>
    chunk.includes(compatBarrierEnter),
  ).length,
  compatBarrierEnterWritesBeforeBlocked,
)
assert.deepEqual(compatBarrierInput.rawModes, [true, false])
assert.equal(compatBarrierInput.dataListeners.size, 0)
assert.equal(compatBarrierOutput.resizeListeners.size, 0)
blockCompatBarrierCleanup = false
const compatBarrierReplacement = createTuiRoot({
  input: compatBarrierInput,
  output: compatBarrierOutput,
})
compatBarrierReplacement.render(
  createElement(CompatText, null, "Compat barrier replacement"),
)
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
assert.equal(compatBarrierCleanupAttempts, 3)
const beforeCompatBarrierStaleUse = {
  rawModes: [...compatBarrierInput.rawModes],
  chunks: [...compatBarrierOutput.chunks],
  dataListeners: compatBarrierInput.dataListeners.size,
  resizeListeners: compatBarrierOutput.resizeListeners.size,
}
compatBarrierRoot.destroy()
assert.throws(
  () => compatBarrierRoot.render(createElement(CompatText, null, "Stale")),
  /teardown|destroyed/i,
)
assert.deepEqual({
  rawModes: compatBarrierInput.rawModes,
  chunks: compatBarrierOutput.chunks,
  dataListeners: compatBarrierInput.dataListeners.size,
  resizeListeners: compatBarrierOutput.resizeListeners.size,
}, beforeCompatBarrierStaleUse)
compatBarrierReplacement.destroy()
assert.deepEqual(compatBarrierInput.rawModes, [true, false, true, false])
assert.equal(compatBarrierInput.dataListeners.size, 0)
assert.equal(compatBarrierOutput.resizeListeners.size, 0)

const compatDriverOnlyInput = new FakeInput()
const compatDriverOnlyOutput = new FakeOutput()
const compatDriverOnlyError = new Error("compat driver-only leave failed")
let blockCompatDriverOnlyCleanup = true
let compatDriverOnlyRootCleanup = 0
function CompatDriverOnlyApp() {
  useEffect(() => () => { compatDriverOnlyRootCleanup += 1 }, [])
  return createElement(CompatText, null, "Compat driver-only cleanup")
}
const compatDriverOnlyRoot = createTuiRoot({
  input: compatDriverOnlyInput,
  output: compatDriverOnlyOutput,
})
compatDriverOnlyRoot.render(createElement(CompatDriverOnlyApp))
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
compatDriverOnlyOutput.failWrite = (chunk) => {
  const leave = String.fromCharCode(27) + "[?1049l"
  if (blockCompatDriverOnlyCleanup && chunk.includes(leave)) {
    return compatDriverOnlyError
  }
}
assert.throws(
  () => compatDriverOnlyRoot.destroy(),
  (error) => error === compatDriverOnlyError,
)
assert.equal(compatDriverOnlyRootCleanup, 1)
assert.deepEqual(compatDriverOnlyInput.rawModes, [true, false])
assert.equal(compatDriverOnlyInput.resumeCount, 1)
assert.equal(compatDriverOnlyInput.pauseCount, 1)
assert.equal(compatDriverOnlyInput.dataListeners.size, 0)
assert.equal(compatDriverOnlyOutput.resizeListeners.size, 0)
assert.throws(
  () => compatDriverOnlyRoot.render(createElement(CompatText, null, "Too late")),
  /destroyed/,
)

blockCompatDriverOnlyCleanup = false
compatDriverOnlyRoot.destroy()
assert.equal(compatDriverOnlyRootCleanup, 1)
const compatDriverOnlyReplacement = createTuiRoot({
  input: compatDriverOnlyInput,
  output: compatDriverOnlyOutput,
})
compatDriverOnlyReplacement.render(
  createElement(CompatText, null, "Compat driver replacement"),
)
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
const beforeCompatDriverOnlyStaleDestroy = {
  rawModes: [...compatDriverOnlyInput.rawModes],
  dataListeners: compatDriverOnlyInput.dataListeners.size,
  resizeListeners: compatDriverOnlyOutput.resizeListeners.size,
}
compatDriverOnlyRoot.destroy()
assert.deepEqual({
  rawModes: compatDriverOnlyInput.rawModes,
  dataListeners: compatDriverOnlyInput.dataListeners.size,
  resizeListeners: compatDriverOnlyOutput.resizeListeners.size,
}, beforeCompatDriverOnlyStaleDestroy)
compatDriverOnlyReplacement.destroy()
assert.deepEqual(compatDriverOnlyInput.rawModes, [true, false, true, false])
assert.equal(compatDriverOnlyInput.resumeCount, 2)
assert.equal(compatDriverOnlyInput.pauseCount, 2)
assert.equal(compatDriverOnlyInput.dataListeners.size, 0)
assert.equal(compatDriverOnlyOutput.resizeListeners.size, 0)

const compatReentrantInput = new FakeInput()
const compatReentrantOutput = new FakeOutput()
let compatReentrantRoot
let compatReentrantError
function CompatReentrantApp() {
  useEffect(() => {
    try {
      compatReentrantRoot.destroy()
    } catch (error) {
      compatReentrantError = error
    }
  }, [])
  return createElement(CompatText, null, "Compat still live")
}
compatReentrantRoot = createTuiRoot({
  input: compatReentrantInput,
  output: compatReentrantOutput,
})
compatReentrantRoot.render(createElement(CompatReentrantApp))
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
assert.equal(compatReentrantError?.name, "ReactReentrantUnmountError")
assert.deepEqual(compatReentrantInput.rawModes, [true])
assert.equal(compatReentrantInput.resumeCount, 1)
assert.equal(compatReentrantInput.pauseCount, 0)
assert.equal(compatReentrantInput.dataListeners.size, 1)
assert.equal(compatReentrantOutput.resizeListeners.size, 1)
compatReentrantRoot.destroy()
assert.deepEqual(compatReentrantInput.rawModes, [true, false])
assert.equal(compatReentrantInput.pauseCount, 1)
assert.equal(compatReentrantInput.dataListeners.size, 0)
assert.equal(compatReentrantOutput.resizeListeners.size, 0)

const lostInput = new FakeInput()
const lostOutput = new FakeOutput()
const acquisitionError = new Error("packed React data acquisition failed")
const cleanupError = new Error("packed React data cleanup failed")
let failAcquisition = true
let blockCleanup = true
let dataOnAttempts = 0
lostInput.on = (event, listener) => {
  assert.equal(event, "data")
  lostInput.dataListeners.add(listener)
  dataOnAttempts += 1
  if (failAcquisition) {
    failAcquisition = false
    throw acquisitionError
  }
}
lostInput.off = (event, listener) => {
  assert.equal(event, "data")
  lostInput.dataListeners.delete(listener)
  if (blockCleanup) throw cleanupError
}
assert.throws(
  () => render(createElement(Text, null, "Never returned"), {
    input: lostInput,
    output: lostOutput,
  }),
  (error) => error === acquisitionError,
)
assert.equal(lostInput.dataListeners.size, 0)
assert.equal(lostOutput.resizeListeners.size, 0)
const dataOnAttemptsBeforeBlockedRetry = dataOnAttempts
assert.throws(
  () => render(createElement(Text, null, "Still blocked"), {
    input: lostInput,
    output: lostOutput,
  }),
  (error) => error === cleanupError,
)
assert.equal(dataOnAttempts, dataOnAttemptsBeforeBlockedRetry)
blockCleanup = false
const recoveredApp = render(createElement(Text, null, "Recovered React"), {
  input: lostInput,
  output: lostOutput,
})
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
assert.match(lostOutput.chunks.join(""), /Recovered React/)
assert.deepEqual(lostInput.rawModes.at(-1), true)
assert.equal(lostInput.dataListeners.size, 1)
assert.equal(lostOutput.resizeListeners.size, 1)
recoveredApp.destroy()
assert.deepEqual(lostInput.rawModes.at(-1), false)
assert.equal(lostInput.dataListeners.size, 0)
assert.equal(lostOutput.resizeListeners.size, 0)
`,
  });

  const solidProject = join(temporaryRoot, "solid");
  await createProject({
    directory: solidProject,
    dependencies: {
      "@uniview/tui-solid": `file:${packs.solid.filename}`,
      "solid-js": "1.9.10",
    },
    expectedDirectDependencies: ["@uniview/tui-solid", "solid-js"],
    coreTarball: packs.core.filename,
    offlineOverrides: solidOfflineOverrides,
    source: `
import assert from "node:assert/strict"
import { createComponent, onCleanup } from "solid-js"
import {
  MemoryCellSurface,
  StyleTable,
  TerminalDriver,
  Text,
  createTuiSolidRoot,
  render,
} from "@uniview/tui-solid"
import * as renderer from "@uniview/tui-solid/renderer"
import "@uniview/tui-solid/jsx-runtime"
import { univiewSolid } from "@uniview/tui-solid/vite"

assert.equal(typeof renderer.render, "function")
const transformed = await univiewSolid().transform(
  "const App = () => <text>Hello compiler</text>",
  "smoke.tsx",
)
assert.ok(transformed)
assert.match(transformed.code, /@uniview\\/tui-solid\\/renderer/)
assert.doesNotMatch(transformed.code, /@uniview\\/(?!tui-solid\\/renderer)/)

class FakeInput {
  isTTY = true
  rawModes = []
  resumeCount = 0
  pauseCount = 0
  dataListeners = new Set()
  setRawMode(mode) { this.rawModes.push(mode) }
  resume() { this.resumeCount += 1 }
  pause() { this.pauseCount += 1 }
  on(event, listener) {
    assert.equal(event, "data")
    this.dataListeners.add(listener)
  }
  off(event, listener) {
    assert.equal(event, "data")
    this.dataListeners.delete(listener)
  }
}
class FakeOutput {
  columns = 20
  rows = 2
  chunks = []
  resizeListeners = new Set()
  leaveWriteAttempts = 0
  successfulLeaveWrites = 0
  leaveWriteFailuresRemaining = 0
  failWrite
  write(chunk) {
    const leaveSequence = String.fromCharCode(27) + "[?1049l"
    if (chunk.includes(leaveSequence)) {
      this.leaveWriteAttempts += 1
      if (this.leaveWriteFailuresRemaining > 0) {
        this.leaveWriteFailuresRemaining -= 1
        throw new Error("leave write failed")
      }
      this.successfulLeaveWrites += 1
    }
    this.chunks.push(chunk)
    const error = this.failWrite?.(chunk)
    if (error) throw error
  }
  on(event, listener) {
    assert.equal(event, "resize")
    this.resizeListeners.add(listener)
  }
  off(event, listener) {
    assert.equal(event, "resize")
    this.resizeListeners.delete(listener)
  }
}

const input = new FakeInput()
const output = new FakeOutput()
let firstCleanup = 0
let secondCleanup = 0
const app = render(() => {
  onCleanup(() => { firstCleanup += 1 })
  return createComponent(Text, { children: "Hello Solid" })
}, { input, output })
assert.match(output.chunks.join(""), /Hello Solid/)
assert.doesNotMatch(output.chunks[0], /Hello Solid/)
assert.match(output.chunks[1], /Hello Solid/)
assert.deepEqual(input.rawModes, [true])
assert.equal(input.dataListeners.size, 1)
assert.equal(output.resizeListeners.size, 1)

const standbyStyles = new StyleTable()
const standbySurface = new MemoryCellSurface({ styles: standbyStyles })
const standby = createTuiSolidRoot({
  surface: standbySurface,
  styles: standbyStyles,
  size: { width: 20, height: 2 },
})
assert.throws(
  () => standby.render(() => createComponent(Text, { children: "Standby" })),
  /another TUI Solid root is active/i,
)
assert.doesNotMatch(standbySurface.text({ trimRight: true }), /Standby/)

const beforeCompetition = {
  rawModes: [...input.rawModes],
  resumeCount: input.resumeCount,
  pauseCount: input.pauseCount,
  dataListenerCount: input.dataListeners.size,
  resizeListenerCount: output.resizeListeners.size,
  chunks: [...output.chunks],
}
assert.throws(
  () => render(
    () => createComponent(Text, { children: "Rejected Solid" }),
    { input, output },
  ),
  /another TUI Solid root is active/i,
)
assert.deepEqual({
  rawModes: input.rawModes,
  resumeCount: input.resumeCount,
  pauseCount: input.pauseCount,
  dataListenerCount: input.dataListeners.size,
  resizeListenerCount: output.resizeListeners.size,
  chunks: output.chunks,
}, beforeCompetition)
assert.doesNotMatch(output.chunks.join(""), /Rejected Solid/)

const ownerChunkCount = output.chunks.length
assert.deepEqual(input.rawModes, [true])
assert.equal(input.resumeCount, 1)
assert.equal(input.pauseCount, 0)
assert.equal(input.dataListeners.size, 1)
assert.equal(output.resizeListeners.size, 1)

app.render(() => {
  onCleanup(() => { secondCleanup += 1 })
  return createComponent(Text, { children: "Solid replacement" })
})
assert.equal(firstCleanup, 1)
assert.ok(output.chunks.length > ownerChunkCount)
assert.match(output.chunks.join(""), /replacement/)
app.destroy()
assert.equal(secondCleanup, 1)
assert.deepEqual(input.rawModes, [true, false])
assert.equal(input.resumeCount, 1)
assert.equal(input.pauseCount, 1)
assert.equal(input.dataListeners.size, 0)
assert.equal(output.resizeListeners.size, 0)
app.destroy()
assert.equal(secondCleanup, 1)
assert.deepEqual(input.rawModes, [true, false])
assert.equal(input.resumeCount, 1)
assert.equal(input.pauseCount, 1)
standby.render(() => createComponent(Text, { children: "Standby" }))
assert.match(standbySurface.text({ trimRight: true }), /Standby/)
standby.destroy()

const failedInput = new FakeInput()
const failedOutput = new FakeOutput()
const replacementError = new Error("replacement mount failed")
const failedApp = render(
  () => createComponent(Text, { children: "Before failure" }),
  { input: failedInput, output: failedOutput },
)
failedOutput.leaveWriteFailuresRemaining = 2
assert.throws(
  () => failedApp.render(() => { throw replacementError }),
  (error) => error === replacementError,
)
assert.equal(failedOutput.leaveWriteAttempts, 1)
assert.equal(failedOutput.successfulLeaveWrites, 0)
assert.deepEqual(failedInput.rawModes, [true, false])
assert.equal(failedInput.resumeCount, 1)
assert.equal(failedInput.pauseCount, 1)
assert.equal(failedInput.dataListeners.size, 0)
assert.equal(failedOutput.resizeListeners.size, 0)

const enterSequence = String.fromCharCode(27) + "[?1049h"
const enterWritesBeforeBlockedOwner = failedOutput.chunks.filter((chunk) =>
  chunk.includes(enterSequence),
).length
assert.throws(
  () => render(
    () => createComponent(Text, { children: "Still blocked" }),
    { input: failedInput, output: failedOutput },
  ),
  /leave write failed/,
)
assert.equal(failedOutput.leaveWriteAttempts, 2)
assert.equal(failedOutput.successfulLeaveWrites, 0)
assert.equal(
  failedOutput.chunks.filter((chunk) => chunk.includes(enterSequence)).length,
  enterWritesBeforeBlockedOwner,
)
assert.ok(
  !failedOutput.chunks.join("").includes(String.fromCharCode(27) + "[?1049l"),
)

const nextOwner = render(
  () => createComponent(Text, { children: "Owner after failure" }),
  { input: failedInput, output: failedOutput },
)
assert.match(failedOutput.chunks.join(""), /Owner after failure/)
assert.deepEqual(failedInput.rawModes, [true, false, true])
assert.equal(failedInput.dataListeners.size, 1)
assert.equal(failedOutput.resizeListeners.size, 1)
const leaveAttemptsBeforeLostHandleDestroy = failedOutput.leaveWriteAttempts
failedApp.destroy()
failedApp.destroy()
assert.equal(failedOutput.leaveWriteAttempts, leaveAttemptsBeforeLostHandleDestroy)
assert.deepEqual(failedInput.rawModes, [true, false, true])
assert.equal(failedInput.dataListeners.size, 1)
assert.equal(failedOutput.resizeListeners.size, 1)
nextOwner.destroy()
assert.equal(failedOutput.leaveWriteAttempts, 4)
assert.equal(failedOutput.successfulLeaveWrites, 2)
assert.deepEqual(failedInput.rawModes, [true, false, true, false])
assert.equal(failedInput.resumeCount, 2)
assert.equal(failedInput.pauseCount, 2)
assert.equal(failedInput.dataListeners.size, 0)
assert.equal(failedOutput.resizeListeners.size, 0)

const constructionInput = new FakeInput()
const constructionOutput = new FakeOutput()
const constructionError = new Error("packed Solid enter acquisition failed")
const constructionCleanupError = new Error("packed Solid leave cleanup failed")
const originalConstructionWrite = constructionOutput.write.bind(constructionOutput)
let failConstructionEnter = true
let blockConstructionCleanup = true
let constructionEnterAttempts = 0
constructionOutput.write = (chunk) => {
  const enter = String.fromCharCode(27) + "[?1049h"
  const leave = String.fromCharCode(27) + "[?1049l"
  if (chunk.includes(enter)) {
    constructionEnterAttempts += 1
    if (failConstructionEnter) {
      failConstructionEnter = false
      throw constructionError
    }
  }
  if (chunk.includes(leave) && blockConstructionCleanup) {
    throw constructionCleanupError
  }
  originalConstructionWrite(chunk)
}
assert.throws(
  () => render(
    () => createComponent(Text, { children: "Never returned" }),
    { input: constructionInput, output: constructionOutput },
  ),
  (error) => error === constructionError,
)
const constructionEnterAttemptsBeforeBlockedRetry = constructionEnterAttempts
assert.throws(
  () => render(
    () => createComponent(Text, { children: "Still blocked" }),
    { input: constructionInput, output: constructionOutput },
  ),
  (error) => error === constructionCleanupError,
)
assert.equal(
  constructionEnterAttempts,
  constructionEnterAttemptsBeforeBlockedRetry,
)
blockConstructionCleanup = false
const recoveredSolid = render(
  () => createComponent(Text, { children: "Recovered Solid" }),
  { input: constructionInput, output: constructionOutput },
)
assert.match(constructionOutput.chunks.join(""), /Recovered Solid/)
assert.deepEqual(constructionInput.rawModes.at(-1), true)
assert.equal(constructionInput.dataListeners.size, 1)
assert.equal(constructionOutput.resizeListeners.size, 1)
recoveredSolid.destroy()
assert.deepEqual(constructionInput.rawModes.at(-1), false)
assert.equal(constructionInput.dataListeners.size, 0)
assert.equal(constructionOutput.resizeListeners.size, 0)

const doubleCleanupInput = new FakeInput()
const doubleCleanupOutput = new FakeOutput()
const doubleCleanupRootError = new Error("packed Solid disposer failed")
const doubleCleanupDriverError = new Error("packed Solid terminal leave failed")
let blockDoubleRootCleanup = true
let blockDoubleDriverCleanup = true
let doubleRootCleanupAttempts = 0
const doubleCleanupApp = render(() => {
  onCleanup(() => {
    doubleRootCleanupAttempts += 1
    if (blockDoubleRootCleanup) throw doubleCleanupRootError
  })
  return createComponent(Text, { children: "Double cleanup failure" })
}, { input: doubleCleanupInput, output: doubleCleanupOutput })
doubleCleanupOutput.failWrite = (chunk) => {
  const leave = String.fromCharCode(27) + "[?1049l"
  if (blockDoubleDriverCleanup && chunk.includes(leave)) {
    return doubleCleanupDriverError
  }
}
assert.throws(
  () => doubleCleanupApp.destroy(),
  (error) => error === doubleCleanupRootError,
)
assert.equal(doubleRootCleanupAttempts, 1)
assert.equal(doubleCleanupOutput.leaveWriteAttempts, 1)
assert.deepEqual(doubleCleanupInput.rawModes, [true, false])
assert.equal(doubleCleanupInput.resumeCount, 1)
assert.equal(doubleCleanupInput.pauseCount, 1)
assert.equal(doubleCleanupInput.dataListeners.size, 0)
assert.equal(doubleCleanupOutput.resizeListeners.size, 0)

blockDoubleRootCleanup = false
blockDoubleDriverCleanup = false
doubleCleanupApp.destroy()
assert.equal(doubleRootCleanupAttempts, 2)
assert.equal(doubleCleanupOutput.leaveWriteAttempts, 2)

const doubleCleanupReplacement = render(
  () => createComponent(Text, { children: "Double cleanup replacement" }),
  { input: doubleCleanupInput, output: doubleCleanupOutput },
)
const beforeDoubleCleanupStaleDestroy = {
  rawModes: [...doubleCleanupInput.rawModes],
  dataListeners: doubleCleanupInput.dataListeners.size,
  resizeListeners: doubleCleanupOutput.resizeListeners.size,
  leaveWriteAttempts: doubleCleanupOutput.leaveWriteAttempts,
}
doubleCleanupApp.destroy()
assert.deepEqual({
  rawModes: doubleCleanupInput.rawModes,
  dataListeners: doubleCleanupInput.dataListeners.size,
  resizeListeners: doubleCleanupOutput.resizeListeners.size,
  leaveWriteAttempts: doubleCleanupOutput.leaveWriteAttempts,
}, beforeDoubleCleanupStaleDestroy)
doubleCleanupReplacement.destroy()
assert.deepEqual(doubleCleanupInput.rawModes, [true, false, true, false])
assert.equal(doubleCleanupInput.resumeCount, 2)
assert.equal(doubleCleanupInput.pauseCount, 2)
assert.equal(doubleCleanupInput.dataListeners.size, 0)
assert.equal(doubleCleanupOutput.resizeListeners.size, 0)

const dedupeOldInput = new FakeInput()
const dedupeOldOutput = new FakeOutput()
const dedupeNextInput = new FakeInput()
const dedupeNextOutput = new FakeOutput()
const dedupeError = new Error("packed Solid disposer remains blocked")
let dedupeBlocked = true
let dedupeAttempts = 0
let dedupeConcurrent = 0
let dedupeMaxConcurrent = 0
let dedupeReentrantError
const dedupeCore = new TerminalDriver({
  input: dedupeOldInput,
  output: dedupeOldOutput,
  onEvent: () => {},
})
const dedupeApp = render(
  () => {
    onCleanup(() => {
      dedupeAttempts += 1
      dedupeConcurrent += 1
      dedupeMaxConcurrent = Math.max(dedupeMaxConcurrent, dedupeConcurrent)
      try {
        if (dedupeAttempts === 2) {
          try {
            dedupeCore.start()
          } catch (error) {
            dedupeReentrantError = error
          }
        }
        if (dedupeBlocked) throw dedupeError
      } finally {
        dedupeConcurrent -= 1
      }
    })
    return createComponent(Text, { children: "Old dedupe owner" })
  },
  { input: dedupeOldInput, output: dedupeOldOutput },
)
assert.throws(() => dedupeApp.destroy(), (error) => error === dedupeError)
assert.equal(dedupeAttempts, 1)
assert.throws(
  () => render(
    () => createComponent(Text, { children: "Blocked dedupe owner" }),
    { input: dedupeNextInput, output: dedupeNextOutput },
  ),
  (error) => error === dedupeError,
)
assert.equal(dedupeAttempts, 2)
assert.equal(dedupeMaxConcurrent, 1)
assert.match(dedupeReentrantError.message, /already owned/i)
assert.deepEqual(dedupeNextInput.rawModes, [])
dedupeBlocked = false
const dedupeReplacement = render(
  () => createComponent(Text, { children: "Recovered dedupe owner" }),
  { input: dedupeNextInput, output: dedupeNextOutput },
)
assert.equal(dedupeAttempts, 3)
dedupeCore.start()
const beforeDedupeStaleUse = {
  oldRawModes: [...dedupeOldInput.rawModes],
  oldChunks: [...dedupeOldOutput.chunks],
  nextRawModes: [...dedupeNextInput.rawModes],
  nextChunks: [...dedupeNextOutput.chunks],
}
dedupeApp.destroy()
assert.throws(
  () => dedupeApp.render(
    () => createComponent(Text, { children: "Stale dedupe owner" }),
  ),
  /teardown|destroyed/i,
)
assert.throws(
  () => dedupeApp.host.renderer.setRoot({ type: "text", text: "Stale dedupe renderer" }),
  /teardown|destroy/i,
)
assert.deepEqual({
  oldRawModes: dedupeOldInput.rawModes,
  oldChunks: dedupeOldOutput.chunks,
  nextRawModes: dedupeNextInput.rawModes,
  nextChunks: dedupeNextOutput.chunks,
}, beforeDedupeStaleUse)
dedupeCore.stop()
dedupeReplacement.destroy()

const solidBarrierInput = new FakeInput()
const solidBarrierOutput = new FakeOutput()
const solidBarrierError = new Error("packed Solid surface cleanup failed")
const solidBarrierReset = String.fromCharCode(27) + "[0m" + String.fromCharCode(27) + "[?25h"
let blockSolidBarrierCleanup = true
let solidBarrierCleanupAttempts = 0
solidBarrierOutput.failWrite = (chunk) => {
  if (chunk === solidBarrierReset) {
    solidBarrierCleanupAttempts += 1
    if (blockSolidBarrierCleanup) return solidBarrierError
  }
}
const solidBarrierApp = render(
  () => createComponent(Text, { children: "Old Solid barrier" }),
  { input: solidBarrierInput, output: solidBarrierOutput },
)
assert.throws(
  () => solidBarrierApp.destroy(),
  (error) => error === solidBarrierError,
)
const blockedCoreDriver = new TerminalDriver({
  input: solidBarrierInput,
  output: solidBarrierOutput,
  onEvent: () => {},
})
const solidBarrierEnter = String.fromCharCode(27) + "[?1049h"
const solidBarrierEnterWritesBeforeBlocked = solidBarrierOutput.chunks.filter((chunk) =>
  chunk.includes(solidBarrierEnter),
).length
assert.throws(
  () => blockedCoreDriver.start(),
  (error) => error === solidBarrierError,
)
assert.equal(
  solidBarrierOutput.chunks.filter((chunk) =>
    chunk.includes(solidBarrierEnter),
  ).length,
  solidBarrierEnterWritesBeforeBlocked,
)
assert.deepEqual(solidBarrierInput.rawModes, [true, false])
assert.equal(solidBarrierInput.dataListeners.size, 0)
assert.equal(solidBarrierOutput.resizeListeners.size, 0)
blockSolidBarrierCleanup = false
const solidCoreReplacement = new TerminalDriver({
  input: solidBarrierInput,
  output: solidBarrierOutput,
  onEvent: () => {},
})
solidCoreReplacement.start()
assert.equal(solidBarrierCleanupAttempts, 3)
const beforeSolidBarrierStaleUse = {
  rawModes: [...solidBarrierInput.rawModes],
  chunks: [...solidBarrierOutput.chunks],
  dataListeners: solidBarrierInput.dataListeners.size,
  resizeListeners: solidBarrierOutput.resizeListeners.size,
}
solidBarrierApp.destroy()
assert.throws(
  () => solidBarrierApp.render(
    () => createComponent(Text, { children: "Stale Solid render" }),
  ),
  /teardown|destroyed/i,
)
assert.throws(
  () => solidBarrierApp.dispatchInput({ type: "text", text: "x" }),
  /teardown|destroyed/i,
)
assert.throws(
  () => solidBarrierApp.host.renderer.setRoot({ type: "text", text: "Stale renderer" }),
  /teardown|destroy/i,
)
assert.throws(() => solidBarrierApp.host.renderer.flush(), /teardown|destroy/i)
assert.deepEqual({
  rawModes: solidBarrierInput.rawModes,
  chunks: solidBarrierOutput.chunks,
  dataListeners: solidBarrierInput.dataListeners.size,
  resizeListeners: solidBarrierOutput.resizeListeners.size,
}, beforeSolidBarrierStaleUse)
solidCoreReplacement.stop()
assert.deepEqual(solidBarrierInput.rawModes, [true, false, true, false])
assert.equal(solidBarrierInput.dataListeners.size, 0)
assert.equal(solidBarrierOutput.resizeListeners.size, 0)

const driverOnlyInput = new FakeInput()
const driverOnlyOutput = new FakeOutput()
const driverOnlyError = new Error("packed Solid driver-only leave failed")
let blockDriverOnlyCleanup = true
let driverOnlyRootCleanupAttempts = 0
const driverOnlyApp = render(() => {
  onCleanup(() => { driverOnlyRootCleanupAttempts += 1 })
  return createComponent(Text, { children: "Driver-only cleanup" })
}, { input: driverOnlyInput, output: driverOnlyOutput })
driverOnlyOutput.failWrite = (chunk) => {
  const leave = String.fromCharCode(27) + "[?1049l"
  if (blockDriverOnlyCleanup && chunk.includes(leave)) {
    return driverOnlyError
  }
}
assert.throws(
  () => driverOnlyApp.destroy(),
  (error) => error === driverOnlyError,
)
assert.equal(driverOnlyRootCleanupAttempts, 1)
assert.equal(driverOnlyOutput.leaveWriteAttempts, 1)
assert.deepEqual(driverOnlyInput.rawModes, [true, false])
assert.equal(driverOnlyInput.resumeCount, 1)
assert.equal(driverOnlyInput.pauseCount, 1)
assert.equal(driverOnlyInput.dataListeners.size, 0)
assert.equal(driverOnlyOutput.resizeListeners.size, 0)

blockDriverOnlyCleanup = false
driverOnlyApp.destroy()
assert.equal(driverOnlyRootCleanupAttempts, 1)
assert.equal(driverOnlyOutput.leaveWriteAttempts, 2)
const driverOnlyReplacement = render(
  () => createComponent(Text, { children: "Driver-only replacement" }),
  { input: driverOnlyInput, output: driverOnlyOutput },
)
const beforeDriverOnlyStaleDestroy = {
  rawModes: [...driverOnlyInput.rawModes],
  dataListeners: driverOnlyInput.dataListeners.size,
  resizeListeners: driverOnlyOutput.resizeListeners.size,
  leaveWriteAttempts: driverOnlyOutput.leaveWriteAttempts,
}
driverOnlyApp.destroy()
assert.deepEqual({
  rawModes: driverOnlyInput.rawModes,
  dataListeners: driverOnlyInput.dataListeners.size,
  resizeListeners: driverOnlyOutput.resizeListeners.size,
  leaveWriteAttempts: driverOnlyOutput.leaveWriteAttempts,
}, beforeDriverOnlyStaleDestroy)
driverOnlyReplacement.destroy()
assert.deepEqual(driverOnlyInput.rawModes, [true, false, true, false])
assert.equal(driverOnlyInput.resumeCount, 2)
assert.equal(driverOnlyInput.pauseCount, 2)
assert.equal(driverOnlyInput.dataListeners.size, 0)
assert.equal(driverOnlyOutput.resizeListeners.size, 0)

const lostRootInput = new FakeInput()
const lostRootOutput = new FakeOutput()
const lostRootSyncError = new Error("packed Solid initial sync failed")
const lostRootCleanupError = new Error("packed Solid disposer failed")
let failLostRootSync = true
let blockLostRootCleanup = true
let lostRootCleanupAttempts = 0
lostRootOutput.failWrite = (chunk) => {
  if (failLostRootSync && chunk.includes("Lost packed root")) {
    failLostRootSync = false
    return lostRootSyncError
  }
}
assert.throws(
  () => render(() => {
    onCleanup(() => {
      lostRootCleanupAttempts += 1
      if (blockLostRootCleanup) throw lostRootCleanupError
    })
    return createComponent(Text, { children: "Lost packed root" })
  }, { input: lostRootInput, output: lostRootOutput }),
  (error) => error === lostRootSyncError,
)
assert.equal(lostRootCleanupAttempts, 1)
assert.deepEqual(lostRootInput.rawModes, [true, false])
assert.equal(lostRootInput.dataListeners.size, 0)
assert.equal(lostRootOutput.resizeListeners.size, 0)

const blockedRootInput = new FakeInput()
const blockedRootOutput = new FakeOutput()
assert.throws(
  () => render(
    () => createComponent(Text, { children: "Blocked by cleanup" }),
    { input: blockedRootInput, output: blockedRootOutput },
  ),
  (error) => error === lostRootCleanupError,
)
assert.equal(lostRootCleanupAttempts, 2)
assert.deepEqual(blockedRootInput.rawModes, [])
assert.equal(blockedRootInput.resumeCount, 0)
assert.equal(blockedRootInput.pauseCount, 0)
assert.equal(blockedRootInput.dataListeners.size, 0)
assert.equal(blockedRootOutput.resizeListeners.size, 0)
assert.deepEqual(blockedRootOutput.chunks, [])

blockLostRootCleanup = false
const recoveredRootInput = new FakeInput()
const recoveredRootOutput = new FakeOutput()
recoveredRootOutput.columns = 30
const recoveredRoot = render(
  () => createComponent(Text, { children: "Recovered packed root" }),
  { input: recoveredRootInput, output: recoveredRootOutput },
)
assert.equal(lostRootCleanupAttempts, 3)
assert.match(recoveredRootOutput.chunks.join(""), /Recovered packed root/)
assert.deepEqual(recoveredRootInput.rawModes, [true])
assert.equal(recoveredRootInput.dataListeners.size, 1)
assert.equal(recoveredRootOutput.resizeListeners.size, 1)
recoveredRoot.destroy()
assert.deepEqual(recoveredRootInput.rawModes, [true, false])
assert.equal(recoveredRootInput.dataListeners.size, 0)
assert.equal(recoveredRootOutput.resizeListeners.size, 0)
`,
    typeScriptFixture: {
      source: `
import "@uniview/tui-solid/jsx-runtime"
import { createSignal } from "solid-js"
import { Text } from "@uniview/tui-solid"
import { univiewSolid } from "@uniview/tui-solid/vite"

const [count, setCount] = createSignal(1)
const inferredCount: number = count()
setCount(inferredCount + 1)
const intrinsic = <box><text>Hello intrinsic</text></box>
const component = <Text>Hello component</Text>
const plugin = univiewSolid()
void count
void intrinsic
void component
void plugin
`,
      config: {
        compilerOptions: {
          isolatedModules: true,
          jsx: "preserve",
          jsxImportSource: "solid-js",
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          strict: true,
          target: "ES2022",
        },
        include: ["smoke.tsx"],
      },
    },
  });

  const coreManifest = await installedManifest(
    coreProject,
    publicPackages.core.name,
  );
  const reactManifest = await installedManifest(
    reactProject,
    publicPackages.react.name,
  );
  const solidManifest = await installedManifest(
    solidProject,
    publicPackages.solid.name,
  );
  for (const projectDirectory of [solidProject, `${solidProject}-production`]) {
    const installedSolid = await installedManifest(
      projectDirectory,
      "solid-js",
    );
    assert.equal(installedSolid.version, "1.9.10");
    await assertSingleInstalledVersion(projectDirectory, "solid-js", "1.9.10");
  }

  for (const [key, manifest] of Object.entries({
    core: coreManifest,
    react: reactManifest,
    solid: solidManifest,
  })) {
    assert.equal(manifest.name, publicPackages[key].name);
    assert.equal(manifest.version, packedManifests[key].version);
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
      "peerDependenciesMeta",
    ]) {
      assert.deepEqual(
        manifest[field] ?? {},
        packedManifests[key][field] ?? {},
        `${manifest.name} installed ${field}`,
      );
    }
  }

  console.log(
    `TUI normal and production-only tarball smoke tests passed on ${process.version}`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
