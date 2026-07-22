import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const workflow = await readFile(join(repo, ".github/workflows/ci.yml"), "utf8");

function job(name, nextName) {
  const start = workflow.indexOf(`  ${name}:\n`);
  assert.notEqual(start, -1, `missing ${name} job`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:\n`, start) : -1;
  return workflow.slice(start, end === -1 ? undefined : end);
}

test("prepares one immutable TUI artifact outside the runtime matrix", () => {
  const prepare = job("tui-release-prepare", "tui-release-smoke");
  assert.doesNotMatch(prepare, /^    strategy:/m);
  assert.match(prepare, /node-version: 24/);
  assert.match(prepare, /pnpm verify:tui-packages/);
  assert.match(prepare, /smoke-tui-tarballs\.mjs --prepare/);
  assert.match(prepare, /uses: actions\/upload-artifact@v4/);
  assert.match(prepare, /name: tui-release-tarballs/);
  assert.match(prepare, /if-no-files-found: error/);
  assert.equal(workflow.match(/smoke-tui-tarballs\.mjs --prepare/g)?.length, 1);
});

test("all runtime legs download and reuse the same prepared artifact", () => {
  const smoke = job("tui-release-smoke", "e2e");
  assert.match(smoke, /needs: tui-release-prepare/);
  assert.match(smoke, /runtime-node: \["18\.20\.8", "20\.19\.0", "24"\]/);
  assert.match(smoke, /uses: actions\/download-artifact@v4/);
  assert.match(smoke, /name: tui-release-tarballs/);

  const download = smoke.indexOf("uses: actions/download-artifact@v4");
  const switchRuntime = smoke.indexOf("Setup runtime Node.js");
  const reuse = smoke.indexOf("smoke-tui-tarballs.mjs --reuse");
  assert.ok(download < switchRuntime && switchRuntime < reuse);

  const afterRuntimeSwitch = smoke.slice(switchRuntime);
  assert.doesNotMatch(afterRuntimeSwitch, /pnpm verify:tui-packages/);
  assert.doesNotMatch(afterRuntimeSwitch, /--prepare/);
  assert.doesNotMatch(afterRuntimeSwitch, /\bpnpm\b/);
});
