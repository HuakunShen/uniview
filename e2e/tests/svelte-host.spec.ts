import { expect, test } from "@playwright/test";
import { openSvelteDemo, runAdvancedFlow, runSimpleFlow } from "../demo-flows";

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

test("svelte host benchmark smoke renders and responds", async ({ page }) => {
  await page.goto(
    "http://127.0.0.1:5173/?framework=react&runtime=worker&demo=benchmark&update=full",
  );

  await expect(page.getByRole("heading", { name: /Benchmark/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Item count:/i)).toBeVisible();
  await page.getByRole("button", { name: /Update Single Item/i }).click();
  await expect(page.getByText(/Operations performed:/i)).toBeVisible();
});
