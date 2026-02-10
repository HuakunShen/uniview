import { startSolidWorkerPlugin } from "@uniview/solid-runtime"
import App from "./benchmark"

startSolidWorkerPlugin({ App, updateMode: "incremental" })
