export {
	createSolidWebSocketPluginClient,
	type SolidWebSocketPluginClientOptions,
	type SolidWebSocketPluginClient,
} from "./ws-client"

import type { SolidWebSocketPluginClientOptions } from "./ws-client"
export type ConnectSolidToHostServerOptions = SolidWebSocketPluginClientOptions

export async function connectSolidToHostServer(
	opts: ConnectSolidToHostServerOptions,
): Promise<void> {
	const { createSolidWebSocketPluginClient } = await import("./ws-client")
	createSolidWebSocketPluginClient(opts)
}
