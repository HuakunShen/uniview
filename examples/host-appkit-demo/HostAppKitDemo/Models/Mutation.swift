import Foundation

// MARK: - Mutation

/// Incremental tree mutation matching @uniview/protocol's Mutation union.
enum Mutation: Decodable, Equatable {
    case appendChild(parentId: String, node: UINode)
    case insertBefore(parentId: String, node: UINode, beforeId: String)
    case removeChild(parentId: String, nodeId: String)
    case setText(parentId: String, childIndex: Int, text: String)
    case setProps(nodeId: String, props: [String: JSONValue])
    case setRoot(node: UINode?)

    private enum CodingKeys: String, CodingKey {
        case type
        case parentId
        case node
        case beforeId
        case nodeId
        case childIndex
        case text
        case props
    }

    private enum MutationType: String, Decodable {
        case appendChild
        case insertBefore
        case removeChild
        case setText
        case setProps
        case setRoot
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(MutationType.self, forKey: .type)

        switch type {
        case .appendChild:
            self = .appendChild(
                parentId: try container.decode(String.self, forKey: .parentId),
                node: try container.decode(UINode.self, forKey: .node)
            )

        case .insertBefore:
            self = .insertBefore(
                parentId: try container.decode(String.self, forKey: .parentId),
                node: try container.decode(UINode.self, forKey: .node),
                beforeId: try container.decode(String.self, forKey: .beforeId)
            )

        case .removeChild:
            self = .removeChild(
                parentId: try container.decode(String.self, forKey: .parentId),
                nodeId: try container.decode(String.self, forKey: .nodeId)
            )

        case .setText:
            self = .setText(
                parentId: try container.decode(String.self, forKey: .parentId),
                childIndex: try container.decode(Int.self, forKey: .childIndex),
                text: try container.decode(String.self, forKey: .text)
            )

        case .setProps:
            self = .setProps(
                nodeId: try container.decode(String.self, forKey: .nodeId),
                props: try container.decode([String: JSONValue].self, forKey: .props)
            )

        case .setRoot:
            self = .setRoot(node: try container.decodeIfPresent(UINode.self, forKey: .node))
        }
    }
}
