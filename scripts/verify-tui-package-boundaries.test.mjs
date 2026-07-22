import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractModuleSpecifiers,
  packageArtifactKind,
  validateBindingPackageFiles,
  validateCorePackageFiles,
  validateManifest,
  validatePortableCoreDeclaration,
  validateSource,
} from "./verify-tui-package-boundaries.mjs";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));

test("extracts multiline static, side-effect, re-export, and dynamic imports", () => {
  const source = `
    import {
      render
    } from
      "declared-static";
    import
      "declared-side-effect";
    export {
      render as renderAgain
    } from
      "declared-reexport";
    const lazy = import(
      "declared-dynamic"
    );
    const lazyWithAttributes = import(
      "declared-dynamic-attributes",
      { with: { type: "json" } }
    );
    import importedEquals = require("declared-import-equals");
  `;

  assert.deepEqual(extractModuleSpecifiers(source, "fixture.ts"), [
    "declared-static",
    "declared-side-effect",
    "declared-reexport",
    "declared-dynamic",
    "declared-dynamic-attributes",
    "declared-import-equals",
  ]);
});

test("extracts literal CommonJS and triple-slash type dependencies", () => {
  const source = `
    /// <reference types="declared-reference-types" />
    const loaded = require("declared-require");
    const resolved = require.resolve("declared-require-resolve");
  `;

  assert.deepEqual(extractModuleSpecifiers(source, "fixture.d.ts"), [
    "declared-reference-types",
    "declared-require",
    "declared-require-resolve",
  ]);
});

test("rejects forbidden packages referenced through require.resolve", () => {
  assert.throws(
    () =>
      validateSource({
        file: "fixture.mjs",
        source: `require.resolve("@uniview/hidden")`,
        declaredRuntime: new Set(["@uniview/hidden"]),
      }),
    /fixture\.mjs: @uniview\/hidden/,
  );
});

test("rejects undeclared triple-slash type dependencies", () => {
  assert.throws(
    () =>
      validateSource({
        file: "fixture.d.ts",
        source: `/// <reference types="undeclared-types" />`,
        declaredRuntime: new Set(),
      }),
    /fixture\.d\.ts: undeclared runtime import undeclared-types/,
  );
});

test("rejects a forbidden internal package hidden in a multiline import", () => {
  assert.throws(
    () =>
      validateSource({
        file: "fixture.mjs",
        source: `
          import {
            hidden
          } from
            "@uniview/hidden";
        `,
        declaredRuntime: new Set(["@uniview/hidden"]),
      }),
    /fixture\.mjs: @uniview\/hidden/,
  );
});

test("rejects an undeclared external hidden in a multiline re-export", () => {
  assert.throws(
    () =>
      validateSource({
        file: "fixture.d.mts",
        source: `
          export {
            hidden
          } from
            "undeclared-external";
        `,
        declaredRuntime: new Set(),
      }),
    /fixture\.d\.mts: undeclared runtime import undeclared-external/,
  );
});

test("extracts a literal inline import type from declarations", () => {
  const source = `
    type Declared = import(
      "declared-inline-type"
    ).Declared;
  `;

  assert.deepEqual(extractModuleSpecifiers(source, "fixture.d.mts"), [
    "declared-inline-type",
  ]);
});

test("rejects a forbidden internal package used by an inline import type", () => {
  assert.throws(
    () =>
      validateSource({
        file: "fixture.d.mts",
        source: `
          type Hidden = import(
            "@uniview/hidden"
          ).Hidden;
        `,
        declaredRuntime: new Set(["@uniview/hidden"]),
      }),
    /fixture\.d\.mts: @uniview\/hidden/,
  );
});

test("rejects an undeclared external used by an inline import type", () => {
  assert.throws(
    () =>
      validateSource({
        file: "fixture.d.ts",
        source: `
          type Hidden = import(
            "undeclared-inline-type"
          ).Hidden;
        `,
        declaredRuntime: new Set(),
      }),
    /fixture\.d\.ts: undeclared runtime import undeclared-inline-type/,
  );
});

test("rejects React peer-range drift below the reconciler requirement", () => {
  assert.throws(
    () =>
      validateManifest(
        {
          dir: "packages/tui-react",
          peer: "react",
          peerRange: "^19.2.0",
        },
        {
          dependencies: { "@uniview/tui-core": "workspace:*" },
          peerDependencies: { react: "^19.0.0" },
        },
      ),
    /packages\/tui-react: react peer must be exactly \^19\.2\.0/,
  );
});

