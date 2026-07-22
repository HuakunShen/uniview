import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

import {
  loadTarballDescriptor,
  parseSmokeArguments,
  writeTarballDescriptor,
} from "./tui-tarball-descriptor.mjs";

const definitions = {
  core: "@uniview/tui-core",
  react: "@uniview/tui-react",
  solid: "@uniview/tui-solid",
};

test("parses exclusive default, prepare, and reuse smoke modes", () => {
  assert.deepEqual(parseSmokeArguments([]), { mode: "default" });
  assert.deepEqual(parseSmokeArguments(["--prepare", "./artifacts"]), {
    mode: "prepare",
    outputDirectory: "./artifacts",
  });
  assert.deepEqual(parseSmokeArguments(["--reuse", "./descriptor.json"]), {
    mode: "reuse",
    descriptorPath: "./descriptor.json",
  });
  assert.throws(() => parseSmokeArguments(["--prepare"]), /usage/i);
  assert.throws(
    () =>
      parseSmokeArguments([
        "--prepare",
        "./artifacts",
        "--reuse",
        "./descriptor.json",
      ]),
    /usage/i,
  );
  assert.throws(() => parseSmokeArguments(["--unknown"]), /usage/i);
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "uniview-descriptor-test-"));
  const tarballs = {};
  const inspections = new Map();
  for (const [key, name] of Object.entries(definitions)) {
    const filename = join(directory, `${key}.tgz`);
    await writeFile(filename, `${key}-immutable-bytes`);
    tarballs[key] = filename;
    inspections.set(basename(filename), {
      manifest: {
        name,
        version: "0.0.1",
        engines: { node: ">=18" },
      },
      files: ["README.md", "dist/index.mjs", "package.json"],
    });
  }
  const inspectTarball = async (filename) =>
    inspections.get(basename(filename));
  return { directory, tarballs, inspections, inspectTarball };
}

test("writes and reloads a deterministic exact-three-package descriptor", async () => {
  const value = await fixture();
  try {
    const descriptorPath = await writeTarballDescriptor({
      directory: value.directory,
      tarballs: value.tarballs,
      inspectTarball: value.inspectTarball,
    });
    const first = await readFile(descriptorPath, "utf8");
    await writeTarballDescriptor({
      directory: value.directory,
      tarballs: value.tarballs,
      inspectTarball: value.inspectTarball,
    });
    assert.equal(await readFile(descriptorPath, "utf8"), first);

    const loaded = await loadTarballDescriptor({
      descriptorPath,
      inspectTarball: value.inspectTarball,
    });
    assert.deepEqual(Object.keys(loaded.packages), ["core", "react", "solid"]);
    for (const [key, name] of Object.entries(definitions)) {
      assert.equal(loaded.packages[key].name, name);
      assert.equal(loaded.packages[key].manifest.name, name);
      assert.equal(basename(loaded.packages[key].filename), `${key}.tgz`);
    }
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

test("rejects descriptor paths that escape the artifact directory", async () => {
  const value = await fixture();
  try {
    const descriptorPath = await writeTarballDescriptor({
      directory: value.directory,
      tarballs: value.tarballs,
      inspectTarball: value.inspectTarball,
    });
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
    descriptor.packages.core.file = "../core.tgz";
    await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);

    await assert.rejects(
      loadTarballDescriptor({
        descriptorPath,
        inspectTarball: value.inspectTarball,
      }),
      /safe basename/,
    );
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

test("rejects mutated tarball bytes", async () => {
  const value = await fixture();
  try {
    const descriptorPath = await writeTarballDescriptor({
      directory: value.directory,
      tarballs: value.tarballs,
      inspectTarball: value.inspectTarball,
    });
    await writeFile(value.tarballs.react, "mutated bytes");

    await assert.rejects(
      loadTarballDescriptor({
        descriptorPath,
        inspectTarball: value.inspectTarball,
      }),
      /sha256/,
    );
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

test("rejects manifest drift and non-exact package keys", async () => {
  const value = await fixture();
  try {
    const descriptorPath = await writeTarballDescriptor({
      directory: value.directory,
      tarballs: value.tarballs,
      inspectTarball: value.inspectTarball,
    });
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
    descriptor.packages.solid.manifest.version = "9.9.9";
    await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    await assert.rejects(
      loadTarballDescriptor({
        descriptorPath,
        inspectTarball: value.inspectTarball,
      }),
      /manifest/,
    );

    descriptor.packages.solid.manifest.version = "0.0.1";
    descriptor.packages.extra = descriptor.packages.core;
    await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    await assert.rejects(
      loadTarballDescriptor({
        descriptorPath,
        inspectTarball: value.inspectTarball,
      }),
      /exactly core, react, and solid/,
    );
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});
