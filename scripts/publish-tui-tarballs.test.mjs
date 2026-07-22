import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const publishModule = await import("./publish-tui-tarballs.mjs").catch(
  () => null,
);

test("provides a dedicated exact-tarball publish orchestrator", () => {
  assert.ok(
    publishModule,
    "scripts/publish-tui-tarballs.mjs must exist before source publication is allowed",
  );
});

const {
  acquireReleaseLock,
  assertSafeReleaseRunDirectory,
  assertSupportedNodeVersion,
  createPreparedArtifactSnapshot,
  createPublishCommandPlan,
  createReleaseRunDirectory,
  orchestrateTuiPublish,
  parsePublishArguments,
} = publishModule ?? {};

const repoDirectory = "/repo/uniview";
const actualRepoDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseRootDirectory = join(repoDirectory, ".tui-release");
const runDirectory = join(releaseRootDirectory, "run-ABC123");
const descriptorPath = join(runDirectory, "tui-tarballs.json");
const sha = (character) => character.repeat(64);

function preparedArtifact({
  descriptorSha256 = sha("d"),
  coreSha256 = sha("a"),
  reactSha256 = sha("b"),
  solidSha256 = sha("c"),
  marker = "smoked",
} = {}) {
  const packageEntry = (key, name, tarballSha256) => {
    const file = `uniview-tui-${key}-0.0.1.tgz`;
    return {
      name,
      version: "0.0.1",
      file,
      sha256: tarballSha256,
      filename: join(runDirectory, file),
      manifest: {
        name,
        version: "0.0.1",
        scripts: { test: "vitest run" },
        releaseMarker: marker,
      },
      files: [{ path: "README.md" }, { path: "package.json" }],
    };
  };
  return {
    descriptorPath,
    descriptorSha256,
    packages: {
      core: packageEntry("core", "@uniview/tui-core", coreSha256),
      react: packageEntry("react", "@uniview/tui-react", reactSha256),
      solid: packageEntry("solid", "@uniview/tui-solid", solidSha256),
    },
  };
}

function injectedOptions({ loads, events = [], runCommand } = {}) {
  let loadIndex = 0;
  return {
    events,
    options: {
      repoDirectory,
      // Kept during RED so the old implementation cannot fail for an
      // unrelated /repo filesystem write before exposing its TOCTOU bug.
      artifactDirectory: releaseRootDirectory,
      releaseRootDirectory,
      nodeExecutable: "/node",
      acquireLock: async () => {
        events.push({ type: "lock-acquired" });
        return {
          release: async () => events.push({ type: "lock-released" }),
        };
      },
      createRunDirectory: async () => {
        events.push({ type: "run-created", directory: runDirectory });
        return runDirectory;
      },
      resetArtifacts: async () => {},
      runCommand:
        runCommand ??
        (async (command) => {
          events.push({ type: "command", command });
        }),
      loadDescriptor: async () => {
        events.push({ type: "descriptor-load", index: loadIndex });
        const values = loads ?? [preparedArtifact()];
        const value = values[Math.min(loadIndex, values.length - 1)];
        loadIndex += 1;
        return structuredClone(value);
      },
    },
  };
}

test("parses only actual and dry-run publish modes", () => {
  assert.deepEqual(parsePublishArguments([]), { dryRun: false });
  assert.deepEqual(parsePublishArguments(["--dry-run"]), { dryRun: true });
  assert.throws(() => parsePublishArguments(["--force"]), /Usage/);
});

