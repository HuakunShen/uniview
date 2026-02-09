import { createSolidWebSocketPluginClient } from "@uniview/solid-runtime/ws-client"
import App from "./advanced-demo"

createSolidWebSocketPluginClient({
	App,
	serverUrl: "ws://localhost:3000",
	pluginId: "solid-advanced-demo",
})
