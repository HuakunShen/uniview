import {
  openReactOrVueDemo,
  runAdvancedFlow,
  runSimpleFlow,
} from "./demo-flows";

const runtimes = ["worker", "main-thread", "node-server"] as const;

describe("vue host", () => {
  for (const runtime of runtimes) {
    it(`${runtime} simple demo`, () => {
      openReactOrVueDemo("vue", { runtime, demo: "simple" });
      runSimpleFlow();
    });

    it(`${runtime} advanced demo`, () => {
      openReactOrVueDemo("vue", { runtime, demo: "advanced" });
      runAdvancedFlow();
    });
  }
});
