import { startWorkerPlugin } from "@uniview/react-runtime";
import { BenchmarkApp } from "./benchmark";

startWorkerPlugin({
  App: BenchmarkApp,
  mode: "full",
});
