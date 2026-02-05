import SwiftUI

struct ContentView: View {
	@StateObject private var rpcClient = RPCClient()
	@State private var rootNode: UINode?
	@State private var pluginId = "simple-demo"
	@State private var showError = false
	@State private var errorMessage = ""
	
	var body: some View {
		VStack(spacing: 16) {
			// Header
			VStack(alignment: .leading, spacing: 8) {
				Text("HostMacOSDemo")
					.font(.title)
				HStack(spacing: 12) {
					statusIndicator
					Text(statusText)
						.font(.caption)
						.foregroundStyle(.secondary)
				}
			}
			.frame(maxWidth: .infinity, alignment: .leading)
			.padding()
			.background(Color(.controlBackgroundColor))
			.cornerRadius(8)
			
			// Plugin ID input
			HStack(spacing: 12) {
				Text("Plugin ID:")
					.frame(width: 80, alignment: .trailing)
				TextField("Plugin ID", text: $pluginId)
					.textFieldStyle(.roundedBorder)
					.disabled(rpcClient.state != .disconnected)
			}
			.padding(.horizontal)
			
			// Control buttons
			HStack(spacing: 12) {
				if rpcClient.state == .disconnected {
					Button(action: connectToPlugin) {
						Label("Connect", systemImage: "link")
					}
					.keyboardShortcut(.defaultAction)
				} else {
					Button(action: disconnect) {
						Label("Disconnect", systemImage: "xmark.circle")
					}
					.keyboardShortcut(.cancelAction)
				}
				
				Spacer()
			}
			.padding(.horizontal)
			
			// Plugin UI or placeholder
			if let rootNode = rootNode {
				ScrollView {
					UINodeView(node: rootNode) { handlerId, args in
						Task {
							try? await rpcClient.executeHandler(handlerId: handlerId, args: args)
						}
					}
					.padding()
				}
				.frame(maxWidth: .infinity, maxHeight: .infinity)
				.background(Color(.controlBackgroundColor))
				.cornerRadius(8)
			} else if rpcClient.state == .initialized {
				VStack {
					ProgressView()
						.scaleEffect(1.5)
					Text("Waiting for plugin UI...")
						.foregroundStyle(.secondary)
				}
				.frame(maxWidth: .infinity, maxHeight: .infinity)
				.background(Color(.controlBackgroundColor))
				.cornerRadius(8)
			} else {
				VStack(spacing: 12) {
					Image(systemName: "bolt.slash")
						.font(.system(size: 48))
						.foregroundStyle(.secondary)
					Text("Not connected")
						.font(.headline)
					Text("Click Connect to load a plugin")
						.font(.caption)
						.foregroundStyle(.secondary)
				}
				.frame(maxWidth: .infinity, maxHeight: .infinity)
				.background(Color(.controlBackgroundColor))
				.cornerRadius(8)
			}
		}
		.padding()
		.frame(minWidth: 500, minHeight: 400)
		.task {
			setupRPCCallbacks()
		}
		.alert("Connection Error", isPresented: $showError) {
			Button("OK") { showError = false }
		} message: {
			Text(errorMessage)
		}
	}
	
	// MARK: - Status Indicator
	
	@ViewBuilder
	private var statusIndicator: some View {
		Circle()
			.fill(statusColor)
			.frame(width: 8, height: 8)
	}
	
	private var statusColor: Color {
		switch rpcClient.state {
		case .disconnected:
			return .gray
		case .connecting:
			return .yellow
		case .connected:
			return .blue
		case .initialized:
			return .green
		}
	}
	
	private var statusText: String {
		switch rpcClient.state {
		case .disconnected:
			return "Disconnected"
		case .connecting:
			return "Connecting..."
		case .connected:
			return "Connected (initializing...)"
		case .initialized:
			return "Connected & Initialized"
		}
	}
	
	// MARK: - Connection Methods
	
	private func setupRPCCallbacks() {
		rpcClient.onUpdateTree = { [weak rpcClient] tree in
			DispatchQueue.main.async {
				self.rootNode = tree
			}
		}
		
		rpcClient.onError = { [weak rpcClient] message, stack in
			DispatchQueue.main.async {
				self.errorMessage = message
				if let stack = stack {
					self.errorMessage += "\n\n\(stack)"
				}
				self.showError = true
			}
		}
		
		rpcClient.onLog = { level, message in
			print("[\(level)] \(message)")
		}
	}
	
	private func connectToPlugin() {
		Task {
			do {
				try await rpcClient.connect(pluginId: pluginId)
				try await rpcClient.initialize()
			} catch {
				errorMessage = error.localizedDescription
				showError = true
			}
		}
	}
	
	private func disconnect() {
		rpcClient.disconnect()
		rootNode = nil
	}
}

#Preview {
	ContentView()
}
