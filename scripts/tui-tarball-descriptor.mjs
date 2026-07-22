import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, resolve } from "node:path";
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

function tarField(archive, offset, length) {
  const field = archive.subarray(offset, offset + length);
  const terminator = field.indexOf(0);
  return field
    .subarray(0, terminator === -1 ? field.length : terminator)
    .toString("utf8");
}

function validateTarPath(filename, path) {
  assert.ok(path.length > 0, `${filename}: empty tar path`);
  assert.ok(!path.includes("\\"), `${filename}: backslash in tar path ${path}`);
  assert.ok(!posix.isAbsolute(path), `${filename}: absolute tar path ${path}`);
  assert.equal(
    posix.normalize(path),
    path,
    `${filename}: tar path is not normalized: ${path}`,
  );
  assert.ok(
    path
      .split("/")
      .every((segment) => segment && segment !== "." && segment !== ".."),
    `${filename}: unsafe tar path segment: ${path}`,
  );
  assert.ok(
    path.startsWith("package/"),
    `${filename}: tar path is outside the package prefix: ${path}`,
  );
  const packagePath = path.slice("package/".length);
  assert.ok(packagePath.length > 0, `${filename}: empty package tar path`);
  return packagePath;
}

export async function inspectTarball(filename) {
  const archive = gunzipSync(await readFile(filename));
  assert.equal(
    archive.length % 512,
    0,
    `${filename}: tar archive exceeds 512-byte bounds`,
  );
  const files = [];
  const seenFiles = new Set();
  let manifest;
  let offset = 0;
  let foundEndOfArchive = false;
  while (offset < archive.length) {
    assert.ok(
      offset + 512 <= archive.length,
      `${filename}: truncated tar header`,
    );
    const header = archive.subarray(offset, offset + 512);
    const name = tarField(archive, offset, 100);
    if (!name) {
      assert.ok(
        header.every((byte) => byte === 0),
        `${filename}: invalid empty tar header`,
      );
      assert.ok(
        offset + 1024 <= archive.length,
        `${filename}: missing two-block tar EOF trailer`,
      );
      assert.ok(
        archive.subarray(offset).every((byte) => byte === 0),
        `${filename}: invalid tar EOF trailer`,
      );
      foundEndOfArchive = true;
      break;
    }
    const prefix = tarField(archive, offset + 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const packagePath = validateTarPath(filename, path);
    const type = tarField(archive, offset + 156, 1);
    assert.ok(
      type === "" || type === "0",
      `${filename}: unsupported tar entry type ${JSON.stringify(type)} for ${path}`,
    );
    const sizeField = tarField(archive, offset + 124, 12).trim();
    assert.match(sizeField || "0", /^[0-7]+$/, `${filename}: invalid tar size`);
    const size = Number.parseInt(sizeField || "0", 8);
    assert.ok(
      Number.isSafeInteger(size) && size >= 0,
      `${filename}: invalid tar entry size`,
    );
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    const paddedEnd = contentStart + Math.ceil(size / 512) * 512;
    assert.ok(
      Number.isSafeInteger(contentEnd) &&
        Number.isSafeInteger(paddedEnd) &&
        contentEnd <= archive.length &&
        paddedEnd <= archive.length,
      `${filename}: tar entry content exceeds archive bounds: ${path}`,
    );
    if (packagePath === "package.json" && manifest !== undefined) {
      assert.fail(`${filename}: duplicate manifest`);
    }
    assert.ok(
      !seenFiles.has(packagePath),
      `${filename}: duplicate tar file ${packagePath}`,
    );
    seenFiles.add(packagePath);
    files.push(packagePath);
    if (packagePath === "package.json") {
      manifest = JSON.parse(
        archive.subarray(contentStart, contentEnd).toString("utf8"),
      );
    }
    offset = paddedEnd;
  }
  assert.ok(foundEndOfArchive, `${filename}: missing two-block tar EOF trailer`);
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

async function assertArtifactContents(directory, expected, message) {
  assert.deepEqual(
    (await readdir(directory)).sort(),
    [...expected].sort(),
    `${message}: artifact directory has missing or extra files`,
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
  const tarballFiles = [];
  let releaseVersion;
  for (const key of packageKeys) {
    const filename = await realpath(tarballs[key]);
    assert.equal(
      dirname(filename),
      artifactDirectory,
      `${key}: tarball must be inside the artifact directory`,
    );
    tarballFiles.push(basename(filename));
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
  const existingFiles = await readdir(artifactDirectory);
  const expectedBeforeWrite = existingFiles.includes(TUI_TARBALL_DESCRIPTOR)
    ? [...tarballFiles, TUI_TARBALL_DESCRIPTOR]
    : tarballFiles;
  await assertArtifactContents(
    artifactDirectory,
    expectedBeforeWrite,
    "tarball preparation",
  );
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
  assert.equal(
    basename(resolvedDescriptor),
    TUI_TARBALL_DESCRIPTOR,
    "tarball descriptor filename",
  );
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

  await assertArtifactContents(
    artifactDirectory,
    [
      TUI_TARBALL_DESCRIPTOR,
      ...packageKeys.map((key) => descriptor.packages[key].file),
    ],
    "tarball descriptor",
  );

  return { descriptorPath: resolvedDescriptor, packages };
}
