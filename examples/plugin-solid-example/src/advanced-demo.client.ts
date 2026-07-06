import { createSolidWebSocketPluginClient } from "@uniview/solid-runtime/ws-client"
import App from "./advanced-demo"

createSolidWebSocketPluginClient({
	App,
	serverUrl: "ws://127.0.0.1:3000",
	pluginId: "solid-advanced-demo",
})
