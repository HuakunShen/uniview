import Foundation

// MARK: - RPCClientError

enum RPCClientError: Error, LocalizedError {
    case notConnected
    case initializeFailed(String)
    case invalidResponse
    case requestFailed(RPCError)
    case timeout
    case encodingFailed
    case decodingFailed(Error)
    
    var errorDescription: String? {
        switch self {
        case .notConnected:
            return "RPC client is not connected"
        case .initializeFailed(let reason):
            return "Initialization failed: \(reason)"
        case .invalidResponse:
            return "Invalid response from plugin"
        case .requestFailed(let error):
            return "RPC request failed: \(error.message)"
        case .timeout:
            return "Request timed out"
        case .encodingFailed:
            return "Failed to encode message"
        case .decodingFailed(let error):
            return "Failed to decode message: \(error.localizedDescription)"
        }
    }
}

// MARK: - RPCClientState

enum RPCClientState {
    case disconnected
    case connecting
    case connected
    case initialized
}

// MARK: - PendingRequest

/// Tracks a pending RPC request awaiting response
private struct PendingRequest {
    let id: String
    let method: String
    let continuation: CheckedContinuation<JSONValue?, Error>
    let timestamp: Date
}

// MARK: - RPCClient

/// High-level RPC client that wraps WebSocketClient and handles kkrpc protocol messages
/// Implements the host side of the uniview protocol
@MainActor
class RPCClient: ObservableObject {
    
    // MARK: - Properties
    
    private let webSocketClient = WebSocketClient()
    private var pendingRequests: [String: PendingRequest] = [:]
    private let requestTimeout: TimeInterval = 30.0
    
    /// Current plugin ID
    private(set) var pluginId: String?
    
    /// Protocol version for kkrpc communication
    private let protocolVersion = 1
    
    /// Base URL for the bridge server
    var bridgeServerURL: String = "ws://localhost:3000"
    
    // MARK: - Published State
    
    @Published private(set) var state: RPCClientState = .disconnected
    @Published private(set) var lastError: Error?
    
    // MARK: - Callbacks
    
    /// Called when plugin sends a tree update
    var onUpdateTree: ((UINode) -> Void)?
    
    /// Called when plugin sends a log message
    var onLog: ((String, String) -> Void)? // (level, message)
    
    /// Called when plugin reports an error
    var onError: ((String, String?) -> Void)? // (message, stack)
    
    /// Called when connection state changes
    var onStateChange: ((RPCClientState) -> Void)?
    
    // MARK: - Initialization
    
    init() {
        setupWebSocketCallbacks()
    }
    
    // MARK: - Connection
    
    /// Connect to the bridge server for a specific plugin
    /// - Parameter pluginId: The plugin identifier to connect to
    func connect(pluginId: String) async throws {
        guard state == .disconnected else {
            return
        }
        
        self.pluginId = pluginId
        updateState(.connecting)
        
        let urlString = "\(bridgeServerURL)/host/\(pluginId)"
        
        do {
            try await webSocketClient.connect(urlString: urlString)
            updateState(.connected)
        } catch {
            updateState(.disconnected)
            lastError = error
            throw error
        }
    }
    
    /// Disconnect from the bridge server
    func disconnect() {
        webSocketClient.disconnect()
        pendingRequests.removeAll()
        pluginId = nil
        updateState(.disconnected)
    }
    
    // MARK: - Protocol Methods
    
    /// Initialize the plugin connection with protocol version handshake
    func initialize() async throws {
        guard state == .connected else {
            throw RPCClientError.notConnected
        }
        
        let args: [JSONValue] = [
            .object(["protocolVersion": .number(Double(protocolVersion))])
        ]
        
        do {
            _ = try await sendRequest(method: "initialize", args: args)
            updateState(.initialized)
        } catch let error as RPCClientError {
            throw error
        } catch {
            throw RPCClientError.initializeFailed(error.localizedDescription)
        }
    }
    
    /// Execute a handler in the plugin
    /// - Parameters:
    ///   - handlerId: The handler ID to invoke (e.g., from _onClickHandlerId prop)
    ///   - args: Arguments to pass to the handler
    /// - Returns: The result from the handler, if any
    @discardableResult
    func executeHandler(handlerId: String, args: [JSONValue] = []) async throws -> JSONValue? {
        guard state == .initialized else {
            throw RPCClientError.notConnected
        }

        let requestArgs: [JSONValue] = [
            .string(handlerId),
            .array(args),
        ]
        
        return try await sendRequest(method: "executeHandler", args: requestArgs)
    }
    
    // MARK: - Private Methods
    
    private func setupWebSocketCallbacks() {
        webSocketClient.onMessage = { [weak self] message in
            Task { @MainActor in
                self?.handleMessage(message)
            }
        }
        
        webSocketClient.onStateChange = { [weak self] wsState in
            Task { @MainActor in
                self?.handleWebSocketStateChange(wsState)
            }
        }
        
        webSocketClient.onError = { [weak self] error in
            Task { @MainActor in
                self?.lastError = error
            }
        }
    }
    
    private func handleWebSocketStateChange(_ wsState: WebSocketClientState) {
        switch wsState {
        case .disconnected:
            // Clear pending requests on disconnect
            for (_, request) in pendingRequests {
                request.continuation.resume(throwing: RPCClientError.notConnected)
            }
            pendingRequests.removeAll()
            updateState(.disconnected)
            
        case .connecting:
            updateState(.connecting)
            
        case .connected:
            updateState(.connected)
            
        case .disconnecting:
            break
        }
    }
    
