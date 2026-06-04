import { startWorkerPlugin } from "@uniview/react-runtime";
import DetailDemo from "./detail-demo";

startWorkerPlugin({ App: DetailDemo, mode: "incremental" });
