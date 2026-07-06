import { createSolidWebSocketPluginClient } from "@uniview/solid-runtime/ws-client"
import App from "./simple-demo"

createSolidWebSocketPluginClient({
	App,
	serverUrl: "ws://127.0.0.1:3000",
	pluginId: "solid-simple-demo",
})