test("requires Node 24 and creates distinct safe real run children", async () => {
  assert.doesNotThrow(() => assertSupportedNodeVersion("24.0.0"));
  assert.doesNotThrow(() => assertSupportedNodeVersion("25.2.1"));
  assert.throws(() => assertSupportedNodeVersion("23.11.0"), /Node 24/);

  const temporary = await mkdtemp(join(tmpdir(), "uniview-publish-paths-"));
  const temporaryRepo = join(temporary, "repo");
  const root = join(temporaryRepo, ".tui-release");
  try {
    await mkdir(temporaryRepo);
    const first = await createReleaseRunDirectory({
      repoDirectory: temporaryRepo,
      releaseRootDirectory: root,
    });
    const second = await createReleaseRunDirectory({
      repoDirectory: temporaryRepo,
      releaseRootDirectory: root,
    });
    assert.notEqual(first, second);
    assert.match(basename(first), /^run-/);
    assert.equal(
      await assertSafeReleaseRunDirectory({
        repoDirectory: temporaryRepo,
        releaseRootDirectory: root,
        runDirectory: first,
      }),
      await realpath(first),
    );
    await assert.rejects(
      () =>
        assertSafeReleaseRunDirectory({
          repoDirectory: temporaryRepo,
          releaseRootDirectory: root,
          runDirectory: join(root, ".."),
        }),
      /safe.*run|release.*child|\.tui-release/i,
    );

    const outside = join(temporary, "outside");
    await mkdir(outside);
    const linked = join(root, "run-linked");
    await symlink(outside, linked, "dir");
    await assert.rejects(
      () =>
        assertSafeReleaseRunDirectory({
          repoDirectory: temporaryRepo,
          releaseRootDirectory: root,
          runDirectory: linked,
        }),
      /safe.*run|release.*child|symlink/i,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("holds one exclusive release lock and requires manual audit for a stale lock", async () => {
  const temporaryRepo = await mkdtemp(join(tmpdir(), "uniview-publish-lock-"));
  const root = join(temporaryRepo, ".tui-release");
  try {
    const first = await acquireReleaseLock({
      repoDirectory: temporaryRepo,
      releaseRootDirectory: root,
    });
    await assert.rejects(
      () =>
        acquireReleaseLock({
          repoDirectory: temporaryRepo,
          releaseRootDirectory: root,
        }),
      /already locked|manual audit|stale/i,
    );
    await first.release();
    const afterRelease = await acquireReleaseLock({
      repoDirectory: temporaryRepo,
      releaseRootDirectory: root,
    });
    await afterRelease.release();
  } finally {
    await rm(temporaryRepo, { recursive: true, force: true });
  }
});

test("plans exactly core, React, and Solid positional tarball publishes from the original snapshot", () => {
  const snapshot = createPreparedArtifactSnapshot(preparedArtifact());
  const plan = createPublishCommandPlan(snapshot, {
    cwd: repoDirectory,
    dryRun: false,
  });

  assert.deepEqual(
    plan.map(({ command, args, cwd }) => ({ command, args, cwd })),
    ["core", "react", "solid"].map((key) => ({
      command: "pnpm",
      args: [
        "publish",
        join(runDirectory, `uniview-tui-${key}-0.0.1.tgz`),
        "--access",
        "public",
        "--ignore-scripts",
        "--publish-branch",
        "main",
      ],
      cwd: repoDirectory,
    })),
  );
  assert.equal(
    plan.some(({ args }) => args.includes("--recursive")),
    false,
  );
  assert.equal(
    plan.some(({ args }) => args.includes("--no-git-checks")),
    false,
  );
});

test("dry-run adds only pnpm's dry-run flag to each exact tarball command", () => {
  const snapshot = createPreparedArtifactSnapshot(preparedArtifact());
  const actual = createPublishCommandPlan(snapshot, {
    cwd: repoDirectory,
    dryRun: false,
  });
  const dryRun = createPublishCommandPlan(snapshot, {
    cwd: repoDirectory,
    dryRun: true,
  });
  assert.deepEqual(
    dryRun.map(({ args }) => args),
    actual.map(({ args }) => [...args, "--dry-run"]),
  );
});

test("rejects descriptor package drift before constructing publish commands", () => {
  const missing = preparedArtifact();
  delete missing.packages.solid;
  assert.throws(
    () => createPreparedArtifactSnapshot(missing),
    /exactly core, react, and solid/,
  );

  const renamed = preparedArtifact();
  renamed.packages.react.name = "@uniview/not-react";
  assert.throws(
    () => createPreparedArtifactSnapshot(renamed),
    /@uniview\/tui-react/,
  );
});

test("locks, verifies, creates one run, smokes, reloads before every publish, then unlocks", async () => {
  const fixture = injectedOptions();
  await orchestrateTuiPublish(fixture.options);

  assert.equal(
    fixture.events.filter(({ type }) => type === "descriptor-load").length,
    5,
  );
  assert.deepEqual(
    fixture.events
      .filter(({ type }) => type === "command")
      .map(({ command }) => command.args[0]),
    [
      "verify:tui-packages",
      join(repoDirectory, "scripts/smoke-tui-tarballs.mjs"),
      join(repoDirectory, "scripts/smoke-tui-tarballs.mjs"),
      "publish",
      "publish",
      "publish",
    ],
  );
  const commandEvents = fixture.events.filter(({ type }) => type === "command");
  assert.deepEqual(commandEvents[1].command.args, [
    join(repoDirectory, "scripts/smoke-tui-tarballs.mjs"),
    "--prepare",
    runDirectory,
  ]);
  assert.deepEqual(commandEvents[2].command.args, [
    join(repoDirectory, "scripts/smoke-tui-tarballs.mjs"),
    "--reuse",
    descriptorPath,
  ]);
  assert.deepEqual(
    commandEvents.slice(3).map(({ command }) => command.args[1]),
    ["core", "react", "solid"].map((key) =>
      join(runDirectory, `uniview-tui-${key}-0.0.1.tgz`),
    ),
  );
  assert.equal(fixture.events[0].type, "lock-acquired");
  assert.equal(fixture.events.at(-1).type, "lock-released");
});

test("rejects a separately valid but unsmoked descriptor with zero publish commands", async () => {
  const published = [];
  const fixture = injectedOptions({
    loads: [
      preparedArtifact(),
      preparedArtifact({ descriptorSha256: sha("e"), marker: "unsmoked" }),
    ],
    runCommand: async (command) => {
      if (command.args[0] === "publish") published.push(command);
    },
  });
  await assert.rejects(
    () => orchestrateTuiPublish(fixture.options),
    /immutable|identity|changed|snapshot/i,
  );
  assert.deepEqual(published, []);
  assert.equal(fixture.events.at(-1).type, "lock-released");
});

test("rejects same-path tarball sha drift before the first publish", async () => {
  const published = [];
  const fixture = injectedOptions({
    loads: [preparedArtifact(), preparedArtifact({ coreSha256: sha("f") })],
    runCommand: async (command) => {
      if (command.args[0] === "publish") published.push(command);
    },
  });
  await assert.rejects(
    () => orchestrateTuiPublish(fixture.options),
    /immutable|identity|changed|snapshot/i,
  );
  assert.deepEqual(published, []);
});

test("reloads between publishes and stops before the next package after mutation", async () => {
  const published = [];
  const stable = preparedArtifact();
  const mutated = preparedArtifact({
    descriptorSha256: sha("e"),
    reactSha256: sha("f"),
  });
  const fixture = injectedOptions({
    loads: [stable, stable, stable, mutated],
    runCommand: async (command) => {
      if (command.args[0] === "publish") published.push(command.args[1]);
    },
  });
  await assert.rejects(
    () => orchestrateTuiPublish(fixture.options),
    /immutable|identity|changed|snapshot/i,
  );
  assert.deepEqual(published, [
    join(runDirectory, "uniview-tui-core-0.0.1.tgz"),
  ]);
});

test("a concurrent invocation fails before verify or prepare and the first error releases the lock", async () => {
  const temporaryRepo = await mkdtemp(join(tmpdir(), "uniview-publish-race-"));
  const root = join(temporaryRepo, ".tui-release");
  let rejectVerify;
  let verifyStarted;
  const reachedVerify = new Promise((resolve) => {
    verifyStarted = resolve;
  });
  const firstError = new Error("first verification stopped");
  try {
    const first = orchestrateTuiPublish({
      repoDirectory: temporaryRepo,
      releaseRootDirectory: root,
      runCommand: async (command) => {
        if (command.args[0] !== "verify:tui-packages") return;
        verifyStarted();
        await new Promise((_, reject) => {
          rejectVerify = reject;
        });
      },
    });
    await reachedVerify;

    const secondCommands = [];
    await assert.rejects(
      () =>
        orchestrateTuiPublish({
          repoDirectory: temporaryRepo,
          releaseRootDirectory: root,
          runCommand: async (command) => secondCommands.push(command),
        }),
      /already locked|manual audit|stale/i,
    );
    assert.deepEqual(secondCommands, []);

    rejectVerify(firstError);
    await assert.rejects(first, (error) => error === firstError);
    const afterFailure = await acquireReleaseLock({
      repoDirectory: temporaryRepo,
      releaseRootDirectory: root,
    });
    await afterFailure.release();
  } finally {
    await rm(temporaryRepo, { recursive: true, force: true });
  }
});

test("stops on the first publish failure, releases the lock, and preserves the run", async () => {
  const published = [];
  const reactError = new Error("registry rejected React");
  const fixture = injectedOptions({
    runCommand: async (command) => {
      if (command.args[0] !== "publish") return;
      published.push(command.args[1]);
      if (command.args[1].includes("tui-react")) throw reactError;
    },
  });
  await assert.rejects(
    () => orchestrateTuiPublish(fixture.options),
    (error) => error === reactError,
  );
  assert.deepEqual(published, [
    join(runDirectory, "uniview-tui-core-0.0.1.tgz"),
    join(runDirectory, "uniview-tui-react-0.0.1.tgz"),
  ]);
  assert.equal(fixture.events.at(-1).type, "lock-released");
  assert.equal(
    fixture.events.some(({ type }) => type === "run-deleted"),
    false,
  );
});

test("root scripts route actual and dry-run releases through the tarball orchestrator", async () => {
  const manifest = JSON.parse(
    await readFile(join(actualRepoDirectory, "package.json"), "utf8"),
  );
  assert.equal(
    manifest.scripts["publish:tui"],
    "node scripts/publish-tui-tarballs.mjs",
  );
  assert.equal(
    manifest.scripts["publish:tui:dry-run"],
    "node scripts/publish-tui-tarballs.mjs --dry-run",
  );
  assert.match(
    manifest.scripts["verify:tui-packages"],
    /publish-tui-tarballs\.test\.mjs/,
  );
  assert.doesNotMatch(
    manifest.scripts["publish:tui"],
    /publish -r|--recursive/,
  );
});

test("ignores only the persistent local TUI release artifact directory", async () => {
  const ignore = await readFile(
    join(actualRepoDirectory, ".gitignore"),
    "utf8",
  );
  assert.equal(
    ignore
      .split(/\r?\n/)
      .filter((line) => line.includes("tui-release"))
      .join("\n"),
    ".tui-release/",
  );
});
