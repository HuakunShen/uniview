import assert from "node:assert/strict";
import test from "node:test";

import {
  extractModuleSpecifiers,
  validateManifest,
  validatePortableCoreDeclaration,
  validateSource,
} from "./verify-tui-package-boundaries.mjs";

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