test("matches the Solid public and test minimum to babel-preset-solid", async () => {
  const solidDirectory = join(repo, "packages/tui-solid");
  const rendererDirectory = join(repo, "packages/solid-renderer");
  const [binding, preset, renderer, bindingSolid, rendererSolid] =
    await Promise.all([
      readFile(join(solidDirectory, "package.json"), "utf8").then(JSON.parse),
      readFile(
        join(solidDirectory, "node_modules/babel-preset-solid/package.json"),
        "utf8",
      ).then(JSON.parse),
      readFile(join(rendererDirectory, "package.json"), "utf8").then(
        JSON.parse,
      ),
      readFile(
        join(solidDirectory, "node_modules/solid-js/package.json"),
        "utf8",
      ).then(JSON.parse),
      readFile(
        join(rendererDirectory, "node_modules/solid-js/package.json"),
        "utf8",
      ).then(JSON.parse),
    ]);

  assert.equal(preset.peerDependencies["solid-js"], "^1.9.10");
  assert.equal(
    binding.peerDependencies["solid-js"],
    preset.peerDependencies["solid-js"],
  );
  assert.equal(binding.devDependencies["solid-js"], "1.9.10");
  assert.equal(renderer.devDependencies["solid-js"], "1.9.10");
  assert.equal(bindingSolid.version, "1.9.10");
  assert.equal(rendererSolid.version, bindingSolid.version);
});

test("rejects Node Buffer leakage from core declarations", () => {
  assert.throws(
    () =>
      validatePortableCoreDeclaration({
        file: "index.d.mts",
        source: `interface Input { push(chunk: Buffer | string): void }`,
      }),
    /index\.d\.mts: public declaration leaks Node Buffer/,
  );
});

test("rejects a declared zod runtime import from core JavaScript", () => {
  assert.throws(
    () =>
      validateCorePackageFiles({
        manifest: { dependencies: { zod: "^4.0.0" } },
        files: new Map([["dist/index.mjs", `import "zod"`]]),
      }),
    /dist\/index\.mjs: zod must not be imported/,
  );
});

test("rejects an undeclared runtime import from core JavaScript", () => {
  assert.throws(
    () =>
      validateCorePackageFiles({
        manifest: { dependencies: {} },
        files: new Map([["dist/index.js", `import "undeclared-core"`]]),
      }),
    /dist\/index\.js: undeclared runtime import undeclared-core/,
  );
});

test("rejects bundled Zod implementation markers from core JavaScript", () => {
  assert.throws(
    () =>
      validateCorePackageFiles({
        manifest: { dependencies: {} },
        files: new Map([
          ["dist/index.mjs", `const source = "node_modules/.pnpm/zod@4"`],
        ]),
      }),
    /dist\/index\.mjs: bundled zod implementation/,
  );
});

test("applies import boundaries and Buffer portability to core declarations", () => {
  assert.throws(
    () =>
      validateCorePackageFiles({
        manifest: { dependencies: {} },
        files: new Map([
          [
            "dist/index.d.mts",
            `export type Hidden = import("@uniview/hidden").Type`,
          ],
        ]),
      }),
    /dist\/index\.d\.mts: @uniview\/hidden/,
  );
  assert.throws(
    () =>
      validateCorePackageFiles({
        manifest: { dependencies: {} },
        files: new Map([
          ["dist/index.d.mts", `export type Chunk = Buffer | string`],
        ]),
      }),
    /public declaration leaks Node Buffer/,
  );
});

test("rejects a Zod require from a core CommonJS artifact", () => {
  assert.throws(
    () =>
      validateCorePackageFiles({
        manifest: { dependencies: { zod: "^4.0.0" } },
        files: new Map([["dist/evil.cjs", `require("zod")`]]),
      }),
    /dist\/evil\.cjs: zod must not be imported/,
  );
});

test("scans CommonJS declaration imports and Buffer portability", () => {
  assert.throws(
    () =>
      validateCorePackageFiles({
        manifest: { dependencies: {} },
        files: new Map([
          [
            "dist/evil.d.cts",
            `export type Hidden = import("@uniview/hidden").Type`,
          ],
        ]),
      }),
    /dist\/evil\.d\.cts: @uniview\/hidden/,
  );
  assert.throws(
    () =>
      validateCorePackageFiles({
        manifest: { dependencies: {} },
        files: new Map([
          ["dist/evil.d.cts", `export type Hidden = Buffer | string`],
        ]),
      }),
    /dist\/evil\.d\.cts: public declaration leaks Node Buffer/,
  );
});

test("recognizes every emitted JavaScript and TypeScript artifact family", () => {
  for (const file of [
    "index.js",
    "index.jsx",
    "index.mjs",
    "index.cjs",
    "index.ts",
    "index.tsx",
    "index.mts",
    "index.cts",
  ]) {
    assert.equal(packageArtifactKind(`dist/${file}`), "source", file);
  }
  for (const file of ["index.d.ts", "index.d.mts", "index.d.cts"]) {
    assert.equal(packageArtifactKind(`dist/${file}`), "declaration", file);
  }
  assert.equal(packageArtifactKind("dist/index.map"), null);
});

test("applies package boundaries to binding JSX and TSX artifacts", () => {
  assert.throws(
    () =>
      validateBindingPackageFiles({
        manifest: { dependencies: { zod: "^4.0.0" } },
        files: new Map([["dist/evil.jsx", `require("zod")`]]),
      }),
    /dist\/evil\.jsx: zod must not be imported/,
  );
  assert.throws(
    () =>
      validateBindingPackageFiles({
        manifest: { dependencies: { "@uniview/hidden": "0.0.1" } },
        files: new Map([["dist/evil.tsx", `import "@uniview/hidden"`]]),
      }),
    /dist\/evil\.tsx: @uniview\/hidden/,
  );
});
