import Foundation

/// Reserved node type for text content (protocol v3). Text children are
/// explicit `#text` nodes carrying their content in `text`.
public let TEXT_NODE_TYPE = "#text"

/// The serializable UI tree node — the protocol-level representation of a UI
/// element, mirroring `@uniview/protocol`'s `UINode`.
///
/// - `id` is stable across re-renders (drives reconciliation).
/// - `type` is a component type, a layout tag, or `TEXT_NODE_TYPE`.
/// - `props` holds only JSON-serializable values.
/// - `children` are nested nodes; bare-string children (legacy) are
///   normalized into `#text` nodes on decode.
public struct UINode: Equatable, Sendable {
    public var id: String
    public var type: String
    public var props: [String: JSONValue]
    public var children: [UINode]
    /// Set only when `type == TEXT_NODE_TYPE`.
    public var text: String?

    public init(
        id: String,
        type: String,
        props: [String: JSONValue] = [:],
        children: [UINode] = [],
        text: String? = nil
    ) {
        self.id = id
        self.type = type
        self.props = props
        self.children = children
        self.text = text
    }

    /// Build a `#text` node with the given content.
    public static func text(_ content: String, id: String = "") -> UINode {
        UINode(id: id, type: TEXT_NODE_TYPE, props: [:], children: [], text: content)
    }

    public var isTextNode: Bool { type == TEXT_NODE_TYPE }

    /// The text content when this is a text node, else `nil`.
    public var textContent: String? { isTextNode ? (text ?? "") : nil }
}

extension UINode: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, type, props, children, text
    }

    /// A child entry that may arrive as a bare string or a full node object.
    private enum ChildEntry: Decodable {
        case node(UINode)
        case string(String)

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let string = try? container.decode(String.self) {
                self = .string(string)
            } else {
                self = .node(try container.decode(UINode.self))
            }
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.type = try container.decode(String.self, forKey: .type)
        self.props =
            try container.decodeIfPresent([String: JSONValue].self, forKey: .props) ?? [:]
        self.text = try container.decodeIfPresent(String.self, forKey: .text)
        let rawChildren =
            try container.decodeIfPresent([ChildEntry].self, forKey: .children) ?? []
        self.children = rawChildren.map { child in
            switch child {
            case .node(let node): return node
            case .string(let string): return UINode.text(string)
            }
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(type, forKey: .type)
        try container.encode(props, forKey: .props)
        try container.encode(children, forKey: .children)
        try container.encodeIfPresent(text, forKey: .text)
    }
}
