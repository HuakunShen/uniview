import Foundation

// MARK: - JSONValue

/// Represents any valid JSON value for cross-boundary serialization
enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        
        if container.decodeNil() {
            self = .null
            return
        }
        
        if let boolValue = try? container.decode(Bool.self) {
            self = .bool(boolValue)
            return
        }
        
        if let numberValue = try? container.decode(Double.self) {
            self = .number(numberValue)
            return
        }
        
        if let stringValue = try? container.decode(String.self) {
            self = .string(stringValue)
            return
        }
        
        if let arrayValue = try? container.decode([JSONValue].self) {
            self = .array(arrayValue)
            return
        }
        
        if let objectValue = try? container.decode([String: JSONValue].self) {
            self = .object(objectValue)
            return
        }
        
        throw DecodingError.typeMismatch(
            JSONValue.self,
            DecodingError.Context(
                codingPath: decoder.codingPath,
                debugDescription: "Cannot decode JSONValue"
            )
        )
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        
        switch self {
        case .null:
            try container.encodeNil()
        case .bool(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        }
    }
    
    // MARK: - Convenience accessors
    
    var boolValue: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }
    
    var numberValue: Double? {
        if case .number(let value) = self { return value }
        return nil
    }
    
    var intValue: Int? {
        if case .number(let value) = self { return Int(value) }
        return nil
    }
    
    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }
    
    var arrayValue: [JSONValue]? {
        if case .array(let value) = self { return value }
        return nil
    }
    
    var objectValue: [String: JSONValue]? {
        if case .object(let value) = self { return value }
        return nil
    }
    
    var isNull: Bool {
        if case .null = self { return true }
        return false
    }
}

// MARK: - UINodeChild

/// Represents a child of UINode - either a nested node or text content
enum UINodeChild: Codable, Equatable {
    case node(UINode)
    case text(String)
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        
        // Try decoding as a string first (text child)
        if let stringValue = try? container.decode(String.self) {
            self = .text(stringValue)
            return
        }
        
        // Try decoding as UINode (has "type" key)
        if let nodeValue = try? container.decode(UINode.self) {
            self = .node(nodeValue)
            return
        }
        
        throw DecodingError.typeMismatch(
            UINodeChild.self,
            DecodingError.Context(
                codingPath: decoder.codingPath,
                debugDescription: "UINodeChild must be either a string or a UINode object"
            )
        )
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        
        switch self {
        case .node(let node):
            try container.encode(node)
        case .text(let text):
            try container.encode(text)
        }
    }
}

// MARK: - UINode

/// Core UI node structure for the serializable component tree
/// Matches the TypeScript UINode interface from @uniview/protocol
struct UINode: Codable, Equatable {
    /// Unique identifier for this node (for reconciliation)
    let id: String
    
    /// Component type - layout tag OR product-defined primitive
    let type: String
    
    /// Props object with only JSON-serializable values
    let props: [String: JSONValue]
    
    /// Child nodes or text content
    let children: [UINodeChild]
    
    enum CodingKeys: String, CodingKey {
        case id
        case type
        case props
        case children
    }
    
    init(id: String, type: String, props: [String: JSONValue] = [:], children: [UINodeChild] = []) {
        self.id = id
        self.type = type
        self.props = props
        self.children = children
    }
}

// MARK: - UINode Extensions

extension UINode {
    /// Extract a handler ID prop for a given event name
    /// Convention: onClick -> _onClickHandlerId
    func handlerId(for eventName: String) -> String? {
        let propName = "_\(eventName)HandlerId"
        return props[propName]?.stringValue
    }
    
    /// Check if this node is a layout tag (HTML-like element)
    var isLayoutTag: Bool {
        UINode.layoutTags.contains(type)
    }
    
    /// List of built-in layout tags that hosts must support
    static let layoutTags: Set<String> = [
        "div", "span", "p", "section", "header", "footer", "nav", "main",
        "aside", "article", "ul", "ol", "li", "br", "hr",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "button", "input", "textarea", "select", "option", "label", "form",
        "a", "img", "table", "thead", "tbody", "tr", "th", "td",
        "strong", "em", "code", "pre"
    ]
}
