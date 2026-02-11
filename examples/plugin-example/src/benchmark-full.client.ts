import { connectToHostServer } from "@uniview/runtime";
import { BenchmarkApp } from "./benchmark";

const serverUrl = process.env.SERVER_URL || "ws://localhost:3000";
const pluginId = process.env.PLUGIN_ID || "benchmark-full";

await connectToHostServer({
	App: BenchmarkApp,
	serverUrl,
	pluginId,
	mode: "full",
});

console.log(`[${pluginId}] Connected to ${serverUrl}`);
