import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
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

export function assertReleaseArtifactDirectory({
  repoDirectory,
  artifactDirectory,
}) {
  const expected = resolve(repoDirectory, ".tui-release");
  assert.equal(
    resolve(artifactDirectory),
    expected,
    `release artifacts must use the exact .tui-release directory: ${expected}`,
  );
  return expected;
}

async function resetReleaseArtifacts(artifactDirectory, repoDirectory) {
  const safeDirectory = assertReleaseArtifactDirectory({
    repoDirectory,
    artifactDirectory,
  });
  await rm(safeDirectory, { recursive: true, force: true });
  await mkdir(safeDirectory, { recursive: true });
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
  }
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
  artifactDirectory = join(repoDirectory, ".tui-release"),
  nodeExecutable = process.execPath,
  runCommand = runCommandWithInheritedIo,
  resetArtifacts = resetReleaseArtifacts,
  loadDescriptor = loadTarballDescriptor,
} = {}) {
  assertSupportedNodeVersion();
  const safeArtifactDirectory = assertReleaseArtifactDirectory({
    repoDirectory,
    artifactDirectory,
  });
  const descriptorPath = join(safeArtifactDirectory, TUI_TARBALL_DESCRIPTOR);
  const smokeScript = join(repoDirectory, "scripts/smoke-tui-tarballs.mjs");

  await runCommand({
    command: "pnpm",
    args: ["verify:tui-packages"],
    cwd: repoDirectory,
  });
  await resetArtifacts(safeArtifactDirectory, repoDirectory);
  await runCommand({
    command: nodeExecutable,
    args: [smokeScript, "--prepare", safeArtifactDirectory],
    cwd: repoDirectory,
  });

  const prepared = await loadDescriptor({ descriptorPath });
  assertPreparedArtifact(prepared);
  await runCommand({
    command: nodeExecutable,
    args: [smokeScript, "--reuse", prepared.descriptorPath],
    cwd: repoDirectory,
  });

  // Re-read hashes/manifests/files after smoke so the publish plan is derived
  // from the bytes that survived the complete fixture run.
  const verified = await loadDescriptor({ descriptorPath });
  const publishPlan = createPublishCommandPlan(verified, {
    cwd: repoDirectory,
    dryRun,
  });
  for (const command of publishPlan) await runCommand(command);

  return verified;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { dryRun } = parsePublishArguments(process.argv.slice(2));
  await orchestrateTuiPublish({ dryRun });
}
