import { test } from "@playwright/test";
import {
  openReactOrVueDemo,
  runAdvancedFlow,
  runSimpleFlow,
} from "../demo-flows";

const runtimes = ["worker", "main-thread", "node-server"] as const;

for (const runtime of runtimes) {
  test(`vue host ${runtime} simple demo`, async ({ page }) => {
    await openReactOrVueDemo(page, "vue", { runtime, demo: "simple" });
    await runSimpleFlow(page);
  });

  test(`vue host ${runtime} advanced demo`, async ({ page }) => {
    await openReactOrVueDemo(page, "vue", { runtime, demo: "advanced" });
    await runAdvancedFlow(page);
  });
}
