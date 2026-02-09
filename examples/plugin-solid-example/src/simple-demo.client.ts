import { createSolidWebSocketPluginClient } from "@uniview/solid-runtime/ws-client"
import App from "./simple-demo"

createSolidWebSocketPluginClient({
	App,
	serverUrl: "ws://localhost:3000",
	pluginId: "solid-simple-demo",
})
