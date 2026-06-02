import { expect, type Page } from "@playwright/test";

export type HostName = "svelte" | "react" | "vue";
export type PluginFramework = "react" | "solid";
export type RuntimeMode = "worker" | "node-server" | "main-thread";
export type DemoName = "simple" | "advanced";
export type BenchmarkUpdateMode = "full" | "incremental";

export const HOST_URLS: Record<HostName, string> = {
  svelte: "http://127.0.0.1:5173",
  react: "http://127.0.0.1:5174",
  vue: "http://127.0.0.1:5175",
};

export async function openSvelteDemo(
  page: Page,
  options: {
    framework: PluginFramework;
    runtime: RuntimeMode;
    demo: DemoName;
    update?: "full" | "incremental";
  },
): Promise<void> {
  const update = options.update ?? "full";
  await page.goto(
    `${HOST_URLS.svelte}/?framework=${options.framework}&runtime=${options.runtime}&demo=${options.demo}&update=${update}`,
  );
  await waitForDemoHeading(page, options.demo);
}

export async function openSvelteBenchmark(
  page: Page,
  options: {
    framework: PluginFramework;
    runtime?: Extract<RuntimeMode, "worker" | "node-server">;
    update: BenchmarkUpdateMode;
  },
): Promise<void> {
  const runtime = options.runtime ?? "worker";
  await page.goto(
    `${HOST_URLS.svelte}/?framework=${options.framework}&runtime=${runtime}&demo=benchmark&update=${options.update}`,
  );
  await waitForBenchmarkHeading(page, options.framework);
}

export async function openReactOrVueDemo(
  page: Page,
  host: "react" | "vue",
  options: { runtime: RuntimeMode; demo: DemoName },
): Promise<void> {
  await page.goto(HOST_URLS[host]);
  await chooseRuntime(page, options.runtime);
  await chooseDemo(page, options.demo);
  await waitForDemoHeading(page, options.demo);
}

export async function waitForDemoHeading(
  page: Page,
  demo: DemoName,
): Promise<void> {
  await expect(
    page.getByRole("heading", {
      name: demo === "simple" ? "Simple Demo" : "Advanced Demo",
    }),
  ).toBeVisible({ timeout: 20_000 });
}

export async function waitForBenchmarkHeading(
  page: Page,
  framework: PluginFramework,
): Promise<void> {
  const frameworkName = framework === "react" ? "React" : "Solid";
  await expect(
    page.getByRole("heading", {
      name: `${frameworkName} Benchmark (High Stress)`,
    }),
  ).toBeVisible({ timeout: 20_000 });
}

export async function chooseRuntime(
  page: Page,
  runtime: RuntimeMode,
): Promise<void> {
  const buttonName =
    runtime === "worker"
      ? /Worker/
      : runtime === "node-server"
        ? /Node\.js/
        : /Main/;
  await page.getByRole("button", { name: buttonName }).click();
}

export async function chooseDemo(page: Page, demo: DemoName): Promise<void> {
  await page
    .getByRole("button", {
      name: demo === "simple" ? "Simple Demo" : "Advanced Demo",
    })
    .click();
}

export async function runSimpleFlow(page: Page): Promise<void> {
  await page.getByPlaceholder("Enter your name").fill("Ada");
  await page.getByRole("button", { name: /Click count: 0/ }).click();
  await page.getByRole("button", { name: /Click count: 1/ }).click();
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("Hello,")).toBeVisible();
  await expect(page.getByText("Ada")).toBeVisible();
  await expect(page.getByText(/2\s+times/)).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("Hello,")).toHaveCount(0);
}

export async function runAdvancedFlow(page: Page): Promise<void> {
  const submit = page.getByRole("button", { name: "Submit Form" });

  await expect(submit).toBeDisabled();
  await page.getByPlaceholder("Enter your username").fill("ada");
  await page.getByPlaceholder("Enter your email").fill("ada@example.com");
  await expect(submit).toBeEnabled();

  const switches = page.getByRole("switch");
  await switches.nth(0).click();
  await page.getByRole("button", { name: "SMS" }).click();

  await submit.click();
  await expect(page.getByText("Form Submitted Successfully!")).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText(/Username:\s*ada/)).toBeVisible();
  await expect(page.getByText(/Email:\s*ada@example\.com/)).toBeVisible();
  await expect(page.getByText(/Notifications:\s*Enabled/)).toBeVisible();
  await expect(page.getByText(/Preference:\s*sms/)).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("Form Submitted Successfully!")).toHaveCount(0);
}

export async function runBenchmarkFlow(page: Page): Promise<void> {
  const itemCount = page.getByText(/Item count:/i);

  await expect(itemCount).toHaveText(/Item count:\s*500\s*\/\s*1000\s*\(max\)/);
  await expect(page.getByText(/Operations performed:\s*0/)).toBeVisible();

  await page
    .getByRole("button", { name: /Add 50 Items \(Random Pos\)/ })
    .click();
  await expect(itemCount).toHaveText(/Item count:\s*550\s*\/\s*1000\s*\(max\)/);
  await expect(page.getByText(/Operations performed:\s*1/)).toBeVisible();

  await page
    .getByRole("button", { name: /Remove 50 Items \(Random Pos\)/ })
    .click();
  await expect(itemCount).toHaveText(/Item count:\s*500\s*\/\s*1000\s*\(max\)/);
  await expect(page.getByText(/Operations performed:\s*2/)).toBeVisible();

  await page.getByRole("button", { name: /Update Single Item/i }).click();
  await expect(itemCount).toHaveText(/Item count:\s*500\s*\/\s*1000\s*\(max\)/);
  await expect(page.getByText(/Operations performed:\s*3/)).toBeVisible();
}
