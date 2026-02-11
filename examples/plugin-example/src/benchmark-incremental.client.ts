import { connectToHostServer } from "@uniview/runtime";
import { BenchmarkApp } from "./benchmark";

const serverUrl = process.env.SERVER_URL || "ws://localhost:3001";
const pluginId = process.env.PLUGIN_ID || "benchmark-incremental";

await connectToHostServer({
	App: BenchmarkApp,
	serverUrl,
	pluginId,
	mode: "incremental",
});

console.log(`[${pluginId}] Connected to ${serverUrl}`);
