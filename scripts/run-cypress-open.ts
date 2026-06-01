import { spawn } from "node:child_process";
import process from "node:process";
import { startE2EFixtures } from "./e2e-fixtures";

function createEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  delete env.NO_COLOR;
  return env;
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      if (code !== null) {
        resolve(code);
        return;
      }
      resolve(signal === "SIGINT" ? 130 : 1);
    });
  });
}

function run(command: string, args: string[]): Promise<number> {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: createEnv(),
  });
  return waitForExit(child);
}

function parseEnv(value: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const item of value.split(",")) {
    if (!item) continue;
    const [key, ...valueParts] = item.split("=");
    if (!key) continue;
    entries.set(key, valueParts.length === 0 ? "true" : valueParts.join("="));
  }
  return entries;
}

function formatEnv(entries: Map<string, string>): string {
  return [...entries].map(([key, value]) => `${key}=${value}`).join(",");
}

function withOpenModeEnv(args: string[]): string[] {
  const defaults = new Map([
    ["univiewVisualDelayMs", "500"],
    ["univiewPauseAtStart", "false"],
  ]);
  const mergedArgs = [...args];
  const envIndex = mergedArgs.findIndex(
    (arg) => arg === "--env" || arg.startsWith("--env="),
  );

  if (envIndex === -1) {
    return ["--env", formatEnv(defaults), ...mergedArgs];
  }

  if (mergedArgs[envIndex] === "--env") {
    const userEnv = parseEnv(mergedArgs[envIndex + 1] ?? "");
    for (const [key, value] of userEnv) defaults.set(key, value);
    mergedArgs[envIndex + 1] = formatEnv(defaults);
    return mergedArgs;
  }

  const userEnv = parseEnv(mergedArgs[envIndex].slice("--env=".length));
  for (const [key, value] of userEnv) defaults.set(key, value);
  mergedArgs[envIndex] = `--env=${formatEnv(defaults)}`;
  return mergedArgs;
}

const buildExitCode = await run("pnpm", ["build"]);
if (buildExitCode !== 0) {
  process.exit(buildExitCode);
}

const teardown = await startE2EFixtures();
let exitCode = 0;

try {
  exitCode = await run("pnpm", [
    "exec",
    "cypress",
    "open",
    "--e2e",
    ...withOpenModeEnv(process.argv.slice(2)),
  ]);
} finally {
  await teardown();
}

process.exit(exitCode);
