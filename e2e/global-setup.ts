import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import process from "node:process";

const ROOT = process.cwd();
const managedProcesses: Array<{ name: string; child: ChildProcess }> = [];
let isTearingDown = false;

function createEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  delete env.NO_COLOR;
  return env;
}

function runPnpm(args: string[]): void {
  const result = spawnSync("pnpm", args, {
    cwd: ROOT,
    stdio: "inherit",
    env: createEnv(),
  });

  if (result.status !== 0) {
    throw new Error(
      `pnpm ${args.join(" ")} failed with exit code ${result.status}`,
    );
  }
}

function startProcess(name: string, args: string[]): void {
  const child = spawn("pnpm", args, {
    cwd: ROOT,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: createEnv(),
  });

  child.stdout?.on("data", (chunk) =>
    process.stdout.write(`[${name}] ${chunk}`),
  );
  child.stderr?.on("data", (chunk) =>
    process.stderr.write(`[${name}] ${chunk}`),
  );
  child.on("exit", (code, signal) => {
    if (isTearingDown) return;
    if (code !== null && code !== 0) {
      process.stderr.write(`[${name}] exited with code ${code}\n`);
    }
    if (signal) {
      process.stderr.write(`[${name}] exited with signal ${signal}\n`);
    }
  });

  managedProcesses.push({ name, child });
}

async function waitForHttp(
  url: string,
  label: string,
  timeoutMs = 30_000,
): Promise<void> {
  const started = Date.now();
  let lastError = "not checked";

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`${label} did not become ready at ${url}: ${lastError}`);
}

function stopProcess(child: ChildProcess): void {
  if (!child.pid || child.killed) return;

  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    child.kill("SIGTERM");
  }
}

export default async function globalSetup() {
  runPnpm(["--filter", "@uniview/example-plugin", "run", "build"]);
  runPnpm(["--filter", "@uniview/plugin-solid-example", "run", "build"]);

  startProcess("bridge", [
    "--filter",
    "@uniview/bridge-server",
    "run",
    "start",
  ]);
  await waitForHttp(
    "http://127.0.0.1:3000/react/simple-demo.worker.js",
    "bridge server",
  );

  startProcess("react-simple-client", [
    "--filter",
    "@uniview/example-plugin",
    "run",
    "client:simple",
  ]);
  startProcess("react-advanced-client", [
    "--filter",
    "@uniview/example-plugin",
    "run",
    "client:advanced",
  ]);
  startProcess("react-benchmark-full-client", [
    "--filter",
    "@uniview/example-plugin",
    "run",
    "client:benchmark-full",
  ]);
  startProcess("react-benchmark-incremental-client", [
    "--filter",
    "@uniview/example-plugin",
    "run",
    "client:benchmark-incremental",
  ]);
  startProcess("solid-simple-client", [
    "--filter",
    "@uniview/plugin-solid-example",
    "run",
    "client:simple",
  ]);
  startProcess("solid-advanced-client", [
    "--filter",
    "@uniview/plugin-solid-example",
    "run",
    "client:advanced",
  ]);
  startProcess("solid-benchmark-full-client", [
    "--filter",
    "@uniview/plugin-solid-example",
    "run",
    "client:benchmark-full",
  ]);
  startProcess("solid-benchmark-incremental-client", [
    "--filter",
    "@uniview/plugin-solid-example",
    "run",
    "client:benchmark-incremental",
  ]);

  startProcess("host-svelte", [
    "--filter",
    "@uniview/example-host-svelte",
    "run",
    "svelte",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
  ]);
  startProcess("host-react", [
    "--filter",
    "@uniview/example-host-react",
    "run",
    "react",
    "--host",
    "127.0.0.1",
    "--port",
    "5174",
  ]);
  startProcess("host-vue", [
    "--filter",
    "@uniview/example-host-vue",
    "run",
    "vue",
    "--host",
    "127.0.0.1",
    "--port",
    "5175",
  ]);

  await waitForHttp("http://127.0.0.1:5173/", "Svelte host");
  await waitForHttp("http://127.0.0.1:5174/", "React host");
  await waitForHttp("http://127.0.0.1:5175/", "Vue host");

  return async () => {
    isTearingDown = true;
    for (const { child } of managedProcesses.reverse()) {
      child.stdout?.removeAllListeners("data");
      child.stderr?.removeAllListeners("data");
      stopProcess(child);
    }
  };
}
