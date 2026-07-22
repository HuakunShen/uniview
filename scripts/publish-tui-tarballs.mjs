import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadTarballDescriptor,
  TUI_TARBALL_DESCRIPTOR,
} from "./tui-tarball-descriptor.mjs";

const defaultRepoDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageDefinitions = {
  core: "@uniview/tui-core",
  react: "@uniview/tui-react",
  solid: "@uniview/tui-solid",
};
const packageOrder = Object.keys(packageDefinitions);

export function parsePublishArguments(arguments_) {
  if (arguments_.length === 0) return { dryRun: false };
  if (arguments_.length === 1 && arguments_[0] === "--dry-run") {
    return { dryRun: true };
  }
  throw new Error("Usage: publish-tui-tarballs.mjs [--dry-run]");
}

export function assertSupportedNodeVersion(version = process.versions.node) {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  assert.ok(
    Number.isInteger(major) && major >= 24,
    `TUI publication requires Node 24 or newer; received ${version}`,
  );
}

async function assertReleaseRootDirectory({
  repoDirectory,
  releaseRootDirectory,
}) {
  const expectedLexical = resolve(repoDirectory, ".tui-release");
  assert.equal(
    resolve(releaseRootDirectory),
    expectedLexical,
    `release artifacts must use the exact .tui-release root: ${expectedLexical}`,
  );
  await mkdir(expectedLexical, { recursive: true });
  const [repoReal, rootReal] = await Promise.all([
    realpath(repoDirectory),
    realpath(expectedLexical),
  ]);
  const expectedReal = join(repoReal, ".tui-release");
  assert.equal(
    rootReal,
    expectedReal,
    `release root must not escape the repository through a symlink: ${expectedReal}`,
  );
  return rootReal;
}

export async function assertSafeReleaseRunDirectory({
  repoDirectory,
  releaseRootDirectory,
  runDirectory,
}) {
  assert.ok(isAbsolute(runDirectory), "release run directory must be absolute");
  assert.equal(
    runDirectory,
    resolve(runDirectory),
    "release run directory must not contain traversal",
  );
  const rootReal = await assertReleaseRootDirectory({
    repoDirectory,
    releaseRootDirectory,
  });
  const status = await lstat(runDirectory);
  assert.ok(
    status.isDirectory() && !status.isSymbolicLink(),
    "release run must be a real directory, not a symlink",
  );
  const runReal = await realpath(runDirectory);
  assert.equal(
    dirname(runReal),
    rootReal,
    "release run must be a safe direct child of the .tui-release root",
  );
  assert.match(
    basename(runReal),
    /^run-[A-Za-z0-9_-]+$/,
    "release run must use the run- prefix",
  );
  return runReal;
}

export async function createReleaseRunDirectory({
  repoDirectory,
  releaseRootDirectory,
}) {
  const rootReal = await assertReleaseRootDirectory({
    repoDirectory,
    releaseRootDirectory,
  });
  const runDirectory = await mkdtemp(join(rootReal, "run-"));
  return assertSafeReleaseRunDirectory({
    repoDirectory,
    releaseRootDirectory,
    runDirectory,
  });
}

export async function acquireReleaseLock({
  repoDirectory,
  releaseRootDirectory,
}) {
  const rootReal = await assertReleaseRootDirectory({
    repoDirectory,
    releaseRootDirectory,
  });
  const lockPath = join(rootReal, ".publish.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error(
        `TUI release is already locked at ${lockPath}; if a previous process crashed, audit the preserved runs and remove the stale lock manually`,
        { cause: error },
      );
    }
    throw error;
  }

  try {
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
    );
  } catch (error) {
    await handle.close();
    await unlink(lockPath).catch(() => {});
    throw error;
  }

  const owned = await handle.stat();
  let released = false;
  return {
    lockPath,
    async release() {
      if (released) return;
      released = true;
      await handle.close();
      const current = await lstat(lockPath);
      assert.equal(
        `${current.dev}:${current.ino}`,
        `${owned.dev}:${owned.ino}`,
        `release lock identity changed; audit manually before removing ${lockPath}`,
      );
      await unlink(lockPath);
    },
  };
}

