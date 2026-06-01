import { test } from "@playwright/test";
import {
  openReactOrVueDemo,
  runAdvancedFlow,
  runSimpleFlow,
} from "../demo-flows";

const runtimes = ["worker", "main-thread", "node-server"] as const;

for (const runtime of runtimes) {
  test(`react host ${runtime} simple demo`, async ({ page }) => {
    await openReactOrVueDemo(page, "react", { runtime, demo: "simple" });
    await runSimpleFlow(page);
  });

  test(`react host ${runtime} advanced demo`, async ({ page }) => {
    await openReactOrVueDemo(page, "react", { runtime, demo: "advanced" });
    await runAdvancedFlow(page);
  });
}