    private func handleMessage(_ messageString: String) {
        do {
            let message = try MessageParser.parseMessage(messageString)
            
            switch message.type {
            case .response:
                handleResponse(message)
                
            case .request:
                handleRequest(message)
                
            case .callback:
                // Callbacks from plugin (updateTree, log, reportError)
                handlePluginCallback(message)
                
            default:
                // Ignore other message types
                break
            }
        } catch {
            lastError = RPCClientError.decodingFailed(error)
        }
    }
    
    private func handleResponse(_ message: RPCMessage) {
        guard let pending = pendingRequests.removeValue(forKey: message.id) else {
            return
        }

        guard let args = message.args?.objectValue else {
            pending.continuation.resume(throwing: RPCClientError.invalidResponse)
            return
        }

        if let errorValue = args["error"], !errorValue.isNull {
            let errorMessage = errorValue.objectValue?["message"]?.stringValue ?? "Unknown error"
            pending.continuation.resume(throwing: RPCClientError.requestFailed(RPCError(name: "Error", message: errorMessage)))
            return
        }

        let result = args["result"]
        pending.continuation.resume(returning: result)
    }
    
    private func handleRequest(_ message: RPCMessage) {
        // Plugin is calling a method on the host
        guard let method = message.method else { return }
        
        switch method {
        case "updateTree":
            handleUpdateTree(message)
            
        case "log":
            handleLog(message)
            
        case "reportError":
            handleReportError(message)
            
        default:
            // Unknown method - send error response
            sendErrorResponse(for: message, error: "Unknown method: \(method)")
        }
    }
    
    private func handlePluginCallback(_ message: RPCMessage) {
        // Plugin callbacks use method field for the callback name
        guard let method = message.method else { return }
        
        switch method {
        case "updateTree":
            handleUpdateTree(message)
            
        case "log":
            handleLog(message)
            
        case "reportError":
            handleReportError(message)
            
        default:
            break
        }
    }
    
    private func handleUpdateTree(_ message: RPCMessage) {
        guard let argsArray = message.args?.arrayValue,
              let treeArg = argsArray.first else {
            return
        }
        
        // Decode UINode from JSONValue
        do {
            let encoder = JSONEncoder()
            let decoder = JSONDecoder()
            
            let treeData = try encoder.encode(treeArg)
            let tree = try decoder.decode(UINode.self, from: treeData)
            
            onUpdateTree?(tree)
            
            // Send acknowledgment response
            sendSuccessResponse(for: message)
        } catch {
            lastError = RPCClientError.decodingFailed(error)
            sendErrorResponse(for: message, error: "Failed to decode tree: \(error.localizedDescription)")
        }
    }
    
    private func handleLog(_ message: RPCMessage) {
        guard let args = message.args?.arrayValue,
              args.count >= 2,
              let level = args[0].stringValue,
              let logMessage = args[1].stringValue else {
            return
        }
        
        onLog?(level, logMessage)
        sendSuccessResponse(for: message)
    }
    
    private func handleReportError(_ message: RPCMessage) {
        guard let args = message.args?.arrayValue,
              let errorArg = args.first else {
            return
        }
        
        let errorMessage: String
        let errorStack: String?
        
        if let errorObj = errorArg.objectValue {
            errorMessage = errorObj["message"]?.stringValue ?? "Unknown error"
            errorStack = errorObj["stack"]?.stringValue
        } else if let msg = errorArg.stringValue {
            errorMessage = msg
            errorStack = nil
        } else {
            errorMessage = "Unknown error"
            errorStack = nil
        }
        
        onError?(errorMessage, errorStack)
        sendSuccessResponse(for: message)
    }
    
    private func sendSuccessResponse(for message: RPCMessage) {
        let response = RPCMessage.response(id: message.id, result: .object(["success": .bool(true)]))
        sendMessage(response)
    }

    private func sendErrorResponse(for message: RPCMessage, error: String) {
        let rpcError = RPCError(name: "Error", message: error)
        let response = RPCMessage.response(id: message.id, result: nil, error: rpcError)
        sendMessage(response)
    }
    
    private func sendMessage(_ message: RPCMessage) {
        Task {
            do {
                let messageString = try MessageParser.serializeMessageToString(message)
                try await webSocketClient.send(message: messageString)
            } catch {
                self.lastError = error
            }
        }
    }
    
    private func sendRequest(method: String, args: [JSONValue]) async throws -> JSONValue? {
        guard state == .connected || state == .initialized else {
            throw RPCClientError.notConnected
        }
        
        let messageId = MessageParser.generateMessageId()
        let message = RPCMessage.request(id: messageId, method: method, args: args)
        
        return try await withCheckedThrowingContinuation { continuation in
            let pending = PendingRequest(
                id: messageId,
                method: method,
                continuation: continuation,
                timestamp: Date()
            )
            pendingRequests[messageId] = pending
            
            Task {
                do {
                    let messageString = try MessageParser.serializeMessageToString(message)
                    try await webSocketClient.send(message: messageString)
                    
                    // Set up timeout
                    Task {
                        try? await Task.sleep(nanoseconds: UInt64(requestTimeout * 1_000_000_000))
                        if let pending = pendingRequests.removeValue(forKey: messageId) {
                            pending.continuation.resume(throwing: RPCClientError.timeout)
                        }
                    }
                } catch {
                    pendingRequests.removeValue(forKey: messageId)
                    continuation.resume(throwing: RPCClientError.encodingFailed)
                }
            }
        }
    }
    
    private func updateState(_ newState: RPCClientState) {
        guard state != newState else { return }
        state = newState
        onStateChange?(newState)
    }
}
