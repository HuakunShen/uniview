import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";

import {
  inspectTarball,
  loadTarballDescriptor,
  parseSmokeArguments,
  writeTarballDescriptor,
} from "./tui-tarball-descriptor.mjs";
import {
  validateBindingPackageFiles,
  validateCorePackageFiles,
} from "./verify-tui-package-boundaries.mjs";

const definitions = {
  core: "@uniview/tui-core",
  react: "@uniview/tui-react",
  solid: "@uniview/tui-solid",
};

function tarField(header, value, offset, length) {
  header.write(value, offset, length, "utf8");
}

function tarHeader({ path, size, type = "0" }) {
  const header = Buffer.alloc(512);
  tarField(header, path, 0, 100);
  tarField(header, "0000644\0", 100, 8);
  tarField(header, "0000000\0", 108, 8);
  tarField(header, "0000000\0", 116, 8);
  tarField(header, `${size.toString(8).padStart(11, "0")}\0`, 124, 12);
  tarField(header, "00000000000\0", 136, 12);
  header.fill(0x20, 148, 156);
  tarField(header, type, 156, 1);
  tarField(header, "ustar\0", 257, 6);
  tarField(header, "00", 263, 2);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  tarField(header, `${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return header;
}

function tarEntry({ path, content = "", type = "0", declaredSize }) {
  const body = Buffer.from(content);
  const header = tarHeader({
    path,
    size: declaredSize ?? body.length,
    type,
  });
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

function manifestEntry(name = definitions.core) {
  return {
    path: "package/package.json",
    content: JSON.stringify({ name, version: "0.0.1" }),
  };
}

async function writeSyntheticTarball(directory, entries, options = {}) {
  const trailerBlocks =
    options.trailer === false ? 0 : (options.trailerBlocks ?? 2);
  const archive = Buffer.concat([
    ...entries.map(tarEntry),
    ...(trailerBlocks === 0 ? [] : [Buffer.alloc(trailerBlocks * 512)]),
  ]);
  const filename = join(directory, `fixture-${Math.random()}.tgz`);
  await writeFile(filename, gzipSync(archive));
  return filename;
}

async function rejectsRealTar(entries, pattern, options) {
  const directory = await mkdtemp(join(tmpdir(), "uniview-real-tar-test-"));
  try {
    const filename = await writeSyntheticTarball(directory, entries, options);
    await assert.rejects(inspectTarball(filename), pattern);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

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

test("rejects unsafe absolute, empty, dot, and parent tar paths", async () => {
  for (const path of [
    "/package/absolute.txt",
    "",
    "package/./dot.txt",
    "package/../escape.txt",
  ]) {
    await rejectsRealTar(
      [manifestEntry(), { path, content: "unsafe" }],
      /header|path|segment/i,
    );
  }
});

test("rejects a real tar entry with a backslash path", async () => {
  await rejectsRealTar(
    [manifestEntry(), { path: "package\\escape.txt", content: "escape" }],
    /backslash|path/i,
  );
});

test("rejects duplicate real tar files and manifests", async () => {
  await rejectsRealTar(
    [
      manifestEntry(),
      { path: "package/dist/index.mjs", content: "first" },
      { path: "package/dist/index.mjs", content: "second" },
    ],
    /duplicate tar file/i,
  );
  await rejectsRealTar(
    [manifestEntry(), manifestEntry()],
    /duplicate manifest/i,
  );
});

test("rejects real tar link, device, and fifo entries", async () => {
  for (const type of ["1", "2", "3", "4", "6"]) {
    await rejectsRealTar(
      [manifestEntry(), { path: "package/dist/link.mjs", type }],
      /link|type/i,
    );
  }
});

test("rejects real tar entries outside the package prefix", async () => {
  await rejectsRealTar(
    [manifestEntry(), { path: "outside/file.mjs", content: "outside" }],
    /package prefix|path/i,
  );
});

test("rejects real tar content that exceeds archive bounds", async () => {
  const manifest = tarEntry(manifestEntry());
  const truncated = Buffer.concat([
    manifest,
    tarHeader({ path: "package/dist/truncated.mjs", size: 4096 }),
    Buffer.from("short"),
  ]);
  const directory = await mkdtemp(join(tmpdir(), "uniview-real-tar-test-"));
  try {
    const filename = join(directory, "truncated.tgz");
    await writeFile(filename, gzipSync(truncated));
    await assert.rejects(inspectTarball(filename), /bounds|size/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a real tar archive without the two-block EOF trailer", async () => {
  await rejectsRealTar([manifestEntry()], /EOF|trailer/i, { trailer: false });
});

test("rejects a real tar archive with only one EOF zero block", async () => {
  await rejectsRealTar([manifestEntry()], /EOF|trailer/i, { trailerBlocks: 1 });
});

test("accepts real tar archives with two or more EOF zero blocks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "uniview-real-tar-test-"));
  try {
    for (const trailerBlocks of [2, 3]) {
      const filename = await writeSyntheticTarball(
        directory,
        [manifestEntry()],
        { trailerBlocks },
      );
      const inspection = await inspectTarball(filename);
      assert.equal(inspection.manifest.name, definitions.core);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects extra files beside the descriptor and three tarballs", async () => {
  const value = await fixture();
  try {
    const descriptorPath = await writeTarballDescriptor({
      directory: value.directory,
      tarballs: value.tarballs,
      inspectTarball: value.inspectTarball,
    });
    await writeFile(join(value.directory, "extra.tgz"), "unexpected artifact");
    await assert.rejects(
      loadTarballDescriptor({
        descriptorPath,
        inspectTarball: value.inspectTarball,
      }),
      /artifact directory|extra/i,
    );
  } finally {
    await rm(value.directory, { recursive: true, force: true });
  }
});

test("rejects a descriptor-inspected packed core containing a Zod import", async () => {
  const directory = await mkdtemp(join(tmpdir(), "uniview-packed-core-test-"));
  try {
    const filename = await writeSyntheticTarball(directory, [
      {
        path: "package/package.json",
        content: JSON.stringify({
          name: definitions.core,
          version: "0.0.1",
          dependencies: { zod: "^4.0.0" },
        }),
      },
      { path: "package/dist/index.mjs", content: `import "zod"` },
      {
        path: "package/dist/index.d.mts",
        content: `export interface Safe { value: string }`,
      },
    ]);
    const inspection = await inspectTarball(filename);
    assert.throws(
      () =>
        validateCorePackageFiles({
          manifest: inspection.manifest,
          files: inspection.contents,
        }),
      /dist\/index\.mjs: zod must not be imported/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a descriptor-inspected packed core containing a CommonJS Zod require", async () => {
  const directory = await mkdtemp(join(tmpdir(), "uniview-packed-cjs-test-"));
  try {
    const filename = await writeSyntheticTarball(directory, [
      {
        path: "package/package.json",
        content: JSON.stringify({
          name: definitions.core,
          version: "0.0.1",
          dependencies: { zod: "^4.0.0" },
        }),
      },
      { path: "package/dist/evil.cjs", content: `require("zod")` },
    ]);
    const inspection = await inspectTarball(filename);
    assert.throws(
      () =>
        validateCorePackageFiles({
          manifest: inspection.manifest,
          files: inspection.contents,
        }),
      /dist\/evil\.cjs: zod must not be imported/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a descriptor-inspected packed core containing an unsafe CommonJS declaration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "uniview-packed-dcts-test-"));
  try {
    const filename = await writeSyntheticTarball(directory, [
      {
        path: "package/package.json",
        content: JSON.stringify({
          name: definitions.core,
          version: "0.0.1",
        }),
      },
      {
        path: "package/dist/evil.d.cts",
        content: `export type Hidden = import("@uniview/hidden").Type | Buffer`,
      },
    ]);
    const inspection = await inspectTarball(filename);
    assert.throws(
      () =>
        validateCorePackageFiles({
          manifest: inspection.manifest,
          files: inspection.contents,
        }),
      /dist\/evil\.d\.cts: @uniview\/hidden/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a descriptor-inspected packed binding containing a hidden TSX import", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "uniview-packed-binding-test-"),
  );
  try {
    const filename = await writeSyntheticTarball(directory, [
      {
        path: "package/package.json",
        content: JSON.stringify({
          name: definitions.react,
          version: "0.0.1",
          dependencies: { "@uniview/hidden": "0.0.1" },
        }),
      },
      {
        path: "package/dist/evil.tsx",
        content: `import "@uniview/hidden"`,
      },
    ]);
    const inspection = await inspectTarball(filename);
    assert.throws(
      () =>
        validateBindingPackageFiles({
          manifest: inspection.manifest,
          files: inspection.contents,
        }),
      /dist\/evil\.tsx: @uniview\/hidden/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
