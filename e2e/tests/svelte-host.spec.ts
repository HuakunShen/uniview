import { expect, test } from "@playwright/test";
import {
  openSvelteBenchmark,
  openSvelteDemo,
  runAdvancedFlow,
  runBenchmarkFlow,
  runSimpleFlow,
} from "../demo-flows";

const simpleCases = [
  { framework: "react", runtime: "worker" },
  { framework: "react", runtime: "main-thread" },
  { framework: "react", runtime: "node-server" },
  { framework: "solid", runtime: "worker" },
  { framework: "solid", runtime: "node-server" },
] as const;

for (const scenario of simpleCases) {
  test(`svelte host ${scenario.framework} ${scenario.runtime} simple demo`, async ({
    page,
  }) => {
    await openSvelteDemo(page, { ...scenario, demo: "simple" });
    await runSimpleFlow(page);
  });
}

const advancedCases = [
  { framework: "react", runtime: "worker" },
  { framework: "react", runtime: "main-thread" },
  { framework: "react", runtime: "node-server" },
  { framework: "solid", runtime: "worker" },
  { framework: "solid", runtime: "node-server" },
] as const;

for (const scenario of advancedCases) {
  test(`svelte host ${scenario.framework} ${scenario.runtime} advanced demo`, async ({
    page,
  }) => {
    await openSvelteDemo(page, { ...scenario, demo: "advanced" });
    await runAdvancedFlow(page);
  });
}

test("svelte host disables Solid main-thread mode", async ({ page }) => {
  await page.goto(
    "http://127.0.0.1:5173/?framework=solid&runtime=main-thread&demo=simple&update=full",
  );

  await expect(page.getByRole("button", { name: /Main/ })).toBeDisabled();
  await expect(page).toHaveURL(/runtime=worker/);
});

const benchmarkCases = [
  { framework: "react", runtime: "worker", update: "full" },
  { framework: "react", runtime: "worker", update: "incremental" },
  { framework: "react", runtime: "node-server", update: "full" },
  { framework: "react", runtime: "node-server", update: "incremental" },
  { framework: "solid", runtime: "worker", update: "full" },
  { framework: "solid", runtime: "worker", update: "incremental" },
  { framework: "solid", runtime: "node-server", update: "full" },
  { framework: "solid", runtime: "node-server", update: "incremental" },
] as const;

for (const scenario of benchmarkCases) {
  test(`svelte host ${scenario.framework} ${scenario.runtime} benchmark ${scenario.update} updates`, async ({
    page,
  }) => {
    await openSvelteBenchmark(page, scenario);
    await runBenchmarkFlow(page);
  });
}
