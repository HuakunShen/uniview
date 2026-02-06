import Foundation

// MARK: - WebSocketClientError

enum WebSocketClientError: Error, LocalizedError {
    case notConnected
    case invalidURL
    case connectionFailed(Error)
    case sendFailed(Error)
    case receiveFailed(Error)
    case alreadyConnected
    
    var errorDescription: String? {
        switch self {
        case .notConnected:
            return "WebSocket is not connected"
        case .invalidURL:
            return "Invalid WebSocket URL"
        case .connectionFailed(let error):
            return "Connection failed: \(error.localizedDescription)"
        case .sendFailed(let error):
            return "Send failed: \(error.localizedDescription)"
        case .receiveFailed(let error):
            return "Receive failed: \(error.localizedDescription)"
        case .alreadyConnected:
            return "WebSocket is already connected"
        }
    }
}

// MARK: - WebSocketClientState

enum WebSocketClientState {
    case disconnected
    case connecting
    case connected
    case disconnecting
}

// MARK: - WebSocketClientDelegate

protocol WebSocketClientDelegate: AnyObject {
    func webSocketClient(_ client: WebSocketClient, didReceiveMessage message: String)
    func webSocketClient(_ client: WebSocketClient, didReceiveData data: Data)
    func webSocketClientDidConnect(_ client: WebSocketClient)
    func webSocketClientDidDisconnect(_ client: WebSocketClient, error: Error?)
}

// MARK: - WebSocketClient

/// WebSocket client using URLSessionWebSocketTask
/// Connects to uniview bridge server and handles kkrpc message transport
class WebSocketClient: NSObject {
    
    // MARK: - Properties
    
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var pingTimer: Timer?
    
    private(set) var state: WebSocketClientState = .disconnected
    private(set) var currentURL: URL?
    
    /// Callback for received string messages
    var onMessage: ((String) -> Void)?
    
    /// Callback for received data messages
    var onData: ((Data) -> Void)?
    
    /// Callback for connection state changes
    var onStateChange: ((WebSocketClientState) -> Void)?
    
    /// Callback for errors
    var onError: ((Error) -> Void)?
    
    /// Delegate for WebSocket events
    weak var delegate: WebSocketClientDelegate?
    
    /// Ping interval in seconds (0 to disable)
    var pingInterval: TimeInterval = 30.0
    
    /// Message parser for buffering partial messages
    private let messageParser = MessageParser()
    
    // MARK: - Initialization
    
    override init() {
        super.init()
    }
    
    deinit {
        disconnect()
    }
    
    // MARK: - Connection
    
