import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

export const TUI_TARBALL_DESCRIPTOR = "tui-tarballs.json";

const packageDefinitions = {
  core: "@uniview/tui-core",
  react: "@uniview/tui-react",
  solid: "@uniview/tui-solid",
};
const packageKeys = Object.keys(packageDefinitions);

export function parseSmokeArguments(arguments_) {
  if (arguments_.length === 0) return { mode: "default" };
  if (arguments_.length === 2 && arguments_[0] === "--prepare") {
    return { mode: "prepare", outputDirectory: arguments_[1] };
  }
  if (arguments_.length === 2 && arguments_[0] === "--reuse") {
    return { mode: "reuse", descriptorPath: arguments_[1] };
  }
  throw new Error(
    "Usage: smoke-tui-tarballs.mjs [--prepare <artifact-directory> | --reuse <descriptor-path>]",
  );
}

function assertExactKeys(actual, expected, message) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), message);
}

function tarString(archive, offset, length) {
  const field = archive.subarray(offset, offset + length);
  const terminator = field.indexOf(0);
  return field
    .subarray(0, terminator === -1 ? field.length : terminator)
    .toString("utf8")
    .trim();
}

export async function inspectTarball(filename) {
  const archive = gunzipSync(await readFile(filename));
  const files = [];
  let manifest;
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const name = tarString(archive, offset, 100);
    if (!name) break;
    const prefix = tarString(archive, offset + 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const sizeField = tarString(archive, offset + 124, 12);
    const size = Number.parseInt(sizeField || "0", 8);
    assert.ok(
      Number.isSafeInteger(size),
      `${filename}: invalid tar entry size`,
    );
    const contentStart = offset + 512;
    if (path.startsWith("package/") && !path.endsWith("/")) {
      const packagePath = path.slice("package/".length);
      files.push(packagePath);
      if (packagePath === "package.json") {
        manifest = JSON.parse(
          archive.subarray(contentStart, contentStart + size).toString("utf8"),
        );
      }
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  assert.ok(manifest, `${filename}: missing packed package/package.json`);
  return { manifest, files: files.sort() };
}

async function sha256(filename) {
  return createHash("sha256")
    .update(await readFile(filename))
    .digest("hex");
}

function validateInspection(key, inspection) {
  const expectedName = packageDefinitions[key];
  assert.equal(
    inspection.manifest.name,
    expectedName,
    `${key}: packed manifest name`,
  );
  assert.equal(
    typeof inspection.manifest.version,
    "string",
    `${expectedName}: packed manifest version`,
  );
  assert.ok(
    inspection.manifest.version.length > 0,
    `${expectedName}: packed manifest version`,
  );
  assert.ok(
    inspection.files.includes("package.json"),
    `${expectedName}: packed files must include package.json`,
  );
}

export async function writeTarballDescriptor({
  directory,
  tarballs,
  inspectTarball: inspect = inspectTarball,
}) {
  assertExactKeys(
    Object.keys(tarballs),
    packageKeys,
    "tarball preparation must contain exactly core, react, and solid",
  );
  const artifactDirectory = await realpath(directory);
  const packages = {};
  let releaseVersion;
  for (const key of packageKeys) {
    const filename = await realpath(tarballs[key]);
    assert.equal(
      dirname(filename),
      artifactDirectory,
      `${key}: tarball must be inside the artifact directory`,
    );
    const inspection = await inspect(filename);
    validateInspection(key, inspection);
    releaseVersion ??= inspection.manifest.version;
    assert.equal(
      inspection.manifest.version,
      releaseVersion,
      "all release tarballs must use one version",
    );
    packages[key] = {
      name: packageDefinitions[key],
      version: inspection.manifest.version,
      file: basename(filename),
      sha256: await sha256(filename),
      manifest: inspection.manifest,
      files: [...inspection.files].sort(),
    };
  }

  const descriptorPath = join(artifactDirectory, TUI_TARBALL_DESCRIPTOR);
  await writeFile(
    descriptorPath,
    `${JSON.stringify({ schemaVersion: 1, packages }, null, 2)}\n`,
  );
  return descriptorPath;
}

export async function loadTarballDescriptor({
  descriptorPath,
  inspectTarball: inspect = inspectTarball,
}) {
  const resolvedDescriptor = await realpath(descriptorPath);
  const artifactDirectory = await realpath(dirname(resolvedDescriptor));
  const descriptor = JSON.parse(await readFile(resolvedDescriptor, "utf8"));
  assertExactKeys(
    Object.keys(descriptor),
    ["schemaVersion", "packages"],
    "tarball descriptor fields",
  );
  assert.equal(descriptor.schemaVersion, 1, "tarball descriptor schemaVersion");
  assert.ok(
    descriptor.packages && typeof descriptor.packages === "object",
    "tarball descriptor packages",
  );
  assertExactKeys(
    Object.keys(descriptor.packages),
    packageKeys,
    "tarball descriptor must contain exactly core, react, and solid",
  );

  const packages = {};
  let releaseVersion;
  for (const key of packageKeys) {
    const entry = descriptor.packages[key];
    assertExactKeys(
      Object.keys(entry),
      ["name", "version", "file", "sha256", "manifest", "files"],
      `${key}: tarball descriptor fields`,
    );
    assert.equal(entry.name, packageDefinitions[key], `${key}: package name`);
    assert.equal(
      entry.file,
      basename(entry.file),
      `${key}: tarball file must be a safe basename`,
    );
    assert.ok(entry.file.endsWith(".tgz"), `${key}: tarball file extension`);
    const filename = await realpath(resolve(artifactDirectory, entry.file));
    assert.equal(
      dirname(filename),
      artifactDirectory,
      `${key}: tarball escaped the artifact directory`,
    );
    assert.equal(
      await sha256(filename),
      entry.sha256,
      `${key}: tarball sha256`,
    );

    const inspection = await inspect(filename);
    validateInspection(key, inspection);
    assert.equal(entry.version, inspection.manifest.version, `${key}: version`);
    assert.deepEqual(
      inspection.manifest,
      entry.manifest,
      `${key}: packed manifest changed`,
    );
    assert.deepEqual(
      [...inspection.files].sort(),
      entry.files,
      `${key}: packed files changed`,
    );
    releaseVersion ??= entry.version;
    assert.equal(entry.version, releaseVersion, "release version mismatch");
    packages[key] = {
      name: entry.name,
      version: entry.version,
      filename,
      manifest: inspection.manifest,
      files: inspection.files.map((path) => ({ path })),
    };
  }

  return { descriptorPath: resolvedDescriptor, packages };
}
