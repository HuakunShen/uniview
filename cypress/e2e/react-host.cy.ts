import {
  openReactOrVueDemo,
  runAdvancedFlow,
  runSimpleFlow,
} from "./demo-flows";

const runtimes = ["worker", "main-thread", "node-server"] as const;

describe("react host", () => {
  for (const runtime of runtimes) {
    it(`${runtime} simple demo`, () => {
      openReactOrVueDemo("react", { runtime, demo: "simple" });
      runSimpleFlow();
    });

    it(`${runtime} advanced demo`, () => {
      openReactOrVueDemo("react", { runtime, demo: "advanced" });
      runAdvancedFlow();
    });
  }
});
