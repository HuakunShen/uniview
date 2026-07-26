/**
 * Run every curriculum step and fail if any of them stops working.
 *
 * The curriculum's one binding rule is that a step's example must actually run
 * and its doc must quote the real captured output. That rule decays silently:
 * a step keeps compiling long after the design it teaches has moved on. This is
 * the guard — `pnpm test` in `learn/` runs all sixteen steps end to end.
 *
 * It deliberately does NOT compare output against the docs. Several steps print
 * real timings and ephemeral ports, so byte-comparison would fail constantly and
 * teach everyone to ignore it. Exit status is the signal: a step that throws, or
 * hangs past its timeout, is a broken step.
 */
import { readdirSync, existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const stepsDir = join(here, "steps")

// Steps 13 and 14 start a worker thread and a child process over a real socket;
// they need more room than a step that just prints a tree.
const TIMEOUT_MS = 120_000

const steps = readdirSync(stepsDir)
  .filter((name) => existsSync(join(stepsDir, name, "main.ts")))
  .sort()

if (steps.length === 0) {
  console.error("no steps found — expected learn/steps/*/main.ts")
  process.exit(1)
}

/** @param {string} name */
function runStep(name) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn("npx", ["tsx", join("steps", name, "main.ts")], {
      cwd: here,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let output = ""
    child.stdout.on("data", (chunk) => (output += chunk))
    child.stderr.on("data", (chunk) => (output += chunk))

    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({ name, ok: false, reason: `timed out after ${TIMEOUT_MS / 1000}s`, output })
    }, TIMEOUT_MS)

    child.on("close", (code) => {
      clearTimeout(timer)
      const ms = Date.now() - started
      resolve(
        code === 0
          ? { name, ok: true, ms, lines: output.split("\n").length }
          : { name, ok: false, reason: `exit ${code}`, output },
      )
    })
  })
}

console.log(`running ${steps.length} curriculum steps\n`)

let failed = 0
for (const name of steps) {
  const result = await runStep(name)
  if (result.ok) {
    console.log(`  PASS  ${name.padEnd(32)} ${String(result.lines).padStart(4)} lines  ${result.ms} ms`)
  } else {
    failed++
    console.log(`  FAIL  ${name.padEnd(32)} ${result.reason}`)
    console.log(
      result.output
        .split("\n")
        .slice(-15)
        .map((line) => `        ${line}`)
        .join("\n"),
    )
  }
}

console.log(
  failed === 0
    ? `\nall ${steps.length} steps ran clean`
    : `\n${failed} of ${steps.length} steps FAILED`,
)
process.exit(failed === 0 ? 0 : 1)
