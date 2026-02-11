import { connectSolidToHostServer } from "@uniview/solid-runtime";
import { BenchmarkApp } from "./benchmark";

const serverUrl = process.env.SERVER_URL || "ws://localhost:3001";
const pluginId = process.env.PLUGIN_ID || "solid-benchmark-full";

await connectSolidToHostServer({
	App: BenchmarkApp,
	serverUrl,
	pluginId,
	mode: "full",
});

console.log(`[${pluginId}] Connected to ${serverUrl}`);
