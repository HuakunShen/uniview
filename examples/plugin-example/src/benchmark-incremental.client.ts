import { connectToHostServer } from "@uniview/react-runtime";
import { BenchmarkApp } from "./benchmark";

const serverUrl = process.env.SERVER_URL || "ws://127.0.0.1:3000";
const pluginId = process.env.PLUGIN_ID || "benchmark-incremental";

await connectToHostServer({
  App: BenchmarkApp,
  serverUrl,
  pluginId,
  mode: "incremental",
});

console.log(`[${pluginId}] Connected to ${serverUrl}`);
