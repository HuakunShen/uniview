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
  coreTarball,
  offlineOverrides,
  source,
  typeScriptFixture,
}) {
  await mkdir(directory, { recursive: true });
  assert.equal(
    Object.keys(dependencies).length,
    directory.endsWith("core") ? 1 : 2,
    `${directory}: unexpected direct dependency count`,
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
  const localNodeTypesRoot = dirname(
    await realpath(join(repo, "packages/tui-solid/node_modules/@types/node")),
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
    coreTarball: packs.core.filename,
    offlineOverrides: reactOfflineOverrides,
    source: `
import assert from "node:assert/strict"
import { createElement } from "react"
import { createTuiReactRoot, MemoryCellSurface, StyleTable, Text } from "@uniview/tui-react"
const styles = new StyleTable()
const surface = new MemoryCellSurface({ styles })
const root = createTuiReactRoot({ surface, styles, size: { width: 20, height: 2 } })
root.render(createElement(Text, null, "Hello React"))
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
assert.match(surface.text({ trimRight: true }), /Hello React/)
root.destroy()
`,
  });

  const solidProject = join(temporaryRoot, "solid");
  await createProject({
    directory: solidProject,
    dependencies: {
      "@uniview/tui-solid": `file:${packs.solid.filename}`,
      "solid-js": `file:${localSolid}`,
    },
    coreTarball: packs.core.filename,
    offlineOverrides: solidOfflineOverrides,
    source: `
import assert from "node:assert/strict"
import { createComponent } from "solid-js"
import { createTuiSolidRoot, MemoryCellSurface, StyleTable, Text } from "@uniview/tui-solid"
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

const styles = new StyleTable()
const surface = new MemoryCellSurface({ styles })
const root = createTuiSolidRoot({ surface, styles, size: { width: 20, height: 2 } })
root.render(() => createComponent(Text, { children: "Hello Solid" }))
assert.match(surface.text({ trimRight: true }), /Hello Solid/)
root.destroy()
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
          typeRoots: [localNodeTypesRoot],
          types: ["node"],
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
