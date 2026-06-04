import { startWorkerPlugin } from "@uniview/react-runtime";
import FormDemo from "./form-demo";

startWorkerPlugin({ App: FormDemo, mode: "incremental" });
