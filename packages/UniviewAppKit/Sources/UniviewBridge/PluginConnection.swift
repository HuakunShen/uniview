import Foundation
import UniviewNativeCore
import kkrpc

/// The protocol version this host speaks. Must match `@uniview/protocol`'s
/// `PROTOCOL_VERSION` — the plugin rejects a mismatched handshake.
public let UNIVIEW_PROTOCOL_VERSION = 3

public enum PluginConnectionError: Error, Sendable {
    case invalidURL(String)
}

/// Connects this native host to a **real TS/React plugin** through the uniview
/// bridge server, so the plugin's React render output drives native AppKit views.
///
/// The Swift counterpart of the TS `createWebSocketController`:
///
///   1. open a WebSocket to `{serverUrl}/host/{pluginId}`
///   2. EXPOSE the `PluginToHostAPI` (`updateTree` / `applyMutations`) — the
///      plugin pushes each React render to us
///   3. CALL the `HostToPluginAPI` (`initialize`, `executeHandler`) — we hand user
///      interactions back, React re-renders, and the new tree comes down
///
/// The bidirectional plumbing lives in kkrpc's `RPCChannel` (one socket that both
/// serves and calls); this type only adds what is uniview-specific: the handshake,
/// the two exposed methods, and decoding the wire JSON into `CommitBatch`es — which
/// is exactly what `UniviewHost.apply` consumes. It stays AppKit-free so it can be
/// unit-tested and reused by other hosts.
public actor PluginConnection {
    public typealias CommitHandler = @Sendable (CommitBatch) async -> Void
    public typealias ErrorHandler = @Sendable (String) async -> Void

    private let url: URL
    private let transport: WebSocketTransport
    private let channel: RPCChannel
    private var revision = 0

    public init(serverUrl: String, pluginId: String) throws {
        let text = "\(serverUrl)/host/\(pluginId)"
        guard let url = URL(string: text) else { throw PluginConnectionError.invalidURL(text) }
        self.url = url
        self.transport = WebSocketTransport(url: url)
        self.channel = RPCChannel(transport: transport)
    }

    /// Wire up the plugin→host API, open the socket, and complete the handshake.
    /// `onCommit` fires for every React render the plugin pushes.
    public func connect(
        onCommit: @escaping CommitHandler,
        onError: @escaping ErrorHandler = { _ in },
        environment: UniviewNativeCore.JSONValue? = nil
    ) async throws {
        // Expose BEFORE the socket opens: the plugin pushes its first tree as soon
        // as initialize() resolves, and an unregistered method would be dropped.
        await channel.expose("updateTree") { [weak self] args in
            guard let self else { return .null }
            await self.emit([.setRoot(node: Self.decodeTree(args.first))], onCommit)
            return .null
        }

        await channel.expose("applyMutations") { [weak self] args in
            guard let self else { return .null }
            guard let raw = args.first, let mutations = try? raw.decode([Mutation].self) else {
                await onError("applyMutations: could not decode mutations")
                return .null
            }
            await self.emit(mutations, onCommit)
            return .null
        }

        await channel.expose("log") { args in
            let text = args.compactMap { $0.stringValue }.joined(separator: " ")
            FileHandle.standardError.write(Data("[plugin] \(text)\n".utf8))
            return .null
        }

        await channel.expose("reportError") { args in
            let message = args.first?.objectValue?["message"]?.stringValue ?? "unknown plugin error"
            await onError(message)
            return .null
        }

        try await transport.connect()
        await channel.start()

        // Handshake — the plugin renders and pushes its first tree in response.
        // The environment rides along so that first tree is already correct: a
        // plugin keying off `useColorScheme()` must not paint light, ship it, and
        // repaint dark a round trip later.
        var request: [String: kkrpc.JSONValue] = [
            "protocolVersion": .number(Double(UNIVIEW_PROTOCOL_VERSION))
        ]
        if let environment, let encoded = try? kkrpc.JSONValue.encoding(environment) {
            request["env"] = encoded
        }
        _ = try await channel.call("initialize", [.object(request)])
    }

    /// Tell the plugin the machine changed underneath it — the system flipped to
    /// dark, the accent color changed, the app went to the background.
    public func setEnvironment(_ environment: UniviewNativeCore.JSONValue) async {
        do {
            let encoded = try kkrpc.JSONValue.encoding(environment)
            _ = try await channel.call("setEnvironment", [encoded])
        } catch {
            FileHandle.standardError.write(Data("[bridge] setEnvironment failed: \(error)\n".utf8))
        }
    }

    /// Send a user interaction back to the plugin (button click, text change…).
    /// React updates state, re-renders, and pushes a new tree — closing the loop.
    public func executeHandler(_ handlerId: String, _ args: [UniviewNativeCore.JSONValue] = []) async {
        do {
            let encoded = try args.map { try kkrpc.JSONValue.encoding($0) }
            _ = try await channel.call("executeHandler", [.string(handlerId), .array(encoded)])
        } catch {
            FileHandle.standardError.write(Data("[bridge] executeHandler failed: \(error)\n".utf8))
        }
    }

    public func disconnect() async {
        _ = try? await channel.call("destroy")
        await channel.close()
    }

    // MARK: - Internals

    /// Stamp mutations with a revision — the shape `UniviewHost.apply` expects.
    private func emit(_ mutations: [Mutation], _ onCommit: CommitHandler) async {
        revision += 1
        await onCommit(CommitBatch(revision: revision, mutations: mutations))
    }

    /// `updateTree(tree: UINode | null)` — null means "the plugin rendered nothing".
    static func decodeTree(_ value: kkrpc.JSONValue?) -> UINode? {
        guard let value, !value.isNull else { return nil }
        return try? value.decode(UINode.self)
    }
}
