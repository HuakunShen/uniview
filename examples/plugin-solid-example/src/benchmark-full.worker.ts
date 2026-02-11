import { startSolidWorkerPlugin } from "@uniview/solid-runtime";
import { BenchmarkApp } from "./benchmark";

startSolidWorkerPlugin({
	App: BenchmarkApp,
	mode: "full",
});
