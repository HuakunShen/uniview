import type { Component } from "solid-js"
import { createRoot } from "solid-js"
import { ElysiaWebSocketClientIO, RPCChannel } from "kkrpc"
import type {
	JSONValue,
	UINode,
	HostToPluginAPI,
	PluginToHostAPI,
	UpdateMode,
	Mutation,
} from "@uniview/protocol"
import {
	render,
	setUpdateCallback,
	setMutationUpdateCallback,
	setMutationCollector,
	setRootNode,
	getRootNode,
	serializeTree,
	HandlerRegistry,
	resetIdCounter,
	SolidMutationCollector,
	type SolidNode,
} from "@uniview/solid-renderer"

// Stats tracking for benchmarks
interface Stats {
	bytesSent: number
	messagesSent: number
}

declare global {
	// eslint-disable-next-line no-var
	var __uniview_stats: Stats | undefined
}

export interface SolidWebSocketPluginClientOptions {
	App: Component<Record<string, unknown>>
	serverUrl: string
	pluginId: string
	/** Update mode: "full" sends entire tree, "incremental" sends mutations */
	mode?: UpdateMode
	/** Reconnection delay in ms (default: 1000) */
	reconnectDelay?: number
	/** Max reconnection attempts (default: Infinity) */
	maxReconnectAttempts?: number
}

export interface SolidWebSocketPluginClient {
	close(): Promise<void>
}

/**
 * Creates a WebSocket plugin client with automatic reconnection.
 *
 * Unlike Worker mode, WebSocket plugin clients are long-running processes
 * that need to handle connection drops gracefully. This implementation:
 *
 * 1. Connects to the bridge server
 * 2. Waits for host to connect and call initialize()
 * 3. If connection drops, automatically reconnects
 * 4. State resets on each new connection (host re-initializes)
 */
