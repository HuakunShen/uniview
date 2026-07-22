import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
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
  assertGitReleaseReady,
  assertSafeReleaseRunDirectory,
  assertSupportedNodeVersion,
  capturePreparedTarballs,
  createPreparedArtifactSnapshot,
  createReleaseRunDirectory,
  loadNpmPublishOptions,
  orchestrateTuiPublish,
  parsePublishArguments,
} = publishModule ?? {};

const repoDirectory = "/repo/uniview";
const actualRepoDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseRootDirectory = join(repoDirectory, ".tui-release");
const runDirectory = join(releaseRootDirectory, "run-ABC123");
const descriptorPath = join(runDirectory, "tui-tarballs.json");
const sha = (character) => character.repeat(64);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const verifiedPackageBytes = {
  core: Buffer.from("verified core tarball"),
  react: Buffer.from("verified React tarball"),
  solid: Buffer.from("verified Solid tarball"),
};

function preparedArtifact({
  descriptorSha256 = sha("d"),
  coreSha256 = sha256(verifiedPackageBytes.core),
  reactSha256 = sha256(verifiedPackageBytes.react),
  solidSha256 = sha256(verifiedPackageBytes.solid),
  marker = "smoked",
  directory = runDirectory,
} = {}) {
  const packageEntry = (key, name, tarballSha256) => {
    const file = `uniview-tui-${key}-0.0.1.tgz`;
    return {
      name,
      version: "0.0.1",
      file,
      sha256: tarballSha256,
      filename: join(directory, file),
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
    descriptorPath: join(directory, "tui-tarballs.json"),
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
      nodeVersion: "24.15.0",
      nodeExecutable: "/node",
      inspectGitReleaseState: async () => {
        events.push({ type: "git-preflight" });
        return {
          branch: "main",
          status: "",
          upstream: "origin/main",
          head: "abc123",
          upstreamHead: "abc123",
        };
      },
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
      readTarball: async (filename) => {
        const key = Object.keys(verifiedPackageBytes).find((candidate) =>
          filename.includes(`tui-${candidate}`),
        );
        assert.ok(key);
        events.push({ type: "tarball-captured", key });
        return Buffer.from(verifiedPackageBytes[key]);
      },
      loadPublishOptions: async () => {
        events.push({ type: "npm-config-loaded" });
        return { registry: "https://registry.example.test/" };
      },
      publisher: async (manifest, tarData, options) => {
        events.push({
          type: "published",
          name: manifest.name,
          tarData: Buffer.from(tarData),
          options,
        });
      },
    },
  };
}

test("parses only actual and dry-run publish modes", () => {
  assert.deepEqual(parsePublishArguments([]), { dryRun: false });
  assert.deepEqual(parsePublishArguments(["--dry-run"]), { dryRun: true });
  assert.throws(() => parsePublishArguments(["--force"]), /Usage/);
});