function runCommandWithInheritedIo({ command, args, cwd }) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.signal ?? `exit code ${result.status}`}`,
    );
  }
}

function normalizePackageFiles(files, key) {
  assert.ok(Array.isArray(files), `${key}: packed files must be an array`);
  return files
    .map((file) => (typeof file === "string" ? file : file?.path))
    .map((file) => {
      assert.equal(typeof file, "string", `${key}: packed file path`);
      return file;
    })
    .sort();
}

function assertPreparedArtifact(prepared) {
  assert.deepEqual(
    Object.keys(prepared.packages ?? {}).sort(),
    [...packageOrder].sort(),
    "publish descriptor must contain exactly core, react, and solid",
  );
  assert.ok(
    isAbsolute(prepared.descriptorPath),
    "publish descriptor path must be absolute",
  );
  assert.match(
    prepared.descriptorSha256,
    /^[a-f0-9]{64}$/,
    "publish descriptor sha256",
  );
  const artifactDirectory = dirname(prepared.descriptorPath);
  for (const key of packageOrder) {
    const entry = prepared.packages[key];
    assert.equal(
      entry.name,
      packageDefinitions[key],
      `${key}: expected ${packageDefinitions[key]}`,
    );
    assert.ok(
      isAbsolute(entry.filename),
      `${key}: tarball path must be absolute`,
    );
    assert.equal(
      dirname(entry.filename),
      artifactDirectory,
      `${key}: tarball must be beside the descriptor`,
    );
    assert.equal(
      entry.file,
      basename(entry.filename),
      `${key}: tarball basename`,
    );
    assert.equal(typeof entry.version, "string", `${key}: package version`);
    assert.ok(entry.version.length > 0, `${key}: package version`);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, `${key}: tarball sha256`);
    assert.ok(
      entry.manifest && typeof entry.manifest === "object",
      `${key}: packed manifest`,
    );
    normalizePackageFiles(entry.files, key);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function createPreparedArtifactSnapshot(prepared) {
  assertPreparedArtifact(prepared);
  const packages = {};
  for (const key of packageOrder) {
    const entry = prepared.packages[key];
    packages[key] = {
      name: entry.name,
      version: entry.version,
      file: entry.file,
      sha256: entry.sha256,
      filename: entry.filename,
      manifest: structuredClone(entry.manifest),
      files: normalizePackageFiles(entry.files, key),
    };
  }
  return deepFreeze({
    descriptorPath: prepared.descriptorPath,
    descriptorSha256: prepared.descriptorSha256,
    packages,
  });
}

export function assertPreparedArtifactMatchesSnapshot(prepared, snapshot) {
  const candidate = createPreparedArtifactSnapshot(prepared);
  assert.deepEqual(
    candidate,
    snapshot,
    "immutable TUI release artifact identity changed",
  );
}

export function createPublishCommandPlan(
  prepared,
  { cwd = defaultRepoDirectory, dryRun = false } = {},
) {
  assertPreparedArtifact(prepared);
  return packageOrder.map((key) => {
    const args = [
      "publish",
      prepared.packages[key].filename,
      "--access",
      "public",
      "--ignore-scripts",
      "--publish-branch",
      "main",
    ];
    if (dryRun) args.push("--dry-run");
    return { command: "pnpm", args, cwd };
  });
}

export async function orchestrateTuiPublish({
  dryRun = false,
  repoDirectory = defaultRepoDirectory,
  releaseRootDirectory = join(repoDirectory, ".tui-release"),
  nodeExecutable = process.execPath,
  runCommand = runCommandWithInheritedIo,
  loadDescriptor = loadTarballDescriptor,
  acquireLock = acquireReleaseLock,
  createRunDirectory = createReleaseRunDirectory,
} = {}) {
  assertSupportedNodeVersion();
  const releaseLock = await acquireLock({
    repoDirectory,
    releaseRootDirectory,
  });
  try {
    const smokeScript = join(repoDirectory, "scripts/smoke-tui-tarballs.mjs");
    await runCommand({
      command: "pnpm",
      args: ["verify:tui-packages"],
      cwd: repoDirectory,
    });

    const runDirectory = await createRunDirectory({
      repoDirectory,
      releaseRootDirectory,
    });
    const descriptorPath = join(runDirectory, TUI_TARBALL_DESCRIPTOR);
    await runCommand({
      command: nodeExecutable,
      args: [smokeScript, "--prepare", runDirectory],
      cwd: repoDirectory,
    });

    const prepared = await loadDescriptor({ descriptorPath });
    const snapshot = createPreparedArtifactSnapshot(prepared);
    await runCommand({
      command: nodeExecutable,
      args: [smokeScript, "--reuse", snapshot.descriptorPath],
      cwd: repoDirectory,
    });

    const afterSmoke = await loadDescriptor({ descriptorPath });
    assertPreparedArtifactMatchesSnapshot(afterSmoke, snapshot);
    const publishPlan = createPublishCommandPlan(snapshot, {
      cwd: repoDirectory,
      dryRun,
    });
    for (const command of publishPlan) {
      const immediatelyBeforePublish = await loadDescriptor({ descriptorPath });
      assertPreparedArtifactMatchesSnapshot(immediatelyBeforePublish, snapshot);
      await runCommand(command);
    }

    return snapshot;
  } finally {
    await releaseLock.release();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { dryRun } = parsePublishArguments(process.argv.slice(2));
  await orchestrateTuiPublish({ dryRun });
}
