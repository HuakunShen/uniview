import Foundation

/// A computed layout box (absolute coordinates in the host's coordinate space).
/// Populated by the layout engine; consumed by the host when mounting views.
public struct LayoutRect: Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(x: Double = 0, y: Double = 0, width: Double = 0, height: Double = 0) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }

    public static let zero = LayoutRect()
}

/// A node in the shadow tree — the intermediate representation between the
/// serialized `UINode` and native views (Fabric-style).
///
/// Reference type: the tree is mutated in place by the reconciler and carries
/// stable `id`s for keyed diffing. It holds **no** platform view reference —
/// the AppKit host binds `NSView`s to nodes by `id` in its own layer, keeping
/// `UniviewNativeCore` portable.
public final class ShadowNode {
    public let id: String
    public var type: String
    public var props: [String: JSONValue]
    /// Resolved Style IR (decoded from `props["style"]`).
    public var style: StyleIR
    /// Text content when `type == TEXT_NODE_TYPE`.
    public var text: String?
    public private(set) weak var parent: ShadowNode?
    public private(set) var children: [ShadowNode]
    /// Computed layout, filled by the layout engine.
    public var layout: LayoutRect

    public init(
        id: String,
        type: String,
        props: [String: JSONValue] = [:],
        style: StyleIR = StyleIR(),
        text: String? = nil,
        children: [ShadowNode] = []
    ) {
        self.id = id
        self.type = type
        self.props = props
        self.style = style
        self.text = text
        self.children = children
        self.layout = .zero
        for child in children {
            child.parent = self
        }
    }

    public var isTextNode: Bool { type == TEXT_NODE_TYPE }

    /// Recursively build a shadow node from a serialized `UINode`, decoding
    /// the Style IR from `props["style"]` (absent/invalid → empty style).
    public static func from(_ node: UINode) -> ShadowNode {
        ShadowNode(
            id: node.id,
            type: node.type,
            props: node.props,
            style: resolveStyle(from: node.props),
            text: node.text,
            children: node.children.map(ShadowNode.from)
        )
    }

    static func resolveStyle(from props: [String: JSONValue]) -> StyleIR {
        guard let raw = props["style"], let style = try? raw.decode(StyleIR.self) else {
            return StyleIR()
        }
        return style
    }
}
