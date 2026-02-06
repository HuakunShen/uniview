import Foundation

// MARK: - RPCMessageType

/// The type of RPC message
enum RPCMessageType: String, Codable {
    case request
    case response
    case callback
    case get
    case set
    case construct
}

// MARK: - RPCMessage

/// RPC message structure matching kkrpc Message interface
struct RPCMessage: Codable {
    /// Unique message identifier
    let id: String
    
    /// Method name being called (for requests)
    let method: String?
    
	/// Arguments for the method call
	/// - Requests: JSON array
	/// - Responses: JSON object with { result, error }
	let args: JSONValue?
    
    /// Message type: request, response, callback, get, set, construct
    let type: RPCMessageType
    
    /// Serialization version: "json" or "superjson"
    let version: String?
    
    /// Callback IDs for functions passed as arguments
    let callbackIds: [String]?
    
    /// Property path for get/set operations
    let path: [String]?
    
    /// Value for set operations
    let value: JSONValue?
    
    enum CodingKeys: String, CodingKey {
        case id
        case method
        case args
        case type
        case version
        case callbackIds
        case path
        case value
    }
    
    init(
        id: String,
        method: String? = nil,
		args: JSONValue? = nil,
        type: RPCMessageType,
        version: String? = nil,
        callbackIds: [String]? = nil,
        path: [String]? = nil,
        value: JSONValue? = nil
    ) {
        self.id = id
        self.method = method
        self.args = args
        self.type = type
        self.version = version
        self.callbackIds = callbackIds
        self.path = path
        self.value = value
    }
}

// MARK: - RPCResponse

/// Response payload for RPC calls
struct RPCResponse: Codable {
    /// Result value on success
    let result: JSONValue?
    
    /// Error information on failure
    let error: RPCError?
    
    init(result: JSONValue? = nil, error: RPCError? = nil) {
        self.result = result
        self.error = error
    }
}

// MARK: - RPCError

/// Enhanced error structure for RPC error responses
struct RPCError: Codable {
    let name: String
    let message: String
    let stack: String?
    let cause: JSONValue?
    
    init(name: String, message: String, stack: String? = nil, cause: JSONValue? = nil) {
        self.name = name
        self.message = message
        self.stack = stack
        self.cause = cause
    }
}

// MARK: - RPCMessage Extensions

extension RPCMessage {
    /// Create a request message
	static func request(
		id: String,
		method: String,
		args: [JSONValue] = [],
		callbackIds: [String]? = nil
	) -> RPCMessage {
		RPCMessage(
			id: id,
			method: method,
			args: .array(args),
			type: .request,
			version: "superjson",
			callbackIds: callbackIds
		)
	}

	/// Create a response message
	static func response(id: String, result: JSONValue?, error: RPCError? = nil) -> RPCMessage {
		var payload: [String: JSONValue] = [:]
		if let error {
			payload["error"] = RPCMessage.encodeError(error)
		} else {
			payload["result"] = result ?? .null
		}
		return RPCMessage(
			id: id,
			args: .object(payload),
			type: .response,
			version: "superjson"
		)
	}

	/// Create a callback invocation message
	static func callback(id: String, callbackId: String, args: [JSONValue]) -> RPCMessage {
		RPCMessage(
			id: id,
			method: callbackId,
			args: .array(args),
			type: .callback,
			version: "superjson"
		)
	}

	private static func encodeError(_ error: RPCError) -> JSONValue {
		var payload: [String: JSONValue] = [
			"name": .string(error.name),
			"message": .string(error.message)
		]
		if let stack = error.stack {
			payload["stack"] = .string(stack)
		}
		if let cause = error.cause {
			payload["cause"] = cause
		}
		return .object(payload)
	}
}
