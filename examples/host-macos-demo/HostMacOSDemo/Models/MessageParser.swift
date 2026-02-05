import Foundation

// MARK: - MessageParserError

enum MessageParserError: Error {
    case invalidData
    case invalidJSON
    case missingSuperjsonPayload
    case decodingFailed(Error)
    case encodingFailed(Error)
}

// MARK: - SuperjsonWrapper

/// Wrapper for superjson format: {"json": <payload>, "meta": {...}}
private struct SuperjsonWrapper: Codable {
    let json: RPCMessage
    let meta: JSONValue?
}

// MARK: - MessageParser

/// Handles parsing and serialization of RPC messages
/// Supports both plain JSON and superjson formats
class MessageParser {
    
    /// Superjson format prefix
    private static let superjsonPrefix = "{\"json\":"
    
    // MARK: - Parsing
    
    /// Parse raw data into an RPCMessage
    /// Automatically detects superjson format (starts with {"json":)
    static func parseMessage(_ data: Data) throws -> RPCMessage {
        guard let messageString = String(data: data, encoding: .utf8) else {
            throw MessageParserError.invalidData
        }
        
        return try parseMessage(messageString)
    }
    
    /// Parse a string into an RPCMessage
    /// Automatically detects superjson format (starts with {"json":)
    static func parseMessage(_ string: String) throws -> RPCMessage {
        // Trim whitespace and newlines
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        
        guard !trimmed.isEmpty else {
            throw MessageParserError.invalidData
        }
        
        let decoder = JSONDecoder()
        
        // Check if this is superjson format
        if trimmed.hasPrefix(superjsonPrefix) {
            // Superjson format: extract the "json" field
            guard let jsonData = trimmed.data(using: .utf8) else {
                throw MessageParserError.invalidData
            }
            
            do {
                let wrapper = try decoder.decode(SuperjsonWrapper.self, from: jsonData)
                return wrapper.json
            } catch {
                throw MessageParserError.decodingFailed(error)
            }
        } else {
            // Plain JSON format
            guard let jsonData = trimmed.data(using: .utf8) else {
                throw MessageParserError.invalidData
            }
            
            do {
                return try decoder.decode(RPCMessage.self, from: jsonData)
            } catch {
                throw MessageParserError.decodingFailed(error)
            }
        }
    }
    
    // MARK: - Serialization
    
    /// Serialize an RPCMessage to Data with newline terminator
    /// Uses superjson format by default
    static func serializeMessage(_ message: RPCMessage, useSuperjson: Bool = true) throws -> Data {
        let string = try serializeMessageToString(message, useSuperjson: useSuperjson)
        
        guard let data = string.data(using: .utf8) else {
            throw MessageParserError.encodingFailed(NSError(domain: "MessageParser", code: -1))
        }
        
        return data
    }
    
    /// Serialize an RPCMessage to String with newline terminator
    /// Uses superjson format by default
    static func serializeMessageToString(_ message: RPCMessage, useSuperjson: Bool = true) throws -> String {
        let encoder = JSONEncoder()
        // Don't add extra whitespace for compact wire format
        encoder.outputFormatting = []
        
        do {
            let jsonData: Data
            
            if useSuperjson {
                // Wrap in superjson format
                let wrapper = SuperjsonWrapper(json: message, meta: nil)
                jsonData = try encoder.encode(wrapper)
            } else {
                jsonData = try encoder.encode(message)
            }
            
            guard var jsonString = String(data: jsonData, encoding: .utf8) else {
                throw MessageParserError.encodingFailed(NSError(domain: "MessageParser", code: -1))
            }
            
            // Always append newline terminator (kkrpc protocol requirement)
            jsonString.append("\n")
            
            return jsonString
        } catch {
            throw MessageParserError.encodingFailed(error)
        }
    }
    
    // MARK: - Message Building
    
    /// Generate a unique message ID
    static func generateMessageId() -> String {
        // Match kkrpc format: 4-part hex UUID joined with `-`
        let parts = (0..<4).map { _ in
            String(format: "%04x", UInt16.random(in: 0...UInt16.max))
        }
        return parts.joined(separator: "-")
    }
    
    // MARK: - Buffer Handling
    
    /// Buffer for accumulating partial messages (for stream-based protocols)
    private var buffer: String = ""
    
    /// Process incoming data, buffering partial messages
    /// Returns complete messages when newline-terminated
    func processData(_ data: Data) -> [String] {
        guard let chunk = String(data: data, encoding: .utf8) else {
            return []
        }
        
        return processString(chunk)
    }
    
    /// Process incoming string, buffering partial messages
    /// Returns complete messages when newline-terminated
    func processString(_ chunk: String) -> [String] {
        buffer.append(chunk)
        
        var messages: [String] = []
        
        // Split on newlines
        while let newlineIndex = buffer.firstIndex(of: "\n") {
            let message = String(buffer[..<newlineIndex])
            buffer = String(buffer[buffer.index(after: newlineIndex)...])
            
            if !message.isEmpty {
                messages.append(message)
            }
        }
        
        return messages
    }
    
    /// Clear the buffer
    func clearBuffer() {
        buffer = ""
    }
    
    /// Check if there's buffered data
    var hasBufferedData: Bool {
        !buffer.isEmpty
    }
}
