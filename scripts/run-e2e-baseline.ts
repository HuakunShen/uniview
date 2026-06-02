import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

function createEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  delete env.NO_COLOR;
  return env;
}

function run(command: string, args: string[]) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: createEnv(),
  });
}

const build = run("pnpm", ["build"]);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const playwright = run("pnpm", ["exec", "playwright", "test"]);

if (!existsSync(".reports/playwright-results.json")) {
  console.error("Playwright did not produce .reports/playwright-results.json");
  process.exit(playwright.status ?? 1);
}

const writer = run("bun", ["scripts/write-e2e-baseline.ts"]);
if (writer.status !== 0) {
  process.exit(writer.status ?? 1);
}

if (playwright.status !== 0) {
  console.error(
    "E2E baseline contains failing scenarios. Report was still written successfully.",
  );
}

process.exit(0);
