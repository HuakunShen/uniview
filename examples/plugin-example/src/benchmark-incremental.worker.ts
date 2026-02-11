import { startWorkerPlugin } from "@uniview/runtime";
import { BenchmarkApp } from "./benchmark";

startWorkerPlugin({
	App: BenchmarkApp,
	mode: "incremental",
});
