import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
  assertReleaseArtifactDirectory,
  assertSupportedNodeVersion,
  createPublishCommandPlan,
  orchestrateTuiPublish,
  parsePublishArguments,
} = publishModule ?? {};

const repoDirectory = "/repo/uniview";
const actualRepoDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactDirectory = join(repoDirectory, ".tui-release");
const descriptorPath = join(artifactDirectory, "tui-tarballs.json");

function preparedArtifact() {
  return {
    descriptorPath,
    packages: {
      core: {
        name: "@uniview/tui-core",
        filename: join(artifactDirectory, "uniview-tui-core-0.0.1.tgz"),
      },
      react: {
        name: "@uniview/tui-react",
        filename: join(artifactDirectory, "uniview-tui-react-0.0.1.tgz"),
      },
      solid: {
        name: "@uniview/tui-solid",
        filename: join(artifactDirectory, "uniview-tui-solid-0.0.1.tgz"),
      },
    },
  };
}

test("parses only actual and dry-run publish modes", () => {
  assert.deepEqual(parsePublishArguments([]), { dryRun: false });
  assert.deepEqual(parsePublishArguments(["--dry-run"]), { dryRun: true });
  assert.throws(() => parsePublishArguments(["--force"]), /Usage/);
});

test("requires Node 24 and the exact persistent artifact directory", () => {
  assert.doesNotThrow(() => assertSupportedNodeVersion("24.0.0"));
  assert.doesNotThrow(() => assertSupportedNodeVersion("25.2.1"));
  assert.throws(() => assertSupportedNodeVersion("23.11.0"), /Node 24/);
  assert.doesNotThrow(() =>
    assertReleaseArtifactDirectory({ repoDirectory, artifactDirectory }),
  );
  assert.throws(
    () =>
      assertReleaseArtifactDirectory({
        repoDirectory,
        artifactDirectory: repoDirectory,
      }),
    /\.tui-release/,
  );
  assert.throws(
    () =>
      assertReleaseArtifactDirectory({
        repoDirectory,
        artifactDirectory: join(artifactDirectory, "nested"),
      }),
    /\.tui-release/,
  );
});

test("plans exactly core, React, and Solid positional tarball publishes", () => {
  const plan = createPublishCommandPlan(preparedArtifact(), {
    cwd: repoDirectory,
    dryRun: false,
  });

  assert.deepEqual(
    plan.map(({ command, args, cwd }) => ({ command, args, cwd })),
    [
      {
        command: "pnpm",
        args: [
          "publish",
          join(artifactDirectory, "uniview-tui-core-0.0.1.tgz"),
          "--access",
          "public",
          "--ignore-scripts",
          "--publish-branch",
          "main",
        ],
        cwd: repoDirectory,
      },
      {
        command: "pnpm",
        args: [
          "publish",
          join(artifactDirectory, "uniview-tui-react-0.0.1.tgz"),
          "--access",
          "public",
          "--ignore-scripts",
          "--publish-branch",
          "main",
        ],
        cwd: repoDirectory,
      },
      {
        command: "pnpm",
        args: [
          "publish",
          join(artifactDirectory, "uniview-tui-solid-0.0.1.tgz"),
          "--access",
          "public",
          "--ignore-scripts",
          "--publish-branch",
          "main",
        ],
        cwd: repoDirectory,
      },
    ],
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
  const actual = createPublishCommandPlan(preparedArtifact(), {
    cwd: repoDirectory,
    dryRun: false,
  });
  const dryRun = createPublishCommandPlan(preparedArtifact(), {
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
    () =>
      createPublishCommandPlan(missing, {
        cwd: repoDirectory,
        dryRun: false,
      }),
    /exactly core, react, and solid/,
  );

  const renamed = preparedArtifact();
  renamed.packages.react.name = "@uniview/not-react";
  assert.throws(
    () =>
      createPublishCommandPlan(renamed, {
        cwd: repoDirectory,
        dryRun: false,
      }),
    /@uniview\/tui-react/,
  );
});

test("verifies, prepares, smokes, reverifies, then publishes in order", async () => {
  const events = [];
  let descriptorLoads = 0;
  await orchestrateTuiPublish({
    repoDirectory,
    artifactDirectory,
    nodeExecutable: "/node",
    runCommand: async (command) => {
      events.push(command);
    },
    resetArtifacts: async (directory) => {
      events.push({ reset: directory });
    },
    loadDescriptor: async ({ descriptorPath: requested }) => {
      descriptorLoads += 1;
      assert.equal(requested, descriptorPath);
      return preparedArtifact();
    },
  });

  assert.equal(descriptorLoads, 2);
  assert.deepEqual(events.slice(0, 4), [
    {
      command: "pnpm",
      args: ["verify:tui-packages"],
      cwd: repoDirectory,
    },
    { reset: artifactDirectory },
    {
      command: "/node",
      args: [
        join(repoDirectory, "scripts/smoke-tui-tarballs.mjs"),
        "--prepare",
        artifactDirectory,
      ],
      cwd: repoDirectory,
    },
    {
      command: "/node",
      args: [
        join(repoDirectory, "scripts/smoke-tui-tarballs.mjs"),
        "--reuse",
        descriptorPath,
      ],
      cwd: repoDirectory,
    },
  ]);
  assert.deepEqual(
    events.slice(4).map(({ args }) => args[1]),
    [
      join(artifactDirectory, "uniview-tui-core-0.0.1.tgz"),
      join(artifactDirectory, "uniview-tui-react-0.0.1.tgz"),
      join(artifactDirectory, "uniview-tui-solid-0.0.1.tgz"),
    ],
  );
});

test("descriptor tampering aborts before the first publish", async () => {
  const commands = [];
  let descriptorLoads = 0;
  const tamperError = new Error("tarball sha256 changed");
  await assert.rejects(
    () =>
      orchestrateTuiPublish({
        repoDirectory,
        artifactDirectory,
        nodeExecutable: "/node",
        runCommand: async (command) => {
          commands.push(command);
        },
        resetArtifacts: async () => {},
        loadDescriptor: async () => {
          descriptorLoads += 1;
          if (descriptorLoads === 2) throw tamperError;
          return preparedArtifact();
        },
      }),
    (error) => error === tamperError,
  );
  assert.equal(
    commands.some(({ args }) => args[0] === "publish"),
    false,
  );
});

test("stops on the first publish failure and preserves later artifacts", async () => {
  const published = [];
  const reactError = new Error("registry rejected React");
  await assert.rejects(
    () =>
      orchestrateTuiPublish({
        repoDirectory,
        artifactDirectory,
        nodeExecutable: "/node",
        runCommand: async (command) => {
          if (command.args[0] !== "publish") return;
          published.push(command.args[1]);
          if (command.args[1].includes("tui-react")) throw reactError;
        },
        resetArtifacts: async () => {},
        loadDescriptor: async () => preparedArtifact(),
      }),
    (error) => error === reactError,
  );
  assert.deepEqual(published, [
    join(artifactDirectory, "uniview-tui-core-0.0.1.tgz"),
    join(artifactDirectory, "uniview-tui-react-0.0.1.tgz"),
  ]);
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