test("creates distinct safe real release run children", async () => {
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

test("refuses to unlink a release lock whose inode was replaced", async () => {
  const temporaryRepo = await mkdtemp(join(tmpdir(), "uniview-lock-inode-"));
  const root = join(temporaryRepo, ".tui-release");
  try {
    const lock = await acquireReleaseLock({
      repoDirectory: temporaryRepo,
      releaseRootDirectory: root,
    });
    await unlink(lock.lockPath);
    await writeFile(lock.lockPath, "replacement lock\n");

    await assert.rejects(() => lock.release(), /identity changed|audit/i);
    assert.equal(await readFile(lock.lockPath, "utf8"), "replacement lock\n");
  } finally {
    await rm(temporaryRepo, { recursive: true, force: true });
  }
});

test("captures exactly core, React, and Solid Buffers from the immutable snapshot", async () => {
  const snapshot = createPreparedArtifactSnapshot(preparedArtifact());
  const captured = await capturePreparedTarballs(snapshot, {
    readTarball: async (filename) => {
      const key = Object.keys(verifiedPackageBytes).find((candidate) =>
        filename.includes(`tui-${candidate}`),
      );
      assert.ok(key);
      return Buffer.from(verifiedPackageBytes[key]);
    },
  });

  assert.deepEqual(Object.keys(captured), ["core", "react", "solid"]);
  assert.deepEqual(
    Object.values(captured).map(({ tarData }) => tarData),
    Object.values(verifiedPackageBytes),
  );
});

test("rejects descriptor package drift before capturing publish bytes", () => {
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

test("preflights, verifies, creates one run, smokes, captures, publishes, then unlocks", async () => {
  const fixture = injectedOptions();
  await orchestrateTuiPublish(fixture.options);

  assert.equal(
    fixture.events.filter(({ type }) => type === "descriptor-load").length,
    2,
  );
  assert.deepEqual(
    fixture.events
      .filter(({ type }) => type === "command")
      .map(({ command }) => command.args[0]),
    [
      "verify:tui-packages",
      join(repoDirectory, "scripts/smoke-tui-tarballs.mjs"),
      join(repoDirectory, "scripts/smoke-tui-tarballs.mjs"),
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
    fixture.events
      .filter(({ type }) => type === "tarball-captured")
      .map(({ key }) => key),
    ["core", "react", "solid"],
  );
  assert.deepEqual(
    fixture.events
      .filter(({ type }) => type === "published")
      .map(({ name }) => name),
    ["@uniview/tui-core", "@uniview/tui-react", "@uniview/tui-solid"],
  );
  assert.equal(fixture.events[0].type, "lock-acquired");
  assert.equal(fixture.events[1].type, "git-preflight");
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

test("rejects a captured Buffer hash mismatch before the first publish", async () => {
  const fixture = injectedOptions();
  const readVerifiedTarball = fixture.options.readTarball;
  fixture.options.readTarball = async (filename) =>
    filename.includes("tui-react")
      ? Buffer.from("mutated React tarball")
      : readVerifiedTarball(filename);
  await assert.rejects(
    () => orchestrateTuiPublish(fixture.options),
    /captured tarball sha256 changed/i,
  );
  assert.equal(
    fixture.events.some(({ type }) => type === "published"),
    false,
  );
});

test("rejects git preflight before verification or artifact creation", async () => {
  const fixture = injectedOptions();
  fixture.options.inspectGitReleaseState = async () => ({
    branch: "main",
    status: " M package.json",
    upstream: "origin/main",
    head: "abc123",
    upstreamHead: "abc123",
  });

  await assert.rejects(
    () => orchestrateTuiPublish(fixture.options),
    /clean worktree/i,
  );
  assert.equal(
    fixture.events.some(({ type }) => type === "command"),
    false,
  );
  assert.equal(
    fixture.events.some(({ type }) => type === "run-created"),
    false,
  );
  assert.equal(fixture.events.at(-1).type, "lock-released");
});

test("stops before core when git readiness drifts after initial preflight", async () => {
  const fixture = injectedOptions();
  let inspection = 0;
  fixture.options.inspectGitReleaseState = async () => {
    inspection += 1;
    return {
      branch: "main",
      status: inspection === 1 ? "" : " M package.json",
      upstream: "origin/main",
      head: "abc123",
      upstreamHead: "abc123",
    };
  };

  await assert.rejects(
    () => orchestrateTuiPublish(fixture.options),
    /clean worktree/i,
  );
  assert.equal(inspection, 2);
  assert.deepEqual(
    fixture.events.filter(({ type }) => type === "published"),
    [],
  );
  assert.equal(fixture.events.at(-1).type, "lock-released");
});

test("stops before React when git readiness drifts after core publication", async () => {
  const fixture = injectedOptions();
  let inspection = 0;
  fixture.options.inspectGitReleaseState = async () => {
    inspection += 1;
    return {
      branch: "main",
      status: inspection < 3 ? "" : " M package.json",
      upstream: "origin/main",
      head: "abc123",
      upstreamHead: "abc123",
    };
  };

  await assert.rejects(
    () => orchestrateTuiPublish(fixture.options),
    /clean worktree/i,
  );
  assert.equal(inspection, 3);
  assert.deepEqual(
    fixture.events
      .filter(({ type }) => type === "published")
      .map(({ name }) => name),
    ["@uniview/tui-core"],
  );
  assert.equal(fixture.events.at(-1).type, "lock-released");
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
      nodeVersion: "24.15.0",
      inspectGitReleaseState: async () => ({
        branch: "main",
        status: "",
        upstream: "origin/main",
        head: "abc123",
        upstreamHead: "abc123",
      }),
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
          nodeVersion: "24.15.0",
          inspectGitReleaseState: async () => ({
            branch: "main",
            status: "",
            upstream: "origin/main",
            head: "abc123",
            upstreamHead: "abc123",
          }),
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

test("stops on the first publisher failure, releases the lock, and preserves the run", async () => {
  const published = [];
  const reactError = new Error("registry rejected React");
  const fixture = injectedOptions();
  fixture.options.publisher = async (manifest) => {
    published.push(manifest.name);
    if (manifest.name === "@uniview/tui-react") throw reactError;
  };
  await assert.rejects(
    () => orchestrateTuiPublish(fixture.options),
    (error) => error === reactError,
  );
  assert.deepEqual(published, ["@uniview/tui-core", "@uniview/tui-react"]);
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
  assert.equal(manifest.engines.node, "^24.15.0 || >=26.0.0");

  for (const packageDirectory of ["tui-core", "tui-react", "tui-solid"]) {
    const packageManifest = JSON.parse(
      await readFile(
        join(actualRepoDirectory, "packages", packageDirectory, "package.json"),
        "utf8",
      ),
    );
    assert.equal(packageManifest.engines.node, ">=18");
  }
});

test("documents the Buffer publisher, sibling lock, npmrc config, and local dry-run", async () => {
  const readme = await readFile(join(actualRepoDirectory, "README.md"), "utf8");
  assert.match(readme, /Node .*\^24\.15\.0.*>=26\.0\.0/);
  assert.match(readme, /sibling.*\.tui-release\.lock/i);
  assert.doesNotMatch(readme, /\.tui-release\/\.publish\.lock/);
  assert.match(readme, /verified Buffer.*libnpmpublish/is);
  assert.match(readme, /npmrc.*registry.*auth.*provenance/is);
  assert.match(readme, /dry-run.*purely local.*no registry/is);
  assert.doesNotMatch(readme, /pnpm's `--dry-run`/);
});

test("ignores only the release lock and persistent local artifact directory", async () => {
  const ignore = await readFile(
    join(actualRepoDirectory, ".gitignore"),
    "utf8",
  );
  assert.equal(
    ignore
      .split(/\r?\n/)
      .filter((line) => line.includes("tui-release"))
      .join("\n"),
    ".tui-release.lock\n.tui-release/",
  );
});

test("requires the supported Node 24.15 publication line", () => {
  assert.doesNotThrow(() => assertSupportedNodeVersion("24.15.0"));
  assert.doesNotThrow(() => assertSupportedNodeVersion("24.99.1"));
  assert.doesNotThrow(() => assertSupportedNodeVersion("26.0.0"));
  assert.throws(() => assertSupportedNodeVersion("24.14.99"), /24\.15/);
  assert.throws(() => assertSupportedNodeVersion("25.2.1"), /24\.15/);
  assert.throws(() => assertSupportedNodeVersion("26.x"), /24\.15/);
  assert.throws(() => assertSupportedNodeVersion("26.0.0-rc.1"), /24\.15/);
});

test("acquires the sibling release lock before creating the artifact root", async () => {
  const temporaryRepo = await mkdtemp(join(tmpdir(), "uniview-sibling-lock-"));
  const root = join(temporaryRepo, ".tui-release");
  let lock;
  try {
    lock = await acquireReleaseLock({
      repoDirectory: temporaryRepo,
      releaseRootDirectory: root,
    });
    assert.equal(lock.lockPath, join(temporaryRepo, ".tui-release.lock"));
    await assert.rejects(() => access(root), { code: "ENOENT" });
    await lock.release();
    lock = undefined;
  } finally {
    await lock?.release().catch(() => {});
    await rm(temporaryRepo, { recursive: true, force: true });
  }
});

test("requires main, a clean tree, an upstream, and exact upstream HEAD", () => {
  assert.equal(typeof assertGitReleaseReady, "function");
  const ready = {
    branch: "main",
    status: "",
    upstream: "origin/main",
    head: "abc123",
    upstreamHead: "abc123",
  };
  assert.doesNotThrow(() => assertGitReleaseReady(ready));
  assert.throws(
    () => assertGitReleaseReady({ ...ready, branch: "release" }),
    /main/,
  );
  assert.throws(
    () => assertGitReleaseReady({ ...ready, status: " M package.json" }),
    /clean/,
  );
  assert.throws(
    () => assertGitReleaseReady({ ...ready, upstream: "" }),
    /upstream/,
  );
  assert.throws(
    () => assertGitReleaseReady({ ...ready, upstreamHead: "def456" }),
    /upstream|push|HEAD/i,
  );
});

test("loads npmrc publish configuration and forces public latest publication", async () => {
  assert.equal(typeof loadNpmPublishOptions, "function");
  const temporaryRepo = await mkdtemp(join(tmpdir(), "uniview-npm-config-"));
  const syntheticAuthKeys = [
    "//scope.example.test/:_authToken",
    "//scope.example.test/:_password",
    "//scope.example.test/:username",
    "//scope.example.test/:keyfile",
    "//scope.example.test/:certfile",
  ];
  try {
    await writeFile(
      join(temporaryRepo, "package.json"),
      `${JSON.stringify({ name: "config-fixture", private: true })}\n`,
    );
    await writeFile(
      join(temporaryRepo, ".npmrc"),
      [
        "registry=https://registry.example.test/",
        "@uniview:registry=https://scope.example.test/",
        "//scope.example.test/:_authToken=synthetic-token",
        "//scope.example.test/:_password=c3ludGhldGlj",
        "//scope.example.test/:username=synthetic-user",
        "//scope.example.test/:keyfile=/synthetic/client-key.pem",
        "//scope.example.test/:certfile=/synthetic/client-cert.pem",
        "provenance=true",
        "access=restricted",
        "tag=beta",
        "",
      ].join("\n"),
    );

    const options = await loadNpmPublishOptions({
      repoDirectory: temporaryRepo,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: temporaryRepo,
        npm_config_userconfig: join(temporaryRepo, "missing-user-npmrc"),
        npm_config_globalconfig: join(temporaryRepo, "missing-global-npmrc"),
      },
    });

    assert.equal(options.registry, "https://registry.example.test/");
    assert.equal(options["@uniview:registry"], "https://scope.example.test/");
    for (const key of syntheticAuthKeys) assert.ok(Object.hasOwn(options, key));
    assert.equal(options.provenance, true);
    assert.equal(options.access, "public");
    assert.equal(options.defaultTag, "latest");
    assert.notEqual(options.npmBin, join(temporaryRepo, "bin", "npm-cli.js"));
    const publishSource = await readFile(
      join(actualRepoDirectory, "scripts/publish-tui-tarballs.mjs"),
      "utf8",
    );
    assert.match(publishSource, /\bnerfDarts\b/);
  } finally {
    await rm(temporaryRepo, { recursive: true, force: true });
  }
});

test("publishes the captured verified Buffers after every tarball path is removed", async () => {
  const temporaryRepo = await mkdtemp(
    join(tmpdir(), "uniview-buffer-publish-"),
  );
  const root = join(temporaryRepo, ".tui-release");
  const run = join(root, "run-BUFFER");
  await mkdir(run, { recursive: true });
  const prepared = preparedArtifact({ directory: run });
  for (const [key, bytes] of Object.entries(verifiedPackageBytes)) {
    await writeFile(prepared.packages[key].filename, bytes);
  }
  const published = [];
  try {
    await orchestrateTuiPublish({
      repoDirectory: temporaryRepo,
      releaseRootDirectory: root,
      nodeVersion: "24.15.0",
      nodeExecutable: "/node",
      inspectGitReleaseState: async () => ({
        branch: "main",
        status: "",
        upstream: "origin/main",
        head: "abc123",
        upstreamHead: "abc123",
      }),
      acquireLock: async () => ({ release: async () => {} }),
      createRunDirectory: async () => run,
      runCommand: async () => {},
      loadDescriptor: async () => structuredClone(prepared),
      loadPublishOptions: async () => {
        await Promise.all(
          Object.values(prepared.packages).map(({ filename }) =>
            unlink(filename),
          ),
        );
        return { registry: "https://registry.example.test/" };
      },
      publisher: async (manifest, tarData, options) => {
        published.push({
          name: manifest.name,
          tarData: Buffer.from(tarData),
          options,
        });
      },
    });

    assert.deepEqual(
      published.map(({ name }) => name),
      ["@uniview/tui-core", "@uniview/tui-react", "@uniview/tui-solid"],
    );
    assert.deepEqual(
      published.map(({ tarData }) => tarData),
      Object.values(verifiedPackageBytes),
    );
    assert.ok(
      published.every(
        ({ options }) =>
          options.access === "public" && options.defaultTag === "latest",
      ),
    );
    for (const { filename } of Object.values(prepared.packages)) {
      await assert.rejects(() => access(filename), { code: "ENOENT" });
    }
  } finally {
    await rm(temporaryRepo, { recursive: true, force: true });
  }
});

test("non-ready local dry-run completes without git, config, or publisher calls", async () => {
  const fixture = injectedOptions();
  let inspections = 0;
  fixture.options.inspectGitReleaseState = async () => {
    inspections += 1;
    return {
      branch: "feature/not-ready",
      status: " M package.json",
      upstream: "origin/main",
      head: "ahead123",
      upstreamHead: "behind456",
    };
  };
  await orchestrateTuiPublish({ ...fixture.options, dryRun: true });

  assert.equal(inspections, 0);
  assert.equal(
    fixture.events.filter(({ type }) => type === "command").length,
    3,
  );
  assert.equal(
    fixture.events.filter(({ type }) => type === "descriptor-load").length,
    2,
  );
  assert.deepEqual(
    fixture.events
      .filter(({ type }) => type === "tarball-captured")
      .map(({ key }) => key),
    ["core", "react", "solid"],
  );
  assert.equal(
    fixture.events.some(({ type }) => type === "npm-config-loaded"),
    false,
  );
  assert.equal(
    fixture.events.some(({ type }) => type === "published"),
    false,
  );
});
