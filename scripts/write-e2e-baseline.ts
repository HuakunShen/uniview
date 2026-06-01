import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

interface PlaywrightError {
  message?: string;
  value?: string;
}

interface PlaywrightResult {
  duration?: number;
  errors?: PlaywrightError[];
  status?: string;
}

interface PlaywrightTest {
  outcome?: string;
  projectName?: string;
  results?: PlaywrightResult[];
  title?: string;
}

interface PlaywrightSpec {
  tests?: PlaywrightTest[];
  title?: string;
}

interface PlaywrightSuite {
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
  title?: string;
}

interface PlaywrightReport {
  errors?: PlaywrightError[];
  suites?: PlaywrightSuite[];
}

interface CollectedTest {
  duration: number;
  errors: string;
  outcome: string;
  projectName: string;
  title: string;
}

const resultPath = join(process.cwd(), ".reports/playwright-results.json");
const reportPath = join(
  process.cwd(),
  "docs/superpowers/reports/2026-06-02-e2e-baseline.md",
);

function safeExec(command: string): string {
  try {
    return execSync(command, { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function getErrorText(error: PlaywrightError): string {
  return error.message ?? error.value ?? "unknown error";
}

function collectTests(
  suite: PlaywrightSuite,
  path: string[] = [],
  results: CollectedTest[] = [],
): CollectedTest[] {
  const suitePath = suite.title ? [...path, suite.title] : path;

  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const title = [...suitePath, spec.title, test.title]
        .filter((part): part is string => Boolean(part))
        .join(" > ");
      const lastResult = test.results?.[test.results.length - 1];
      const errors = (lastResult?.errors ?? []).map(getErrorText).join("\n");

      results.push({
        title,
        projectName: test.projectName ?? "unknown-project",
        outcome: test.outcome ?? lastResult?.status ?? "unknown",
        duration: lastResult?.duration ?? 0,
        errors,
      });
    }
  }

  for (const child of suite.suites ?? []) {
    collectTests(child, suitePath, results);
  }

  return results;
}

const data: PlaywrightReport = JSON.parse(await Bun.file(resultPath).text());
const tests = (data.suites ?? []).flatMap((suite) => collectTests(suite));
const topLevelErrors = (data.errors ?? []).map(getErrorText);
const passed = tests.filter(
  (test) => test.outcome === "expected" || test.outcome === "passed",
);
const failed = tests.filter(
  (test) =>
    test.outcome !== "expected" &&
    test.outcome !== "passed" &&
    test.outcome !== "skipped",
);
const skipped = tests.filter((test) => test.outcome === "skipped");

const lines = [
  "# E2E Baseline",
  "",
  "**Date:** 2026-06-02",
  `**Branch:** ${safeExec("git branch --show-current")}`,
  `**Commit:** ${safeExec("git rev-parse --short HEAD")}`,
  "",
  "## Summary",
  "",
  `- Total: ${tests.length}`,
  `- Passing: ${passed.length}`,
  `- Failing: ${failed.length + topLevelErrors.length}`,
  `- Skipped: ${skipped.length}`,
  `- Top-level errors: ${topLevelErrors.length}`,
  "",
  "## Passing Scenarios",
  "",
  ...passed.map(
    (test) => `- ${test.projectName}: ${test.title} (${test.duration}ms)`,
  ),
  "",
  "## Failing Scenarios",
  "",
  ...(failed.length === 0 && topLevelErrors.length === 0
    ? ["- None"]
    : [
        ...topLevelErrors.flatMap((error) => [
          "- Playwright setup",
          "",
          "```text",
          error,
          "```",
          "",
        ]),
        ...failed.flatMap((test) => [
          `- ${test.projectName}: ${test.title}`,
          "",
          "```text",
          test.errors || "No error message recorded",
          "```",
          "",
        ]),
      ]),
  "## Skipped Scenarios",
  "",
  ...(skipped.length === 0
    ? ["- None"]
    : skipped.map((test) => `- ${test.projectName}: ${test.title}`)),
  "",
  "## Next Use",
  "",
  "Use this report as the first functional baseline. Fixes after this point should update the report only when a scenario changes from failing to passing or from passing to failing.",
  "",
];

mkdirSync(dirname(reportPath), { recursive: true });
await Bun.write(reportPath, `${lines.join("\n")}\n`);
console.log(`Wrote ${reportPath}`);
