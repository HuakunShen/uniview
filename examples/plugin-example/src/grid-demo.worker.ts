import { startWorkerPlugin } from "@uniview/react-runtime";
import GridDemo from "./grid-demo";

startWorkerPlugin({ App: GridDemo, mode: "incremental" });
