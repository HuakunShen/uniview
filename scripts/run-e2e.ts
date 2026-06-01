import { spawnSync } from "node:child_process";
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
process.exit(playwright.status ?? 1);
