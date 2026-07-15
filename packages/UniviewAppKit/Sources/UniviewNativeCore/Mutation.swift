import Foundation

/// A single change to the UI tree. Mirrors `@uniview/protocol`'s `Mutation`
/// union. `appendChild`/`insertBefore` carry the full serialized subtree in
/// `node` and must be treated as a MOVE when the node already exists.
public enum Mutation: Equatable, Sendable {
    case appendChild(parentId: String, node: UINode)
    case insertBefore(parentId: String, node: UINode, beforeId: String)
    case removeChild(parentId: String, nodeId: String)
    case setText(nodeId: String, text: String)
    case setProps(nodeId: String, props: [String: JSONValue])
    case setRoot(node: UINode?)
}

extension Mutation: Codable {
    private enum CodingKeys: String, CodingKey {
        case type, parentId, node, beforeId, nodeId, text, props
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "appendChild":
            self = .appendChild(
                parentId: try container.decode(String.self, forKey: .parentId),
                node: try container.decode(UINode.self, forKey: .node)
            )
        case "insertBefore":
            self = .insertBefore(
                parentId: try container.decode(String.self, forKey: .parentId),
                node: try container.decode(UINode.self, forKey: .node),
                beforeId: try container.decode(String.self, forKey: .beforeId)
            )
        case "removeChild":
            self = .removeChild(
                parentId: try container.decode(String.self, forKey: .parentId),
                nodeId: try container.decode(String.self, forKey: .nodeId)
            )
        case "setText":
            self = .setText(
                nodeId: try container.decode(String.self, forKey: .nodeId),
                text: try container.decode(String.self, forKey: .text)
            )
        case "setProps":
            self = .setProps(
                nodeId: try container.decode(String.self, forKey: .nodeId),
                props: try container.decode([String: JSONValue].self, forKey: .props)
            )
        case "setRoot":
            self = .setRoot(node: try container.decodeIfPresent(UINode.self, forKey: .node))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown mutation type: \(type)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .appendChild(let parentId, let node):
            try container.encode("appendChild", forKey: .type)
            try container.encode(parentId, forKey: .parentId)
            try container.encode(node, forKey: .node)
        case .insertBefore(let parentId, let node, let beforeId):
            try container.encode("insertBefore", forKey: .type)
            try container.encode(parentId, forKey: .parentId)
            try container.encode(node, forKey: .node)
            try container.encode(beforeId, forKey: .beforeId)
        case .removeChild(let parentId, let nodeId):
            try container.encode("removeChild", forKey: .type)
            try container.encode(parentId, forKey: .parentId)
            try container.encode(nodeId, forKey: .nodeId)
        case .setText(let nodeId, let text):
            try container.encode("setText", forKey: .type)
            try container.encode(nodeId, forKey: .nodeId)
            try container.encode(text, forKey: .text)
        case .setProps(let nodeId, let props):
            try container.encode("setProps", forKey: .type)
            try container.encode(nodeId, forKey: .nodeId)
            try container.encode(props, forKey: .props)
        case .setRoot(let node):
            try container.encode("setRoot", forKey: .type)
            try container.encodeIfPresent(node, forKey: .node)
        }
    }
}

/// A revisioned batch of mutations (Fabric-style commit). `revision` is a
/// monotonic counter minted by the emitter; hosts apply batches in order and
/// may treat a re-delivered revision as an idempotent no-op or drift signal.
public struct CommitBatch: Equatable, Sendable, Codable {
    public var revision: Int
    public var mutations: [Mutation]

    public init(revision: Int, mutations: [Mutation]) {
        self.revision = revision
        self.mutations = mutations
    }
}
