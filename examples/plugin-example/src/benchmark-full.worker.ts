import { startWorkerPlugin } from "@uniview/runtime";
import Benchmark from "./benchmark";

startWorkerPlugin({ App: Benchmark, updateMode: "full" });
