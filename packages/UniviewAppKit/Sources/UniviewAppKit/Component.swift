import AppKit
import UniviewNativeCore

/// Executes a plugin event handler by id with serialized args (e.g. a click
/// or an input change). Injected by the host so components stay transport- and
/// bridge-agnostic — and so tests can assert firing without a live connection.
public typealias HandlerExecutor = @MainActor (String, [JSONValue]) -> Void

/// Context handed to a component during create/update.
@MainActor
public struct MountContext {
    public let executeHandler: HandlerExecutor

    public init(executeHandler: @escaping HandlerExecutor) {
        self.executeHandler = executeHandler
    }

    /// A no-op context for tests / previews that don't route events.
    public static let noop = MountContext { _, _ in }
}

/// A native component: creates the `NSView` for a node type and updates it
/// in place (surgically — never teardown/recreate) from a `ShadowNode`.
@MainActor
public protocol Component {
    /// Whether the mounter should mount this node's element children as
    /// subviews. Containers (`View`) return true; text-like leaves
    /// (`Text`/`Button`/`TextInput`) render their own content from props/text
    /// and return false. Defaults to true.
    var mountsChildren: Bool { get }
    /// Create a fresh native view for `node` (may inspect its style/props, e.g.
    /// to back a container with a native material).
    func makeView(for node: ShadowNode) -> NSView
    /// Apply `node`'s props/style/text to an existing view of this type.
    func update(_ view: NSView, node: ShadowNode, context: MountContext)
    /// The size this node wants when nothing sizes it — a text run's wrapped
    /// extent, a button's title plus its chrome, an icon's glyph box. Returned
    /// to the layout engine through `NodeMeasurer`. `maxWidth` may be
    /// `.infinity`. Containers have no intrinsic size and return nil (default).
    func intrinsicSize(_ node: ShadowNode, maxWidth: Double) -> Size?
}

extension Component {
    public var mountsChildren: Bool { true }
    public func intrinsicSize(_ node: ShadowNode, maxWidth: Double) -> Size? { nil }
}

/// The `NodeMeasurer` the host installs on the layout engine. It answers from the
/// component registry, so a node's intrinsic size is defined by the same
/// component that renders it — there is no second, parallel table of types.
@MainActor
public final class ComponentMeasurer: NodeMeasurer {
    private let registry: ComponentRegistry

    public init(registry: ComponentRegistry) {
        self.registry = registry
    }

    public func isExcludedFromLayout(_ node: ShadowNode) -> Bool {
        registry.isSurface(node.type)
    }

    public func isContentLeaf(_ node: ShadowNode) -> Bool {
        !registry.component(for: node.type).mountsChildren
    }

    public func measure(_ node: ShadowNode, maxWidth: Double) -> Size? {
        registry.component(for: node.type).intrinsicSize(node, maxWidth: maxWidth)
    }
}
