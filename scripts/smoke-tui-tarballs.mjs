import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
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

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
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

function tarString(archive, offset, length) {
  const field = archive.subarray(offset, offset + length);
  const terminator = field.indexOf(0);
  return field
    .subarray(0, terminator === -1 ? field.length : terminator)
    .toString("utf8")
    .trim();
}

async function packedManifest(tarball) {
  const archive = gunzipSync(await readFile(tarball));
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const name = tarString(archive, offset, 100);
    if (!name) break;
    const prefix = tarString(archive, offset + 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const sizeField = tarString(archive, offset + 124, 12);
    const size = Number.parseInt(sizeField || "0", 8);
    assert.ok(Number.isSafeInteger(size), `${tarball}: invalid tar entry size`);
    const contentStart = offset + 512;
    if (path === "package/package.json") {
      return JSON.parse(
        archive.subarray(contentStart, contentStart + size).toString("utf8"),
      );
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  assert.fail(`${tarball}: missing packed package/package.json`);
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
  await mkdir(directory, { recursive: true });
  assert.deepEqual(
    Object.keys(dependencies).sort(),
    [...expectedDirectDependencies].sort(),
    `${directory}: unexpected direct runtime dependencies`,
  );
  await writeJson(join(directory, "package.json"), {
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
  await writeFile(join(directory, "smoke.mjs"), source);
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

const temporaryRoot = await mkdtemp(join(tmpdir(), "uniview-tui-release-"));
try {
  const tarballDirectory = join(temporaryRoot, "tarballs");
  await mkdir(tarballDirectory);
  const packs = {};
  for (const [key, definition] of Object.entries(publicPackages)) {
    packs[key] = await packPackage(definition, tarballDirectory);
  }
  assert.equal(
    Object.keys(packs).length,
    3,
    "release smoke must pack exactly three packages",
  );

  // Inspect the real packed manifests before local offline overrides can alter
  // resolution. Exact objects make dependency-range drift a release failure.
  const packedManifests = {
    core: await packedManifest(packs.core.filename),
    react: await packedManifest(packs.react.filename),
    solid: await packedManifest(packs.solid.filename),
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
      "solid-js": "^1.9.0",
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
import { MemoryCellSurface, StyleTable, stringCellWidth } from "@uniview/tui-core"
const styles = new StyleTable()
const surface = new MemoryCellSurface({ styles })
assert.ok(surface)
assert.equal(stringCellWidth("界"), 2)
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

class FakeInput {
  isTTY = true
  rawModes = []
  dataListeners = new Set()
  setRawMode(mode) { this.rawModes.push(mode) }
  resume() {}
  pause() {}
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
      "solid-js": `file:${localSolid}`,
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

  console.log("TUI tarball smoke tests passed");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
