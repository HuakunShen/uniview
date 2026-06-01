import { spawnSync } from "node:child_process";
import process from "node:process";
import { startE2EFixtures } from "./e2e-fixtures";

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

const teardown = await startE2EFixtures();
let exitCode = 0;

try {
  const cypress = run("pnpm", [
    "exec",
    "cypress",
    "run",
    "--e2e",
    ...process.argv.slice(2),
  ]);
  exitCode = cypress.status ?? 1;
} finally {
  await teardown();
}

process.exit(exitCode);