export function createSolidWebSocketPluginClient(
	opts: SolidWebSocketPluginClientOptions,
): SolidWebSocketPluginClient {
	const {
		App,
		serverUrl,
		pluginId,
		mode = "full",
		reconnectDelay = 1000,
		maxReconnectAttempts = Infinity,
	} = opts

	// Stats tracking
	const stats: Stats = { bytesSent: 0, messagesSent: 0 }
	globalThis.__uniview_stats = stats

	const wsUrl = `${serverUrl}/plugins/${pluginId}`
	let closed = false
	let reconnectAttempts = 0
	let currentIo: ElysiaWebSocketClientIO | null = null
	let currentRpc: RPCChannel<
		HostToPluginAPI,
		PluginToHostAPI,
		ElysiaWebSocketClientIO
	> | null = null

	let disposeRoot: (() => void) | null = null
	let handlerRegistry: HandlerRegistry | null = null
	let mutationCollector: SolidMutationCollector | null = null

	function resetRuntimeState() {
		if (disposeRoot) {
			disposeRoot()
			disposeRoot = null
		}
		setMutationCollector(null)
		mutationCollector = null
		handlerRegistry?.clear()
		handlerRegistry = null
		setRootNode(null)
	}

	function createPluginAPI(): HostToPluginAPI {
		return {
			async initialize(req) {
				resetRuntimeState()

				handlerRegistry = new HandlerRegistry()
				resetIdCounter()

				const rootNode: SolidNode = {
					_type: "element",
					id: "root",
					type: "div",
					props: {},
					children: [],
					parent: null,
				}
				setRootNode(rootNode)

				if (mode === "incremental") {
					// Set up mutation collection
					mutationCollector = new SolidMutationCollector(handlerRegistry)
					setMutationCollector(mutationCollector)

					setMutationUpdateCallback((mutations: Mutation[]) => {
						if (!currentRpc) return

						// Track stats
						const bytes = JSON.stringify(mutations).length
						stats.bytesSent += bytes
						stats.messagesSent++

						currentRpc.getAPI().applyMutations(mutations)
					})

					// Also send full tree for initial render
					setUpdateCallback(() => {
						if (!handlerRegistry || !currentRpc) return

						const currentRoot = getRootNode()
						if (!currentRoot || currentRoot.children.length === 0) return

						// Don't clear handler registry in incremental mode

						const serializedTree = serializeTree(
							currentRoot.children[0],
							handlerRegistry,
						) as UINode | null

						// Track stats
						const bytes = JSON.stringify(serializedTree).length
						stats.bytesSent += bytes
						stats.messagesSent++

						currentRpc.getAPI().updateTree(serializedTree)
					})
				} else {
					// Full tree mode (default)
					setUpdateCallback(() => {
						if (!handlerRegistry || !currentRpc) return

						const currentRoot = getRootNode()
						if (!currentRoot || currentRoot.children.length === 0) return

						handlerRegistry.clear()

						const serializedTree = serializeTree(
							currentRoot.children[0],
							handlerRegistry,
						) as UINode | null

						// Track stats
						const bytes = JSON.stringify(serializedTree).length
						stats.bytesSent += bytes
						stats.messagesSent++

						currentRpc.getAPI().updateTree(serializedTree)
					})
				}

				disposeRoot = createRoot((dispose) => {
					render(
						() => App((req.props ?? {}) as Record<string, unknown>),
						rootNode,
					)
					return dispose
				})
			},

			async updateProps(props: JSONValue) {
				resetRuntimeState()

				handlerRegistry = new HandlerRegistry()
				resetIdCounter()

				const rootNode: SolidNode = {
					_type: "element",
					id: "root",
					type: "div",
					props: {},
					children: [],
					parent: null,
				}
				setRootNode(rootNode)

				if (mode === "incremental") {
					// Set up mutation collection
					mutationCollector = new SolidMutationCollector(handlerRegistry)
					setMutationCollector(mutationCollector)

					setMutationUpdateCallback((mutations: Mutation[]) => {
						if (!currentRpc) return

						// Track stats
						const bytes = JSON.stringify(mutations).length
						stats.bytesSent += bytes
						stats.messagesSent++

						currentRpc.getAPI().applyMutations(mutations)
					})

					// Also send full tree for initial render
					setUpdateCallback(() => {
						if (!handlerRegistry || !currentRpc) return

						const currentRoot = getRootNode()
						if (!currentRoot || currentRoot.children.length === 0) return

						// Don't clear handler registry in incremental mode

						const serializedTree = serializeTree(
							currentRoot.children[0],
							handlerRegistry,
						) as UINode | null

						// Track stats
						const bytes = JSON.stringify(serializedTree).length
						stats.bytesSent += bytes
						stats.messagesSent++

						currentRpc.getAPI().updateTree(serializedTree)
					})
				} else {
					// Full tree mode (default)
					setUpdateCallback(() => {
						if (!handlerRegistry || !currentRpc) return

						const currentRoot = getRootNode()
						if (!currentRoot || currentRoot.children.length === 0) return

						handlerRegistry.clear()

						const serializedTree = serializeTree(
							currentRoot.children[0],
							handlerRegistry,
						) as UINode | null

						// Track stats
						const bytes = JSON.stringify(serializedTree).length
						stats.bytesSent += bytes
						stats.messagesSent++

						currentRpc.getAPI().updateTree(serializedTree)
					})
				}

				disposeRoot = createRoot((dispose) => {
					render(
						() => App((props ?? {}) as Record<string, unknown>),
						rootNode,
					)
					return dispose
				})
			},

			async executeHandler(handlerId, args) {
				if (!handlerRegistry) return
				await handlerRegistry.execute(handlerId, ...args)
			},

			async destroy() {
				resetRuntimeState()
			},
		}
	}

	function connect() {
		if (closed) return

		console.log(`[Plugin:${pluginId}] Connecting to ${wsUrl}...`)

		const io = new ElysiaWebSocketClientIO(wsUrl)
		currentIo = io

		const ws = (io as unknown as { ws: WebSocket }).ws

		ws.addEventListener("open", () => {
			console.log(`[Plugin:${pluginId}] Connected to bridge`)
			reconnectAttempts = 0
		})

		ws.addEventListener("close", (event) => {
			if (closed) return

			console.log(
				`[Plugin:${pluginId}] Connection closed (code: ${event.code}, reason: ${event.reason || "none"})`,
			)
			resetRuntimeState()
			currentIo = null
			currentRpc = null

			if (reconnectAttempts < maxReconnectAttempts) {
				reconnectAttempts++
				console.log(
					`[Plugin:${pluginId}] Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttempts})...`,
				)
				setTimeout(connect, reconnectDelay)
			} else {
				console.log(
					`[Plugin:${pluginId}] Max reconnection attempts reached, giving up`,
				)
			}
		})

		ws.addEventListener("error", (error) => {
			console.error(`[Plugin:${pluginId}] WebSocket error:`, error)
		})

		currentRpc = new RPCChannel<
			HostToPluginAPI,
			PluginToHostAPI,
			ElysiaWebSocketClientIO
		>(io, { expose: createPluginAPI() })
	}

	connect()

	return {
		close: () =>
			new Promise((resolve) => {
				closed = true
				resetRuntimeState()
				currentIo?.destroy()
				currentIo = null
				currentRpc = null
				resolve()
			}),
	}
}
