import { startWorkerPlugin } from "@uniview/react-runtime";
import ClipboardHistoryDemo from "./clipboard-history-demo";

startWorkerPlugin({ App: ClipboardHistoryDemo, mode: "incremental" });