    /// Connect to a WebSocket URL
    /// - Parameter url: The WebSocket URL to connect to (e.g., ws://localhost:3000/host/my-plugin)
    func connect(url: URL) async throws {
        guard state == .disconnected else {
            throw WebSocketClientError.alreadyConnected
        }
        
        updateState(.connecting)
        currentURL = url
        
        // Create URL session with delegate
        let configuration = URLSessionConfiguration.default
        urlSession = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        
        // Create WebSocket task
        guard let session = urlSession else {
            updateState(.disconnected)
            throw WebSocketClientError.connectionFailed(NSError(domain: "WebSocketClient", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create URL session"]))
        }
        
        webSocketTask = session.webSocketTask(with: url)
        webSocketTask?.resume()
        
        // Start receiving messages
        receiveMessages()
        
        // Start ping timer for keepalive
        startPingTimer()
        
        updateState(.connected)
        delegate?.webSocketClientDidConnect(self)
    }
    
    /// Connect to a WebSocket URL string
    /// - Parameter urlString: The WebSocket URL string
    func connect(urlString: String) async throws {
        guard let url = URL(string: urlString) else {
            throw WebSocketClientError.invalidURL
        }
        try await connect(url: url)
    }
    
    /// Disconnect from the WebSocket
    func disconnect() {
        guard state == .connected || state == .connecting else { return }
        
        updateState(.disconnecting)
        
        stopPingTimer()
        
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        
        urlSession?.invalidateAndCancel()
        urlSession = nil
        
        messageParser.clearBuffer()
        
        updateState(.disconnected)
        delegate?.webSocketClientDidDisconnect(self, error: nil)
    }
    
    // MARK: - Sending Messages
    
    /// Send a string message
    /// - Parameter message: The message to send
    func send(message: String) async throws {
        guard state == .connected, let task = webSocketTask else {
            throw WebSocketClientError.notConnected
        }
        
        do {
            try await task.send(.string(message))
        } catch {
            throw WebSocketClientError.sendFailed(error)
        }
    }
    
    /// Send data
    /// - Parameter data: The data to send
    func send(data: Data) async throws {
        guard state == .connected, let task = webSocketTask else {
            throw WebSocketClientError.notConnected
        }
        
        do {
            try await task.send(.data(data))
        } catch {
            throw WebSocketClientError.sendFailed(error)
        }
    }
    
    /// Send a message with newline terminator (kkrpc protocol)
    /// - Parameter message: The message to send (newline will be appended if not present)
    func sendLine(_ message: String) async throws {
        var messageWithNewline = message
        if !message.hasSuffix("\n") {
            messageWithNewline.append("\n")
        }
        try await send(message: messageWithNewline)
    }
    
    // MARK: - Receiving Messages
    
    private func receiveMessages() {
        guard let task = webSocketTask else { return }
        
        task.receive { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let message):
                self.handleReceivedMessage(message)
                // Continue receiving if still connected
                if self.state == .connected {
                    self.receiveMessages()
                }
                
            case .failure(let error):
                // Check if this is a cancellation (normal disconnect)
                if (error as NSError).code != 57 { // Socket not connected error during shutdown
                    self.handleError(WebSocketClientError.receiveFailed(error))
                }
                self.handleDisconnection(error: error)
            }
        }
    }
    
    private func handleReceivedMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .string(let text):
            // Process through message parser for newline-delimited messages
            let completeMessages = messageParser.processString(text)
            for msg in completeMessages {
                onMessage?(msg)
                delegate?.webSocketClient(self, didReceiveMessage: msg)
            }
            
        case .data(let data):
            // Process data through parser if it's text
            let completeMessages = messageParser.processData(data)
            for msg in completeMessages {
                onMessage?(msg)
                delegate?.webSocketClient(self, didReceiveMessage: msg)
            }
            // Also pass raw data to delegate
            onData?(data)
            delegate?.webSocketClient(self, didReceiveData: data)
            
        @unknown default:
            break
        }
    }
    
    // MARK: - Ping/Pong Keepalive
    
    private func startPingTimer() {
        guard pingInterval > 0 else { return }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.pingTimer = Timer.scheduledTimer(withTimeInterval: self.pingInterval, repeats: true) { [weak self] _ in
                self?.sendPing()
            }
        }
    }
    
    private func stopPingTimer() {
        pingTimer?.invalidate()
        pingTimer = nil
    }
    
    private func sendPing() {
        guard state == .connected else { return }
        
        webSocketTask?.sendPing { [weak self] error in
            if let error = error {
                self?.handleError(error)
            }
        }
    }
    
    // MARK: - State Management
    
    private func updateState(_ newState: WebSocketClientState) {
        guard state != newState else { return }
        state = newState
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.onStateChange?(newState)
        }
    }
    
    // MARK: - Error Handling
    
    private func handleError(_ error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.onError?(error)
        }
    }
    
    private func handleDisconnection(error: Error?) {
        guard state != .disconnected && state != .disconnecting else { return }
        
        stopPingTimer()
        webSocketTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
        messageParser.clearBuffer()
        
        updateState(.disconnected)
        delegate?.webSocketClientDidDisconnect(self, error: error)
    }
}

// MARK: - URLSessionWebSocketDelegate

extension WebSocketClient: URLSessionWebSocketDelegate {
    
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        updateState(.connected)
        delegate?.webSocketClientDidConnect(self)
    }
    
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        handleDisconnection(error: nil)
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            handleError(error)
            handleDisconnection(error: error)
        }
    }
}
