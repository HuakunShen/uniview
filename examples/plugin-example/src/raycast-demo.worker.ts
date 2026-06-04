import { startWorkerPlugin } from "@uniview/react-runtime";
import RaycastDemo from "./raycast-demo";

startWorkerPlugin({ App: RaycastDemo, mode: "incremental" });
